# API Endpoint Implementation Plan: GET /api/apartments/:id/invitations

## 1. Przegląd punktu końcowego

Endpoint zwraca listę wszystkich linków zapraszających (pending, accepted, expired) dla określonego mieszkania. Dostępny tylko dla właścicieli mieszkań. Umożliwia śledzenie historii zaproszeń i ich statusów.

**Kluczowe cechy:**
- Lista wszystkich zaproszeń (wszystkie statusy)
- Informacja o użytkowniku który zaakceptował (jeśli accepted)
- Sortowanie od najnowszych
- Tylko dla właściciela mieszkania

## 2. Szczegóły żądania

- **Metoda HTTP:** GET
- **Struktura URL:** `/api/apartments/:id/invitations`
- **Parametry:**
  - **Wymagane:**
    - `id` (path param, UUID) - ID mieszkania
  - **Opcjonalne:** brak
- **Request Body:** nie dotyczy (GET)
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagany)

## 3. Wykorzystywane typy

**DTOs:**
```typescript
// Response type
export type InvitationListDTO = {
  invitations: InvitationListItemDTO[];
};

// List item
export type InvitationListItemDTO = Pick<
  Tables<'invitation_links'>,
  'id' | 'token' | 'status' | 'created_at'
> & {
  accepted_by?: AcceptedByInfo;
};

// Helper type
export type AcceptedByInfo = Pick<Tables<'users'>, 'id' | 'full_name'>;
```

**Validation Schema (Zod):**
```typescript
const GetInvitationsParamsSchema = z.object({
  id: z.string().uuid({ message: 'Nieprawidłowy format ID mieszkania' })
});
```

## 4. Szczegóły odpowiedzi

### Success Response (200 OK):
```json
{
  "invitations": [
    {
      "id": "uuid",
      "token": "unique-token-string",
      "status": "accepted",
      "accepted_by": {
        "id": "uuid",
        "full_name": "Anna Kowalska"
      },
      "created_at": "2025-01-12T10:00:00Z"
    },
    {
      "id": "uuid",
      "token": "another-token",
      "status": "expired",
      "created_at": "2025-01-10T10:00:00Z"
    },
    {
      "id": "uuid",
      "token": "pending-token",
      "status": "pending",
      "created_at": "2025-01-15T10:00:00Z"
    }
  ]
}
```

### Error Responses:

**403 Forbidden - Użytkownik nie jest właścicielem:**
```json
{
  "error": "Forbidden",
  "message": "Nie masz uprawnień do przeglądania zaproszeń dla tego mieszkania"
}
```

**404 Not Found - Mieszkanie nie istnieje:**
```json
{
  "error": "Not Found",
  "message": "Mieszkanie nie zostało znalezione"
}
```

**401 Unauthorized:**
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
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

4. **Pobranie listy zaproszeń:**
   ```sql
   SELECT
     il.id,
     il.token,
     il.status,
     il.created_at,
     u.id as accepted_by_id,
     u.full_name as accepted_by_name
   FROM invitation_links il
   LEFT JOIN users u ON u.id = il.accepted_by
   WHERE il.apartment_id = $1
   ORDER BY il.created_at DESC
   ```

5. **Transformacja danych** - mapowanie wyników do `InvitationListItemDTO[]`
6. **Zwrócenie odpowiedzi** jako `InvitationListDTO`

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

### Data exposure:
- **Token widoczny** - właściciel widzi pełny token (może go skopiować)
- **Accepted_by** - tylko ID i imię lokatora (bez email dla prywatności)
- Nie ujawnia żadnych wrażliwych danych

### Walidacja:
- Walidacja UUID dla apartmentId (zapobieganie SQL injection)
- Sprawdzenie istnienia mieszkania PRZED pobraniem zaproszeń

### Rate limiting:
- Supabase built-in rate limiting (100 req/s per IP)

## 7. Obsługa błędów

### Scenariusze błędów:

| Kod | Scenariusz | Response |
|-----|-----------|----------|
| 400 | Nieprawidłowy format apartmentId | `{ "error": "Validation Error", "message": "Nieprawidłowy format ID mieszkania" }` |
| 401 | Brak tokenu JWT lub token nieprawidłowy | `{ "error": "Unauthorized", "message": "Brak autoryzacji" }` |
| 403 | Użytkownik nie jest właścicielem | `{ "error": "Forbidden", "message": "Nie masz uprawnień do przeglądania zaproszeń dla tego mieszkania" }` |
| 404 | Mieszkanie nie istnieje | `{ "error": "Not Found", "message": "Mieszkanie nie zostało znalezione" }` |
| 500 | Błąd połączenia z bazą danych | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` |
| 500 | Błąd podczas transformacji danych | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` |

### Logging:
```typescript
console.error('GET /api/apartments/:id/invitations error:', {
  userId: user.id,
  apartmentId: params.id,
  error: error.message,
  stack: error.stack
});
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje:

1. **Indeksy bazy danych:**
   - `idx_invitation_links_apartment_id` - dla filtrowania po apartment_id
   - `idx_invitation_links_status` - dla filtrowania po status (jeśli w przyszłości)
   - Index na `created_at DESC` dla sortowania

2. **LEFT JOIN optimization:**
   - LEFT JOIN z users tylko gdy accepted_by IS NOT NULL
   - W większości przypadków będzie tylko 1-2 zaproszenia per mieszkanie

3. **Limit wyników:**
   - Dla MVP: brak limitu (oczekiwana mała liczba zaproszeń)
   - Post-MVP: rozważyć pagination jeśli liczba zaproszeń rośnie

### Potencjalne wąskie gardła:

- **N+1 queries** - unikamy poprzez LEFT JOIN zamiast osobnych zapytań
- **Large datasets** - mało prawdopodobne w MVP (jedno mieszkanie = kilka zaproszeń max)

## 9. Etapy wdrożenia

### Krok 1: Wykorzystanie istniejącej walidacji
```typescript
// src/lib/validation/invitations.validation.ts
// Reuse from POST endpoint
export const GetInvitationsParamsSchema = z.object({
  id: z.string().uuid({ message: 'Nieprawidłowy format ID mieszkania' })
});
```

### Krok 2: Rozszerzenie invitation service
```typescript
// src/lib/services/invitation.service.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type { InvitationListDTO, InvitationListItemDTO } from '@/types';

export class InvitationService {
  constructor(private supabase: SupabaseClient) {}

  // ... existing methods ...

  async getInvitationsForApartment(
    apartmentId: string,
    userId: string
  ): Promise<InvitationListDTO> {
    // 1. Verify ownership
    // 2. Fetch invitations with LEFT JOIN to users
    // 3. Transform to DTO
    // 4. Return InvitationListDTO
  }
}
```

### Krok 3: Implementacja API route
```typescript
// src/pages/api/apartments/[id]/invitations.ts
import type { APIContext } from 'astro';
import { GetInvitationsParamsSchema } from '@/lib/validation/invitations.validation';
import { InvitationService } from '@/lib/services/invitation.service';

export const prerender = false;

// ... existing POST method ...

export async function GET(context: APIContext) {
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
    const params = GetInvitationsParamsSchema.parse(context.params);

    // 3. Call service
    const supabase = context.locals.supabase;
    const invitationService = new InvitationService(supabase);
    const invitations = await invitationService.getInvitationsForApartment(
      params.id,
      user.id
    );

    // 4. Return response
    return new Response(JSON.stringify(invitations), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // Error handling
  }
}
```

### Krok 4: Implementacja metody serwisu

**getInvitationsForApartment:**
```typescript
async getInvitationsForApartment(
  apartmentId: string,
  userId: string
): Promise<InvitationListDTO> {
  // 1. Verify ownership
  const { data: apartment, error: apartmentError } = await this.supabase
    .from('apartments')
    .select('id')
    .eq('id', apartmentId)
    .eq('owner_id', userId)
    .single();

  if (apartmentError || !apartment) {
    throw new Error('NOT_FOUND');
  }

  // 2. Fetch invitations
  const { data: invitations, error: invitationsError } = await this.supabase
    .from('invitation_links')
    .select(`
      id,
      token,
      status,
      created_at,
      accepted_by:users!accepted_by (
        id,
        full_name
      )
    `)
    .eq('apartment_id', apartmentId)
    .order('created_at', { ascending: false });

  if (invitationsError) {
    throw invitationsError;
  }

  // 3. Transform to DTO
  const invitationList: InvitationListItemDTO[] = (invitations || []).map(
    (inv) => ({
      id: inv.id,
      token: inv.token,
      status: inv.status,
      created_at: inv.created_at,
      ...(inv.accepted_by && {
        accepted_by: {
          id: inv.accepted_by.id,
          full_name: inv.accepted_by.full_name
        }
      })
    })
  );

  return { invitations: invitationList };
}
```

### Krok 5: Obsługa błędów w route

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

  console.error('GET /api/apartments/:id/invitations error:', error);
  return new Response(
    JSON.stringify({
      error: 'Internal Server Error',
      message: 'Wystąpił błąd serwera'
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}
```

### Krok 6: Testy
1. Test pobierania zaproszeń dla właściciela
2. Test pustej listy (brak zaproszeń)
3. Test 403 dla nie-właściciela
4. Test 404 dla nieistniejącego mieszkania
5. Test sortowania (najnowsze najpierw)
6. Test obecności accepted_by dla accepted invitations
7. Test braku accepted_by dla pending/expired invitations
8. Test walidacji apartmentId (invalid UUID)

### Krok 7: Dokumentacja
1. JSDoc dla funkcji serwisu
2. Przykłady użycia w dokumentacji API
3. Komentarze dla query Supabase (nested select)

---

**Priorytet:** Średni (funkcjonalność zarządzania zaproszeniami)
**Szacowany czas:** 2-3 godziny
**Zależności:** POST /api/apartments/:id/invitations, InvitationService
