# API Endpoint Implementation Plan: POST /api/invitations/:token/accept

## 1. Przegląd punktu końcowego

Endpoint akceptuje zaproszenie i tworzy aktywny najem (lease) dla lokatora. Wywoływany po rejestracji lokatora przez Supabase Auth. Automatycznie łączy nowo zarejestrowanego użytkownika z mieszkaniem poprzez utworzenie lease i zmianę statusu zaproszenia.

**Kluczowe cechy:**
- Wywoływany po rejestracji lokatora
- Tworzy aktywny lease (status='active')
- Zmienia status invitation na 'accepted'
- Waliduje business rules (user nie ma już lease, token jest pending)
- Transakcja atomowa (lease + invitation update)

## 2. Szczegóły żądania

- **Metoda HTTP:** POST
- **Struktura URL:** `/api/invitations/:token/accept`
- **Parametry:**
  - **Wymagane:**
    - `token` (path param, string) - token zaproszenia
  - **Opcjonalne:** brak
- **Request Body:** brak (pusty POST)
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagany - świeżo zarejestrowany user)

## 3. Wykorzystywane typy

**DTOs:**
```typescript
// Response type
export type AcceptInvitationResponseDTO = {
  lease: Pick<
    Tables<'leases'>,
    'id' | 'apartment_id' | 'tenant_id' | 'status' | 'start_date' | 'created_at'
  >;
};
```

**Validation Schema (Zod):**
```typescript
const AcceptInvitationParamsSchema = z.object({
  token: z.string().min(1, { message: 'Token jest wymagany' })
});
```

## 4. Szczegóły odpowiedzi

### Success Response (200 OK):
```json
{
  "lease": {
    "id": "uuid",
    "apartment_id": "uuid",
    "tenant_id": "uuid",
    "status": "active",
    "start_date": "2025-01-12",
    "created_at": "2025-01-12T10:00:00Z"
  }
}
```

### Error Responses:

**400 Bad Request - Token invalid:**
```json
{
  "error": "Bad Request",
  "message": "Ten link zapraszający wygasł lub został już wykorzystany"
}
```

**400 Bad Request - User ma już aktywny lease:**
```json
{
  "error": "Bad Request",
  "message": "Twoje konto jest już przypisane do aktywnego najmu"
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

1. **Walidacja path params** - parsowanie `token`
2. **Pobranie user z context.locals** - sprawdzenie autoryzacji (nowo zarejestrowany)
3. **Pobranie invitation:**
   ```sql
   SELECT id, apartment_id, status
   FROM invitation_links
   WHERE token = $1
   ```
   Jeśli nie istnieje lub status != 'pending' → 400

4. **Sprawdzenie czy user nie ma już aktywnego lease:**
   ```sql
   SELECT id FROM leases
   WHERE tenant_id = auth.uid() AND status = 'active'
   ```
   Jeśli istnieje → 400 (user ma już aktywny lease)

5. **TRANSAKCJA - atomowe operacje:**

   a. **Utworzenie lease:**
   ```sql
   INSERT INTO leases (
     apartment_id,
     tenant_id,
     status,
     start_date,
     created_by
   ) VALUES (
     $1, -- apartment_id from invitation
     auth.uid(), -- nowo zarejestrowany user
     'active',
     CURRENT_DATE,
     auth.uid()
   )
   RETURNING *
   ```

   b. **Update invitation status:**
   ```sql
   UPDATE invitation_links
   SET
     status = 'accepted',
     accepted_by = auth.uid()
   WHERE id = $1
   ```

6. **Zwrócenie odpowiedzi** jako `AcceptInvitationResponseDTO`

### Business constraints enforced:
- **One active lease per tenant** - unique index `idx_one_active_lease_per_tenant`
- **One active lease per apartment** - unique index `idx_one_active_lease_per_apartment`
- **Token single-use** - status change to 'accepted'

## 6. Względy bezpieczeństwa

### Autoryzacja:
- **Wymagany JWT token** - użytkownik musi być zalogowany
- **Nowo zarejestrowany user** - zazwyczaj wywoływane zaraz po signup
- **RLS Policy** dla INSERT na leases:
  ```sql
  -- User może utworzyć lease tylko dla siebie (tenant_id = auth.uid())
  ```

### Walidacja business rules:
1. **Token musi być pending** - nie można użyć expired/accepted
2. **User nie może mieć aktywnego lease** - jedno mieszkanie per lokator
3. **Apartment nie może mieć aktywnego lease** - enforced przez DB unique index
4. **Atomowość** - lease i invitation update w transakcji

### Race conditions:
- **Dwóch użytkowników używa tego samego tokenu** - pierwszy wygrywa, drugi dostaje 400
- **User próbuje zaakceptować dwa tokeny jednocześnie** - unique index zapobiega

### Data integrity:
- **Foreign keys** - apartment_id, tenant_id muszą istnieć
- **Unique constraints** - jeden aktywny lease per tenant i per apartment
- **Status transition** - pending → accepted (nie można cofnąć)

### Rate limiting:
- Supabase built-in rate limiting (100 req/s per IP)
- Mało prawdopodobne nadużycie (wywoływane raz per user registration)

## 7. Obsługa błędów

### Scenariusze błędów:

| Kod | Scenariusz | Response |
|-----|-----------|----------|
| 400 | Token pusty | `{ "error": "Validation Error", "message": "Token jest wymagany" }` |
| 400 | Token nie istnieje | `{ "error": "Bad Request", "message": "Ten link zapraszający wygasł lub został już wykorzystany" }` |
| 400 | Token status != 'pending' | `{ "error": "Bad Request", "message": "Ten link zapraszający wygasł lub został już wykorzystany" }` |
| 400 | User ma już aktywny lease | `{ "error": "Bad Request", "message": "Twoje konto jest już przypisane do aktywnego najmu" }` |
| 400 | Apartment ma już aktywny lease (DB constraint) | `{ "error": "Bad Request", "message": "To mieszkanie ma już aktywnego lokatora" }` |
| 401 | Brak JWT token | `{ "error": "Unauthorized", "message": "Brak autoryzacji" }` |
| 500 | Błąd połączenia z bazą danych | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` |
| 500 | Transakcja failed | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` |

### Logging:
```typescript
console.error('POST /api/invitations/:token/accept error:', {
  userId: user.id,
  tokenPrefix: token.substring(0, 8),
  error: error.message,
  stack: error.stack
});
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje:

1. **Indeksy bazy danych:**
   - `idx_invitation_links_token` (UNIQUE) - dla szybkiego lookup
   - `idx_leases_tenant_id` - dla sprawdzenia aktywnego lease
   - `idx_one_active_lease_per_tenant` (UNIQUE partial) - business constraint
   - `idx_one_active_lease_per_apartment` (UNIQUE partial) - business constraint

2. **Transakcja:**
   - INSERT + UPDATE w jednej transakcji
   - Atomowość zapewnia spójność danych
   - Minimal locking (tylko 2 tables)

3. **Single query checks:**
   - Sprawdzenie invitation i aktywnego lease w osobnych queries
   - Można zoptymalizować do jednego query (post-MVP)

### Potencjalne wąskie gardła:

- **Lock contention** - jeśli wielu użytkowników akceptuje zaproszenia jednocześnie
  - Mało prawdopodobne w MVP (różne apartments)
- **Unique constraint violation** - race condition
  - Handled przez DB error i zwrot 400

## 9. Etapy wdrożenia

### Krok 1: Wykorzystanie istniejącej walidacji
```typescript
// src/lib/validation/invitations.validation.ts
export const AcceptInvitationParamsSchema = z.object({
  token: z.string().min(1, { message: 'Token jest wymagany' })
});
```

### Krok 2: Rozszerzenie invitation service
```typescript
// src/lib/services/invitation.service.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type { AcceptInvitationResponseDTO } from '@/types';

export class InvitationService {
  constructor(private supabase: SupabaseClient) {}

  // ... existing methods ...

  async acceptInvitation(
    token: string,
    userId: string
  ): Promise<AcceptInvitationResponseDTO> {
    // 1. Fetch and validate invitation
    // 2. Check if user already has active lease
    // 3. Create lease and update invitation (transaction)
    // 4. Return AcceptInvitationResponseDTO
  }

  async userHasActiveLease(userId: string): Promise<boolean> {
    // Check if user has active lease
  }
}
```

### Krok 3: Implementacja API route
```typescript
// src/pages/api/invitations/[token]/accept.ts
import type { APIContext } from 'astro';
import { AcceptInvitationParamsSchema } from '@/lib/validation/invitations.validation';
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
    const params = AcceptInvitationParamsSchema.parse(context.params);

    // 3. Call service
    const supabase = context.locals.supabase;
    const invitationService = new InvitationService(supabase);
    const result = await invitationService.acceptInvitation(
      params.token,
      user.id
    );

    // 4. Return response
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    // Error handling
  }
}
```

### Krok 4: Implementacja metod serwisu

**acceptInvitation:**
```typescript
async acceptInvitation(
  token: string,
  userId: string
): Promise<AcceptInvitationResponseDTO> {
  // 1. Fetch invitation
  const { data: invitation, error: invError } = await this.supabase
    .from('invitation_links')
    .select('id, apartment_id, status')
    .eq('token', token)
    .single();

  if (invError || !invitation || invitation.status !== 'pending') {
    throw new Error('INVALID_TOKEN');
  }

  // 2. Check if user already has active lease
  const hasLease = await this.userHasActiveLease(userId);
  if (hasLease) {
    throw new Error('USER_HAS_LEASE');
  }

  // 3. Create lease (DB will check apartment constraint)
  const { data: lease, error: leaseError } = await this.supabase
    .from('leases')
    .insert({
      apartment_id: invitation.apartment_id,
      tenant_id: userId,
      status: 'active',
      start_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      created_by: userId
    })
    .select()
    .single();

  if (leaseError) {
    // Check if unique constraint violation (apartment has active lease)
    if (leaseError.code === '23505') { // PostgreSQL unique violation
      throw new Error('APARTMENT_HAS_LEASE');
    }
    throw leaseError;
  }

  // 4. Update invitation status
  const { error: updateError } = await this.supabase
    .from('invitation_links')
    .update({
      status: 'accepted',
      accepted_by: userId
    })
    .eq('id', invitation.id);

  if (updateError) {
    // Rollback lease? Or let it be (lease exists but invitation not updated)
    // For MVP: log error and continue (lease is more important)
    console.error('Failed to update invitation status:', updateError);
  }

  // 5. Return DTO
  return {
    lease: {
      id: lease.id,
      apartment_id: lease.apartment_id,
      tenant_id: lease.tenant_id,
      status: lease.status,
      start_date: lease.start_date,
      created_at: lease.created_at
    }
  };
}

async userHasActiveLease(userId: string): Promise<boolean> {
  const { data, error } = await this.supabase
    .from('leases')
    .select('id')
    .eq('tenant_id', userId)
    .eq('status', 'active')
    .limit(1);

  return !error && data && data.length > 0;
}
```

**UWAGA:** Supabase nie ma natywnego wsparcia dla transakcji w JS client. Operacje są atomowe na poziomie single query, ale CREATE + UPDATE nie są w transakcji. Dla MVP akceptujemy to (priorytet: lease utworzony, invitation update opcjonalny).

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
        error: 'Bad Request',
        message: 'Ten link zapraszający wygasł lub został już wykorzystany'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (error.message === 'USER_HAS_LEASE') {
    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        message: 'Twoje konto jest już przypisane do aktywnego najmu'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (error.message === 'APARTMENT_HAS_LEASE') {
    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        message: 'To mieszkanie ma już aktywnego lokatora'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.error('POST /api/invitations/:token/accept error:', {
    userId: user.id,
    tokenPrefix: context.params.token?.substring(0, 8),
    error: error.message,
    stack: error.stack
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

### Krok 6: Testy
1. Test akceptacji pending invitation (success)
2. Test 400 dla expired invitation
3. Test 400 dla accepted invitation
4. Test 400 dla nieistniejącego token
5. Test 400 dla user który ma już aktywny lease
6. Test 400 dla apartment który ma już aktywny lease (race condition)
7. Test utworzenia lease z poprawnymi danymi
8. Test update invitation status na 'accepted'
9. Test update invitation.accepted_by = user.id
10. Test 401 dla nieautoryzowanego dostępu
11. Test race condition (dwóch users używa tego samego tokenu)

### Krok 7: Integration test - end-to-end flow
```typescript
// E2E test: tenant registration and invitation acceptance
// 1. Owner creates invitation (POST /api/apartments/:id/invitations)
// 2. Get invitation details (GET /api/invitations/:token)
// 3. Tenant signs up via Supabase Auth
// 4. Tenant accepts invitation (POST /api/invitations/:token/accept)
// 5. Verify lease created
// 6. Verify invitation status = 'accepted'
// 7. Verify tenant can access apartment (GET /api/apartments)
```

### Krok 8: Dokumentacja
1. JSDoc dla funkcji serwisu
2. Komentarze o transakcji i atomowości
3. Dokumentacja flow: signup → accept invitation → lease created
4. Dokumentacja error scenarios i rollback strategy

### Krok 9: Post-MVP improvements
1. **Proper transaction support:**
   - Rozważyć Supabase Edge Function z native SQL transaction
   - Albo RPC function w PostgreSQL
2. **Rollback strategy:**
   - Jeśli invitation update fails, rozważyć rollback lease
3. **Email notification:**
   - Powiadomienie właściciela o akceptacji zaproszenia

---

**Priorytet:** Wysoki (krytyczny dla tenant onboarding)
**Szacowany czas:** 4-5 godzin
**Zależności:** Supabase Auth signup, GET /api/invitations/:token, InvitationService
**Technical debt:** Brak native transaction support (Supabase JS client limitation)
