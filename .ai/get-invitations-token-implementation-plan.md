# API Endpoint Implementation Plan: GET /api/invitations/:token

## 1. Przegląd punktu końcowego

Endpoint waliduje token zaproszenia i zwraca informacje o mieszkaniu oraz właścicielu. Jest to **publiczny endpoint** (nie wymaga autoryzacji), używany podczas procesu rejestracji lokatora. Pozwala przyszłemu lokatorowi zobaczyć szczegóły mieszkania przed rejestracją.

**Kluczowe cechy:**
- Publiczny dostęp (brak wymaganej autoryzacji)
- Walidacja tokenu (pending, accepted, expired)
- Zwraca informacje o mieszkaniu i właścicielu
- Używany w procesie tenant registration flow

## 2. Szczegóły żądania

- **Metoda HTTP:** GET
- **Struktura URL:** `/api/invitations/:token`
- **Parametry:**
  - **Wymagane:**
    - `token` (path param, string) - token zaproszenia
  - **Opcjonalne:** brak
- **Request Body:** nie dotyczy (GET)
- **Headers:**
  - Brak wymaganych headers (publiczny endpoint)

## 3. Wykorzystywane typy

**DTOs:**
```typescript
// Response type
export type ValidateInvitationDTO = {
  valid: boolean;
  apartment: Pick<Tables<'apartments'>, 'name' | 'address'>;
  owner: Pick<Tables<'users'>, 'full_name'>;
};
```

**Validation Schema (Zod):**
```typescript
const ValidateInvitationParamsSchema = z.object({
  token: z.string().min(1, { message: 'Token jest wymagany' })
});
```

## 4. Szczegóły odpowiedzi

### Success Response (200 OK) - Valid token:
```json
{
  "valid": true,
  "apartment": {
    "name": "Kawalerka na Woli",
    "address": "ul. Złota 44, Warszawa"
  },
  "owner": {
    "full_name": "Jan Kowalski"
  }
}
```

### Error Responses:

**400 Bad Request - Token wygasły lub wykorzystany:**
```json
{
  "error": "Invalid Token",
  "message": "Ten link zapraszający wygasł lub został już wykorzystany"
}
```

**400 Bad Request - Token nie istnieje:**
```json
{
  "error": "Invalid Token",
  "message": "Ten link zapraszający wygasł lub został już wykorzystany"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal Server Error",
  "message": "Wystąpił błąd serwera"
}
```

## 5. Przepływ danych

### Główny przepływ:

1. **Walidacja path params** - parsowanie `token`
2. **Pobranie invitation wraz z danymi mieszkania i właściciela:**
   ```sql
   SELECT
     il.id,
     il.status,
     a.name as apartment_name,
     a.address as apartment_address,
     u.full_name as owner_name
   FROM invitation_links il
   JOIN apartments a ON a.id = il.apartment_id
   JOIN users u ON u.id = a.owner_id
   WHERE il.token = $1
   ```

3. **Walidacja statusu tokenu:**
   - Jeśli status != 'pending' → 400 (Invalid Token)
   - Jeśli brak wyników → 400 (Invalid Token)

4. **Zwrócenie odpowiedzi** jako `ValidateInvitationDTO` z `valid: true`

### Przypadek błędu:
- Token nie istnieje lub status != 'pending' → 400 z tym samym komunikatem (security przez obfuscation)

## 6. Względy bezpieczeństwa

### Autoryzacja:
- **Brak wymaganej autoryzacji** - endpoint publiczny
- **RLS Policy** dla `anon` role:
  ```sql
  CREATE POLICY "Anyone can view invitation link by token"
    ON invitation_links FOR SELECT
    TO anon
    USING (TRUE);
  ```

### Bezpieczeństwo tokenu:
- **Nie ujawniaj czy token istnieje** - ten sam komunikat dla expired/accepted/nieistniejącego
- **UUID v4 token** - trudny do zgadnięcia (2^122 możliwości)
- **Jednorazowy** - po accepted, validation zwraca Invalid Token
- **Token nie zawiera danych** - czysto losowy identyfikator

### Data exposure:
- **Minimalne dane** - tylko nazwa i adres mieszkania, imię właściciela
- **Brak email właściciela** - ochrona prywatności
- **Brak ID** - nie ujawniamy UUID mieszkania czy właściciela

### Rate limiting:
- **Ważne!** Ten endpoint podatny na brute-force
- Supabase built-in rate limiting (100 req/s per IP)
- **Rozważyć:** dodatkowy rate limit na poziomie aplikacji (np. 10 req/min per IP)

### Timing attacks:
- **Stała odpowiedź** - ten sam czas odpowiedzi dla valid/invalid token (jeśli możliwe)

## 7. Obsługa błędów

### Scenariusze błędów:

| Kod | Scenariusz | Response |
|-----|-----------|----------|
| 400 | Token pusty | `{ "error": "Validation Error", "message": "Token jest wymagany" }` |
| 400 | Token nie istnieje | `{ "error": "Invalid Token", "message": "Ten link zapraszający wygasł lub został już wykorzystany" }` |
| 400 | Token ma status 'expired' | `{ "error": "Invalid Token", "message": "Ten link zapraszający wygasł lub został już wykorzystany" }` |
| 400 | Token ma status 'accepted' | `{ "error": "Invalid Token", "message": "Ten link zapraszający wygasł lub został już wykorzystany" }` |
| 500 | Błąd połączenia z bazą danych | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` |

### Logging:
```typescript
// NIE loguj tokenu w całości (security)
console.error('GET /api/invitations/:token error:', {
  tokenPrefix: token.substring(0, 8), // tylko pierwsze 8 znaków
  error: error.message,
  stack: error.stack
});
```

**WAŻNE:** Nie loguj pełnego tokenu - może być wrażliwy!

## 8. Rozważania dotyczące wydajności

### Optymalizacje:

1. **Indeksy bazy danych:**
   - `idx_invitation_links_token` (UNIQUE) - dla szybkiego lookup
   - Index jest wymagany dla walidacji unikalności

2. **Single query:**
   - Wszystkie dane (invitation + apartment + owner) w jednym query
   - JOIN zamiast osobnych zapytań

3. **Brak autoryzacji:**
   - Szybsza odpowiedź (brak weryfikacji JWT)
   - Mniej obciążenie dla Supabase Auth

### Potencjalne wąskie gardła:

- **Brute-force attacks** - próba zgadywania tokenów
  - Mitigacja: rate limiting, długie UUID v4
- **DDoS** - endpoint publiczny, podatny na nadużycia
  - Mitigacja: Supabase rate limiting, CloudFlare (post-MVP)

## 9. Etapy wdrożenia

### Krok 1: Utworzenie validation schema
```typescript
// src/lib/validation/invitations.validation.ts
import { z } from 'zod';

export const ValidateInvitationParamsSchema = z.object({
  token: z.string().min(1, { message: 'Token jest wymagany' })
});
```

### Krok 2: Rozszerzenie invitation service
```typescript
// src/lib/services/invitation.service.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type { ValidateInvitationDTO } from '@/types';

export class InvitationService {
  constructor(private supabase: SupabaseClient) {}

  // ... existing methods ...

  async validateInvitationToken(
    token: string
  ): Promise<ValidateInvitationDTO> {
    // 1. Fetch invitation with apartment and owner data
    // 2. Check if exists and status = 'pending'
    // 3. Return ValidateInvitationDTO or throw error
  }
}
```

### Krok 3: Implementacja API route
```typescript
// src/pages/api/invitations/[token].ts
import type { APIContext } from 'astro';
import { ValidateInvitationParamsSchema } from '@/lib/validation/invitations.validation';
import { InvitationService } from '@/lib/services/invitation.service';

export const prerender = false;

export async function GET(context: APIContext) {
  try {
    // 1. Validate params
    const params = ValidateInvitationParamsSchema.parse(context.params);

    // 2. Call service (use anon supabase client)
    const supabase = context.locals.supabase;
    const invitationService = new InvitationService(supabase);
    const validation = await invitationService.validateInvitationToken(
      params.token
    );

    // 3. Return response
    return new Response(JSON.stringify(validation), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // Error handling
  }
}
```

### Krok 4: Implementacja metody serwisu

**validateInvitationToken:**
```typescript
async validateInvitationToken(
  token: string
): Promise<ValidateInvitationDTO> {
  // 1. Fetch invitation with JOINs
  const { data: invitation, error } = await this.supabase
    .from('invitation_links')
    .select(`
      id,
      status,
      apartment:apartments (
        name,
        address,
        owner:users!owner_id (
          full_name
        )
      )
    `)
    .eq('token', token)
    .single();

  // 2. Validate
  if (error || !invitation || invitation.status !== 'pending') {
    throw new Error('INVALID_TOKEN');
  }

  // 3. Return DTO
  return {
    valid: true,
    apartment: {
      name: invitation.apartment.name,
      address: invitation.apartment.address
    },
    owner: {
      full_name: invitation.apartment.owner.full_name
    }
  };
}
```

### Krok 5: Obsługa błędów w route

```typescript
catch (error) {
  if (error instanceof z.ZodError) {
    return new Response(
      JSON.stringify({
        error: 'Validation Error',
        message: 'Token jest wymagany'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (error.message === 'INVALID_TOKEN') {
    return new Response(
      JSON.stringify({
        error: 'Invalid Token',
        message: 'Ten link zapraszający wygasł lub został już wykorzystany'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Log error without full token
  console.error('GET /api/invitations/:token error:', {
    tokenPrefix: context.params.token?.substring(0, 8),
    error: error.message
  });

  return new Response(
    JSON.stringify({
      error: 'Internal Server Error',
      message: 'Wystąpił błąd serwera'
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}
```

### Krok 6: RLS Policy dla anon access

**WAŻNE:** Sprawdzić czy RLS policy dla `anon` role już istnieje:

```sql
-- W pliku migracji DB
CREATE POLICY "Anyone can view invitation link by token"
  ON invitation_links FOR SELECT
  TO anon
  USING (TRUE);

COMMENT ON POLICY "Anyone can view invitation link by token"
  ON invitation_links IS
  'Publiczny dostęp do walidacji tokenów podczas rejestracji lokatora';
```

### Krok 7: Testy
1. Test walidacji pending token (success)
2. Test 400 dla expired token
3. Test 400 dla accepted token
4. Test 400 dla nieistniejącego token
5. Test 400 dla pustego token
6. Test czy zwraca poprawne dane apartment i owner
7. Test czy NIE ujawnia email właściciela
8. Test rate limiting (manual)
9. Test braku wymaganej autoryzacji

### Krok 8: Security review
1. Sprawdzić czy token nie jest logowany w całości
2. Sprawdzić timing attacks (constant time response)
3. Sprawdzić rate limiting
4. Sprawdzić RLS policy dla anon role
5. Sprawdzić czy response jest taki sam dla wszystkich invalid tokens

### Krok 9: Dokumentacja
1. JSDoc dla funkcji serwisu
2. Komentarze o security considerations
3. Przykłady użycia w tenant registration flow
4. Dokumentacja error responses

---

**Priorytet:** Wysoki (kluczowy dla tenant registration)
**Szacowany czas:** 2-3 godziny
**Zależności:** RLS policy dla anon role, InvitationService
**Security concerns:** Publiczny endpoint, podatny na brute-force
