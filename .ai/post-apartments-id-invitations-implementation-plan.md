# API Endpoint Implementation Plan: POST /api/apartments/:id/invitations

## 1. Przegląd punktu końcowego

Endpoint generuje jednorazowy link zapraszający dla lokatora do określonego mieszkania. Dostępny tylko dla właścicieli mieszkań. Po utworzeniu nowego linku, wszystkie poprzednie linki dla tego mieszkania otrzymują status 'expired'.

**Kluczowe cechy:**
- Generowanie unikalnego tokenu (UUID v4)
- Automatyczne wygaszanie poprzednich zaproszeń
- Walidacja czy mieszkanie nie ma aktywnego lokatora
- Zwraca pełny URL zaproszenia gotowy do wysłania

## 2. Szczegóły żądania

- **Metoda HTTP:** POST
- **Struktura URL:** `/api/apartments/:id/invitations`
- **Parametry:**
  - **Wymagane:**
    - `id` (path param, UUID) - ID mieszkania
  - **Opcjonalne:** brak
- **Request Body:** brak (pusty POST)
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagany)

## 3. Wykorzystywane typy

**DTOs:**
```typescript
// Response type
export type CreateInvitationResponseDTO = Pick<
  Tables<'invitation_links'>,
  'id' | 'apartment_id' | 'token' | 'status' | 'created_at'
> & {
  invitation_url: string;
};
```

**Validation Schema (Zod):**
```typescript
const CreateInvitationParamsSchema = z.object({
  id: z.string().uuid({ message: 'Nieprawidłowy format ID mieszkania' })
});
```

## 4. Szczegóły odpowiedzi

### Success Response (201 Created):
```json
{
  "id": "uuid",
  "apartment_id": "uuid",
  "token": "unique-token-string",
  "status": "pending",
  "invitation_url": "https://rentflow.pl/register/tenant?token=unique-token-string",
  "created_at": "2025-01-12T10:00:00Z"
}
```

### Error Responses:

**400 Bad Request - Mieszkanie ma aktywnego lokatora:**
```json
{
  "error": "Bad Request",
  "message": "To mieszkanie ma już aktywnego lokatora"
}
```

**403 Forbidden - Użytkownik nie jest właścicielem:**
```json
{
  "error": "Forbidden",
  "message": "Nie masz uprawnień do zapraszania lokatorów do tego mieszkania"
}
```

**404 Not Found - Mieszkanie nie istnieje:**
```json
{
  "error": "Not Found",
  "message": "Mieszkanie nie zostało znalezione"
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

1. **Walidacja path params** - parsowanie i walidacja `apartmentId`
2. **Pobranie user z context.locals** - sprawdzenie autoryzacji
3. **Weryfikacja właściciela:**
   ```sql
   SELECT id FROM apartments
   WHERE id = $1 AND owner_id = auth.uid()
   ```
   Jeśli brak wyników → 403 lub 404

4. **Sprawdzenie aktywnego lokatora:**
   ```sql
   SELECT id FROM leases
   WHERE apartment_id = $1 AND status = 'active'
   ```
   Jeśli istnieje → 400 (mieszkanie ma aktywnego lokatora)

5. **Wygaszenie poprzednich zaproszeń:**
   ```sql
   UPDATE invitation_links
   SET status = 'expired'
   WHERE apartment_id = $1 AND status = 'pending'
   ```

6. **Generowanie tokenu:**
   ```typescript
   const token = crypto.randomUUID();
   ```

7. **Utworzenie nowego zaproszenia:**
   ```sql
   INSERT INTO invitation_links (apartment_id, token, status, created_by)
   VALUES ($1, $2, 'pending', auth.uid())
   RETURNING *
   ```

8. **Budowanie invitation_url:**
   ```typescript
   const invitationUrl = `${PUBLIC_APP_URL}/register/tenant?token=${token}`;
   ```

9. **Zwrócenie odpowiedzi** jako `CreateInvitationResponseDTO`

## 6. Względy bezpieczeństwa

### Autoryzacja:
- **Wymagany JWT token** - sprawdzenie przez middleware Astro
- **RLS Policy** automatycznie weryfikuje że user jest właścicielem:
  ```sql
  EXISTS (
    SELECT 1 FROM apartments
    WHERE apartments.id = invitation_links.apartment_id
      AND apartments.owner_id = auth.uid()
  )
  ```

### Generowanie tokenu:
- **UUID v4** zapewnia unikalność i nieprzewidywalność
- Token nie zawiera żadnych informacji o mieszkaniu lub właścicielu
- Token jednorazowy (po akceptacji status → 'accepted')

### Walidacja:
- Walidacja UUID dla apartmentId (zapobieganie SQL injection)
- Sprawdzenie istnienia mieszkania PRZED generowaniem tokenu

### Data exposure:
- Response zawiera tylko niezbędne informacje
- Nie ujawnia informacji o właścicielu w URL
- Token jest opakiem identyfikatorem

### Rate limiting:
- Supabase built-in rate limiting (100 req/s per IP)
- Rozważyć dodatkowy limit dla tego endpointu (np. 5 zaproszeń/min per user)

## 7. Obsługa błędów

### Scenariusze błędów:

| Kod | Scenariusz | Response |
|-----|-----------|----------|
| 400 | Nieprawidłowy format apartmentId | `{ "error": "Validation Error", "message": "Nieprawidłowy format ID mieszkania" }` |
| 400 | Mieszkanie ma aktywnego lokatora | `{ "error": "Bad Request", "message": "To mieszkanie ma już aktywnego lokatora" }` |
| 401 | Brak tokenu JWT lub token nieprawidłowy | `{ "error": "Unauthorized", "message": "Brak autoryzacji" }` |
| 403 | Użytkownik nie jest właścicielem | `{ "error": "Forbidden", "message": "Nie masz uprawnień do zapraszania lokatorów do tego mieszkania" }` |
| 404 | Mieszkanie nie istnieje | `{ "error": "Not Found", "message": "Mieszkanie nie zostało znalezione" }` |
| 500 | Błąd połączenia z bazą danych | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` |
| 500 | Błąd podczas generowania tokenu | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` |

### Logging:
```typescript
console.error('POST /api/apartments/:id/invitations error:', {
  userId: user.id,
  apartmentId: params.id,
  error: error.message,
  stack: error.stack
});
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje:

1. **Indeksy bazy danych:**
   - `idx_apartments_owner_id` - dla weryfikacji właściciela
   - `idx_leases_apartment_id` - dla sprawdzenia aktywnego lokatora
   - `idx_leases_status` - dla filtrowania active leases
   - `idx_invitation_links_apartment_id` - dla wygaszania poprzednich zaproszeń
   - `idx_invitation_links_status` - dla filtrowania pending invitations

2. **Transakcja:**
   - Operacje UPDATE (wygaszenie) i INSERT (nowe zaproszenie) powinny być w jednej transakcji
   - Zapobiega race conditions

3. **UUID generation:**
   - `crypto.randomUUID()` jest szybkie i bezpieczne
   - Generowane po stronie aplikacji (nie obciąża DB)

### Potencjalne wąskie gardła:

- **Race condition** - dwóch właścicieli jednocześnie tworzy zaproszenie
  - Rozwiązanie: unique constraint na token
- **Cascade updates** - wygaszanie wielu starych zaproszeń
  - W MVP: mało prawdopodobne (1 mieszkanie = 1 aktywne zaproszenie zazwyczaj)

## 9. Etapy wdrożenia

### Krok 1: Utworzenie validation schema
```typescript
// src/lib/validation/invitations.validation.ts
import { z } from 'zod';

export const CreateInvitationParamsSchema = z.object({
  id: z.string().uuid({ message: 'Nieprawidłowy format ID mieszkania' })
});
```

### Krok 2: Utworzenie invitation service
```typescript
// src/lib/services/invitation.service.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type { CreateInvitationResponseDTO } from '@/types';

export class InvitationService {
  constructor(private supabase: SupabaseClient) {}

  async createInvitation(
    apartmentId: string,
    userId: string
  ): Promise<CreateInvitationResponseDTO> {
    // 1. Verify ownership
    // 2. Check for active lease
    // 3. Expire previous invitations
    // 4. Generate token
    // 5. Insert new invitation
    // 6. Build invitation URL
    // 7. Return DTO
  }

  async hasActiveLease(apartmentId: string): Promise<boolean> {
    // Check if apartment has active lease
  }

  async expirePreviousInvitations(apartmentId: string): Promise<void> {
    // Set status='expired' for all pending invitations
  }
}
```

### Krok 3: Implementacja API route
```typescript
// src/pages/api/apartments/[id]/invitations.ts
import type { APIContext } from 'astro';
import { CreateInvitationParamsSchema } from '@/lib/validation/invitations.validation';
import { InvitationService } from '@/lib/services/invitation.service';

export const prerender = false;

export async function POST(context: APIContext) {
  try {
    // 1. Get user from context.locals
    const user = context.locals.user;
    if (!user) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Brak autoryzacji'
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Validate params
    const params = CreateInvitationParamsSchema.parse(context.params);

    // 3. Call service
    const supabase = context.locals.supabase;
    const invitationService = new InvitationService(supabase);
    const invitation = await invitationService.createInvitation(
      params.id,
      user.id
    );

    // 4. Return response
    return new Response(JSON.stringify(invitation), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // Error handling
  }
}
```

### Krok 4: Implementacja metod serwisu

**createInvitation:**
1. Weryfikacja właściciela (query apartments WHERE id = $1 AND owner_id = $2)
2. Sprawdzenie aktywnego lease (hasActiveLease)
3. Wygaszenie poprzednich zaproszeń (expirePreviousInvitations)
4. Generowanie tokenu (crypto.randomUUID())
5. Insert do invitation_links
6. Budowanie invitation_url
7. Zwrot DTO

**hasActiveLease:**
1. Query: SELECT id FROM leases WHERE apartment_id = $1 AND status = 'active'
2. Return: boolean (czy znaleziono wyniki)

**expirePreviousInvitations:**
1. UPDATE invitation_links SET status = 'expired' WHERE apartment_id = $1 AND status = 'pending'

### Krok 5: Obsługa błędów w serwisie

```typescript
// Weryfikacja właściciela
const { data: apartment, error: apartmentError } = await this.supabase
  .from('apartments')
  .select('id')
  .eq('id', apartmentId)
  .eq('owner_id', userId)
  .single();

if (apartmentError || !apartment) {
  throw new Error('NOT_FOUND'); // Handle as 404 in route
}

// Sprawdzenie aktywnego lease
const hasLease = await this.hasActiveLease(apartmentId);
if (hasLease) {
  throw new Error('ACTIVE_LEASE'); // Handle as 400 in route
}
```

### Krok 6: Obsługa błędów w route

```typescript
catch (error) {
  if (error instanceof z.ZodError) {
    return new Response(
      JSON.stringify({
        error: 'Validation Error',
        message: 'Nieprawidłowy format ID mieszkania',
        details: error.flatten()
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (error.message === 'NOT_FOUND') {
    return new Response(
      JSON.stringify({
        error: 'Not Found',
        message: 'Mieszkanie nie zostało znalezione'
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (error.message === 'ACTIVE_LEASE') {
    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        message: 'To mieszkanie ma już aktywnego lokatora'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.error('POST /api/apartments/:id/invitations error:', error);
  return new Response(
    JSON.stringify({
      error: 'Internal Server Error',
      message: 'Wystąpił błąd serwera'
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}
```

### Krok 7: Testy
1. Test tworzenia zaproszenia dla właściciela
2. Test 403 dla nie-właściciela
3. Test 404 dla nieistniejącego mieszkania
4. Test 400 dla mieszkania z aktywnym lokatorem
5. Test wygaszania poprzednich zaproszeń
6. Test unikalności tokenu
7. Test formatu invitation_url
8. Test walidacji apartmentId (invalid UUID)

### Krok 8: Dokumentacja
1. JSDoc dla funkcji serwisu
2. Komentarze w kodzie dla business logic
3. Przykłady użycia w dokumentacji API

---

**Priorytet:** Wysoki (kluczowa funkcjonalność onboardingu)
**Szacowany czas:** 3-4 godziny
**Zależności:** Middleware autoryzacji, typy DTO, apartment ownership verification
