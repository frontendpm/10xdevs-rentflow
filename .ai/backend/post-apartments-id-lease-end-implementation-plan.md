# API Endpoint Implementation Plan: POST /api/apartments/:id/lease/end

## 1. Przegląd punktu końcowego

Endpoint służy do zakończenia aktywnego najmu dla określonego mieszkania. Jest to operacja dostępna wyłącznie dla właściciela mieszkania, która archiwizuje aktywny najem i automatycznie odbiera lokatorowi dostęp do danych mieszkania poprzez zmianę statusu z "active" na "archived".

**Główne zastosowania:**
- Zakończenie współpracy z lokatorem
- Przygotowanie mieszkania do wynajęcia nowemu lokatorowi
- Archiwizacja danych najmu dla celów historycznych
- Dodanie końcowych notatek o najmie

**Kluczowe efekty:**
- Status najmu: active → archived
- Ustawienie timestamp archived_at
- Automatyczna utrata dostępu lokatora (przez RLS)
- Możliwość utworzenia nowego najmu dla mieszkania

## 2. Szczegóły żądania

- **Metoda HTTP:** POST
- **Struktura URL:** `/api/apartments/:id/lease/end`
- **Parametry:**
  - **Wymagane:**
    - `id` (path parameter) - UUID mieszkania
  - **Opcjonalne:**
    - `notes` (request body) - Notatki o zakończeniu najmu
- **Request Body:**
  ```json
  {
    "notes": "Koniec umowy najmu"
  }
  ```
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagane)
  - `Content-Type: application/json`

**Przykład żądania:**
```http
POST /api/apartments/550e8400-e29b-41d4-a716-446655440000/lease/end
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "notes": "Koniec umowy najmu. Mieszkanie w dobrym stanie."
}
```

## 3. Wykorzystywane typy

### DTOs i Commands (z src/types.ts):

```typescript
/**
 * End lease command
 * @endpoint POST /api/apartments/:apartmentId/lease/end
 */
export type EndLeaseCommand = {
  notes?: string;
};

/**
 * Active lease DTO (używane dla response)
 * @endpoint GET /api/apartments/:apartmentId/lease
 */
export type ActiveLeaseDTO = Tables<'leases'> & {
  tenant: TenantInfo;
};
```

### Database Types (z src/db/database.types.ts):

```typescript
// Tables<'leases'> zawiera:
{
  id: string;
  apartment_id: string;
  tenant_id: string | null;
  status: 'active' | 'archived';
  start_date: string | null;
  archived_at: string | null;  // ← Ustawiane podczas end lease
  notes: string | null;         // ← Aktualizowane z request body
  created_at: string;
  updated_at: string;
  created_by: string;
}
```

### Validation Schema:

```typescript
const endLeaseCommandSchema = z.object({
  notes: z.string().max(1000, {
    message: 'Notatki nie mogą przekraczać 1000 znaków'
  }).optional()
});

const apartmentIdParamSchema = z.object({
  id: z.string().uuid({
    message: 'Nieprawidłowy identyfikator mieszkania'
  })
});
```

## 4. Szczegóły odpowiedzi

### Response 200 (Success):

```json
{
  "id": "uuid",
  "apartment_id": "uuid",
  "tenant_id": "uuid",
  "status": "archived",
  "start_date": "2025-01-01",
  "archived_at": "2025-01-12T10:00:00Z",
  "notes": "Koniec umowy najmu",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-12T10:00:00Z",
  "created_by": "uuid"
}
```

**Uwaga:** Response nie zawiera danych tenant (można je usunąć z response lub zwrócić dla historii).

**Kody statusu:**
- `200 OK` - Najem pomyślnie zakończony
- `400 Bad Request` - Nieprawidłowe dane wejściowe (notes za długie, invalid JSON)
- `401 Unauthorized` - Brak autoryzacji
- `403 Forbidden` - Nie jesteś właścicielem mieszkania
- `404 Not Found` - Brak aktywnego najmu do zakończenia
- `500 Internal Server Error` - Błąd serwera

### Error Response Format:

```json
{
  "error": "Not Found",
  "message": "Brak aktywnego najmu do zakończenia"
}
```

## 5. Przepływ danych

### 5.1. Request Flow:

```
1. Client Request (POST with optional notes)
   ↓
2. API Route Handler (/api/apartments/[id]/lease/end.ts)
   ↓
3. Authentication Check (middleware - context.locals.user)
   ↓
4. Input Validation (Zod schemas)
   |
   ├─→ Validate apartmentId (UUID)
   └─→ Validate request body (notes optional)
   ↓
5. Service Layer (lease.service.ts - endLease)
   ↓
6. Database Operations (Supabase with RLS)
   |
   ├─→ 6a. Fetch active lease (verify exists)
   |       SELECT * FROM leases
   |       WHERE apartment_id = ? AND status = 'active'
   |
   ├─→ 6b. Update lease status
   |       UPDATE leases SET
   |         status = 'archived',
   |         archived_at = NOW(),
   |         notes = ?
   |       WHERE id = ?
   |
   └─→ 6c. RLS automatically prevents tenant access
   ↓
7. Response Transformation (raw data → LeaseDTO)
   ↓
8. Return Response (200 or error)
```

### 5.2. Database Transaction:

**Operacje:**
1. **Fetch active lease** - sprawdzenie czy istnieje
2. **Update lease** - zmiana statusu i ustawienie archived_at
3. **RLS enforcement** - automatyczne odcięcie dostępu lokatora

**Atomicity:**
- Operacje są atomowe przez Supabase (transactional)
- Jeśli update fail → rollback (automatycznie)

### 5.3. Service Layer Logic:

```typescript
// src/lib/services/lease.service.ts
export async function endLease(
  supabase: SupabaseClient,
  apartmentId: string,
  command: EndLeaseCommand
): Promise<Tables<'leases'>> {
  // 1. Fetch active lease first (to verify it exists and user has access)
  const { data: activeLease, error: fetchError } = await supabase
    .from('leases')
    .select('*')
    .eq('apartment_id', apartmentId)
    .eq('status', 'active')
    .single();

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      throw new Error('NO_ACTIVE_LEASE');
    }
    console.error('Error fetching active lease:', fetchError);
    throw new Error('DATABASE_ERROR');
  }

  // 2. Update lease to archived
  const { data: archivedLease, error: updateError } = await supabase
    .from('leases')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      notes: command.notes || activeLease.notes
    })
    .eq('id', activeLease.id)
    .select()
    .single();

  if (updateError) {
    console.error('Error updating lease to archived:', updateError);
    throw new Error('DATABASE_ERROR');
  }

  return archivedLease;
}
```

### 5.4. RLS Policy Effect:

Po zmianie statusu na "archived", policy dla tenantów automatycznie przestaje dawać dostęp:

```sql
-- Tenants can view their active lease
CREATE POLICY "Tenants can view their active lease"
  ON leases FOR SELECT
  TO authenticated
  USING (
    tenant_id = auth.uid() AND status = 'active'  -- ← status = 'active' required
  );
```

## 6. Względy bezpieczeństwa

### 6.1. Authentication:
- **JWT Token:** Wymagany w nagłówku Authorization
- **Middleware:** Sprawdzenie `context.locals.user`
- **Early return:** Brak użytkownika → 401

### 6.2. Authorization:
- **Tylko właściciel:** Endpoint dostępny wyłącznie dla owner
- **RLS Policy dla UPDATE:**
  ```sql
  -- Owners can update leases for their apartments
  CREATE POLICY "Owners can update leases for their apartments"
    ON leases FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM apartments
        WHERE apartments.id = leases.apartment_id
          AND apartments.owner_id = auth.uid()
      )
    );
  ```

### 6.3. Input Validation:
- **apartmentId:** UUID validation (Zod)
- **notes:** Max length 1000 characters (Zod)
- **JSON parsing:** Handled by Astro/Zod

### 6.4. Business Logic Validation:
- **Active lease must exist:** Sprawdzenie przed update
- **Cannot end archived lease:** Query `WHERE status = 'active'`
- **Owner verification:** RLS automatycznie weryfikuje

### 6.5. Data Integrity:
- **Atomic operation:** Update jest atomowy
- **Timestamp consistency:** archived_at ustawiane przez kod (NOW())
- **Preserve tenant_id:** Tenant ID pozostaje dla historii
- **Cascade implications:** Charges, protocols pozostają (ON DELETE CASCADE nie dotyczy UPDATE)

### 6.6. Potential Security Risks:

| Ryzyko | Mitigation |
|--------|-----------|
| Race condition (2x end lease) | Query filtruje status='active', drugi request zwróci 404 |
| Unauthorized access | RLS policy weryfikuje ownership |
| Data tampering | Supabase prepared statements |
| Information disclosure | Generic error messages (nie ujawniaj DB details) |
| Denial of Service | Supabase rate limiting (built-in) |

## 7. Obsługa błędów

### 7.1. Tabela błędów:

| Kod | Scenariusz | Response | Logowanie | Akcja |
|-----|-----------|----------|-----------|-------|
| 400 | Invalid JSON | `{ "error": "Validation Error", "message": "Nieprawidłowy format danych" }` | Info | Return validation error |
| 400 | Notes too long | `{ "error": "Validation Error", "message": "Notatki nie mogą przekraczać 1000 znaków" }` | Info | Return Zod error |
| 400 | Invalid UUID | `{ "error": "Validation Error", "message": "Nieprawidłowy identyfikator mieszkania" }` | Info | Return Zod error |
| 401 | No auth | `{ "error": "Unauthorized", "message": "Brak autoryzacji" }` | Info | Early return |
| 403 | Not owner | `{ "error": "Forbidden", "message": "Nie masz uprawnień do zakończenia tego najmu" }` | Warning | RLS blocked update |
| 404 | No active lease | `{ "error": "Not Found", "message": "Brak aktywnego najmu do zakończenia" }` | Info | Return 404 |
| 500 | Database error | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` | Error | Log and return generic error |

### 7.2. Error Handling Pattern:

```typescript
try {
  // 1. Authentication check (early return)
  if (!context.locals.user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      message: 'Brak autoryzacji'
    }), { status: 401 });
  }

  // 2. Validate path parameter
  const validatedParams = apartmentIdParamSchema.parse(context.params);

  // 3. Parse and validate request body
  const body = await context.request.json();
  const validatedBody = endLeaseCommandSchema.parse(body);

  // 4. Service call
  const archivedLease = await endLease(
    context.locals.supabase,
    validatedParams.id,
    validatedBody
  );

  // 5. Happy path - return success
  return new Response(JSON.stringify(archivedLease), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

} catch (error) {
  // Zod validation error
  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({
      error: 'Validation Error',
      message: error.errors[0].message
    }), { status: 400 });
  }

  // Business logic errors
  if (error instanceof Error) {
    if (error.message === 'NO_ACTIVE_LEASE') {
      return new Response(JSON.stringify({
        error: 'Not Found',
        message: 'Brak aktywnego najmu do zakończenia'
      }), { status: 404 });
    }

    if (error.message === 'DATABASE_ERROR') {
      console.error('Database error in endLease:', error);
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: 'Wystąpił błąd serwera'
      }), { status: 500 });
    }
  }

  // Unexpected errors
  console.error('Unexpected error in POST /api/apartments/:id/lease/end:', error);
  return new Response(JSON.stringify({
    error: 'Internal Server Error',
    message: 'Wystąpił błąd serwera'
  }), { status: 500 });
}
```

### 7.3. Logging Strategy:

```typescript
// Info level - expected scenarios
console.info(`Lease ended for apartment: ${apartmentId} by user: ${userId}`);

// Warning level - potential security issues
console.warn(`Unauthorized lease end attempt: apartment=${apartmentId}, user=${userId}`);

// Error level - unexpected failures
console.error('Database error in endLease:', {
  apartmentId,
  userId,
  error: error.message,
  stack: error.stack
});
```

## 8. Rozważania dotyczące wydajności

### 8.1. Potencjalne wąskie gardła:

1. **Two database queries:**
   - Fetch active lease (verify exists)
   - Update lease (change status)
   - **Optymalizacja:** Można połączyć w jedno UPDATE z RETURNING i obsłużyć 0 rows

2. **RLS policy evaluation:**
   - Policy sprawdza EXISTS subquery (apartments.owner_id)
   - **Optymalizacja:** Index na apartments.owner_id (już istnieje)

3. **Transaction overhead:**
   - UPDATE jest atomowy przez Supabase
   - **Mitigation:** Brak dodatkowego overhead dla MVP

### 8.2. Optimization Strategy:

**Optymalizowane zapytanie (single query):**

```typescript
// Alternative approach - single UPDATE with RLS check
const { data: archivedLease, error } = await supabase
  .from('leases')
  .update({
    status: 'archived',
    archived_at: new Date().toISOString(),
    notes: command.notes
  })
  .eq('apartment_id', apartmentId)
  .eq('status', 'active')
  .select()
  .single();

// If no rows updated → either no active lease OR no permission
if (error?.code === 'PGRST116') {
  // Ambiguity: could be 404 or 403
  // Need additional query to distinguish (or accept ambiguity)
  return 404; // "Brak aktywnego najmu do zakończenia"
}
```

**Trade-off:**
- **Pros:** Szybsze (1 query zamiast 2)
- **Cons:** Niejednoznaczne błędy (404 vs 403)

**Rekomendacja dla MVP:** Użyj 2 queries dla jasności (fetch + update).

### 8.3. Caching Strategy:

**Nie dotyczy:** Endpoint modyfikuje dane, nie można cache'ować.

### 8.4. Response Time Targets:

- **Target:** < 300ms (95th percentile)
- **Acceptable:** < 700ms
- **Critical:** > 1500ms (wymaga optymalizacji)

### 8.5. Monitoring:

- Monitor frequency of 404 errors (może wskazywać na problemy UI)
- Monitor 403 errors (potential security issues)
- Track response times per apartment (detect slow apartments)

## 9. Etapy wdrożenia

### Krok 1: Rozszerzenie lease.service.ts

```typescript
// src/lib/services/lease.service.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type { EndLeaseCommand } from '@/types';
import type { Tables } from '@/db/database.types';

/**
 * End active lease for an apartment
 *
 * @param supabase - Supabase client with user context
 * @param apartmentId - UUID of the apartment
 * @param command - End lease command with optional notes
 * @returns Archived lease data
 * @throws Error with code 'NO_ACTIVE_LEASE' if no active lease found
 * @throws Error with code 'DATABASE_ERROR' if database query fails
 */
export async function endLease(
  supabase: SupabaseClient,
  apartmentId: string,
  command: EndLeaseCommand
): Promise<Tables<'leases'>> {
  // 1. Fetch active lease (verify exists and user has access via RLS)
  const { data: activeLease, error: fetchError } = await supabase
    .from('leases')
    .select('*')
    .eq('apartment_id', apartmentId)
    .eq('status', 'active')
    .single();

  // Handle fetch errors
  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      // No active lease found (or no permission via RLS)
      const error = new Error('NO_ACTIVE_LEASE');
      error.name = 'NO_ACTIVE_LEASE';
      throw error;
    }

    console.error('Error fetching active lease:', fetchError);
    const error = new Error('DATABASE_ERROR');
    error.name = 'DATABASE_ERROR';
    throw error;
  }

  // 2. Update lease to archived status
  const { data: archivedLease, error: updateError } = await supabase
    .from('leases')
    .update({
      status: 'archived' as const,
      archived_at: new Date().toISOString(),
      notes: command.notes !== undefined ? command.notes : activeLease.notes
    })
    .eq('id', activeLease.id)
    .select()
    .single();

  // Handle update errors
  if (updateError) {
    console.error('Error updating lease to archived:', updateError);
    const error = new Error('DATABASE_ERROR');
    error.name = 'DATABASE_ERROR';
    throw error;
  }

  return archivedLease;
}
```

### Krok 2: Dodanie validation schemas

```typescript
// src/lib/validations/lease.validation.ts
import { z } from 'zod';

/**
 * Validation schema for ending a lease
 */
export const endLeaseCommandSchema = z.object({
  notes: z
    .string()
    .max(1000, {
      message: 'Notatki nie mogą przekraczać 1000 znaków'
    })
    .optional()
});

/**
 * Validation schema for apartment ID parameter
 */
export const apartmentIdParamSchema = z.object({
  id: z.string().uuid({
    message: 'Nieprawidłowy identyfikator mieszkania'
  })
});
```

### Krok 3: Utworzenie API route

```bash
# Utworzenie katalogu i pliku
mkdir -p src/pages/api/apartments/[id]/lease
touch src/pages/api/apartments/[id]/lease/end.ts
```

### Krok 4: Implementacja API route

```typescript
// src/pages/api/apartments/[id]/lease/end.ts
import type { APIContext } from 'astro';
import { z } from 'zod';
import { endLease } from '@/lib/services/lease.service';
import {
  endLeaseCommandSchema,
  apartmentIdParamSchema
} from '@/lib/validations/lease.validation';

export const prerender = false;

/**
 * POST /api/apartments/:id/lease/end
 *
 * Ends the active lease for an apartment (owner only).
 * Changes lease status from 'active' to 'archived' and sets archived_at timestamp.
 * Tenant automatically loses access via RLS policies.
 *
 * @authorization Owner of the apartment
 * @param id - UUID of the apartment (path parameter)
 * @body { notes?: string } - Optional notes about lease termination
 * @returns 200 - Archived lease data
 * @returns 400 - Validation error
 * @returns 401 - Unauthorized
 * @returns 403 - Forbidden (not owner)
 * @returns 404 - No active lease found
 * @returns 500 - Server error
 */
export async function POST(context: APIContext) {
  try {
    // 1. Authentication check
    const user = context.locals.user;
    if (!user) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Brak autoryzacji'
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 2. Validate path parameter
    const validatedParams = apartmentIdParamSchema.safeParse(context.params);
    if (!validatedParams.success) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: validatedParams.error.errors[0].message
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const { id: apartmentId } = validatedParams.data;

    // 3. Parse and validate request body
    let body;
    try {
      body = await context.request.json();
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Nieprawidłowy format danych'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const validatedBody = endLeaseCommandSchema.safeParse(body);
    if (!validatedBody.success) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: validatedBody.error.errors[0].message
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 4. Get supabase client from context
    const supabase = context.locals.supabase;

    // 5. End the lease
    const archivedLease = await endLease(
      supabase,
      apartmentId,
      validatedBody.data
    );

    // 6. Log success (optional)
    console.info(
      `Lease ended successfully for apartment: ${apartmentId} by user: ${user.id}`
    );

    // 7. Return success response
    return new Response(JSON.stringify(archivedLease), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Handle business logic errors
    if (error instanceof Error) {
      if (error.name === 'NO_ACTIVE_LEASE') {
        return new Response(
          JSON.stringify({
            error: 'Not Found',
            message: 'Brak aktywnego najmu do zakończenia'
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (error.name === 'DATABASE_ERROR') {
        console.error('Database error in endLease:', error);
        return new Response(
          JSON.stringify({
            error: 'Internal Server Error',
            message: 'Wystąpił błąd serwera'
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Unexpected errors
    console.error('Unexpected error in POST /api/apartments/:id/lease/end:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Wystąpił błąd serwera'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
```

### Krok 5: Testowanie

**5.1. Manual Testing:**

```bash
# Test 1: Successful lease end (as owner)
curl -X POST \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/lease/end \
  -H "Authorization: Bearer <owner-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Koniec umowy najmu"}'

# Expected: 200 OK with archived lease data

# Test 2: Without notes
curl -X POST \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/lease/end \
  -H "Authorization: Bearer <owner-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: 200 OK (notes optional)

# Test 3: Notes too long
curl -X POST \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/lease/end \
  -H "Authorization: Bearer <owner-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"notes": "'$(python3 -c 'print("a" * 1001)')'"}'

# Expected: 400 Validation Error

# Test 4: Without authorization
curl -X POST \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/lease/end \
  -H "Content-Type: application/json" \
  -d '{"notes": "Test"}'

# Expected: 401 Unauthorized

# Test 5: As tenant (not owner)
curl -X POST \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/lease/end \
  -H "Authorization: Bearer <tenant-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Test"}'

# Expected: 404 Not Found (RLS blocks access)

# Test 6: No active lease
curl -X POST \
  http://localhost:4321/api/apartments/00000000-0000-0000-0000-000000000000/lease/end \
  -H "Authorization: Bearer <owner-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: 404 Not Found

# Test 7: Invalid UUID
curl -X POST \
  http://localhost:4321/api/apartments/invalid-uuid/lease/end \
  -H "Authorization: Bearer <owner-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: 400 Validation Error

# Test 8: Invalid JSON
curl -X POST \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/lease/end \
  -H "Authorization: Bearer <owner-jwt-token>" \
  -H "Content-Type: application/json" \
  -d 'invalid json'

# Expected: 400 Validation Error
```

**5.2. Weryfikacja efektów:**

```bash
# Po zakończeniu najmu, sprawdź czy lokator stracił dostęp
curl -X GET \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/lease \
  -H "Authorization: Bearer <tenant-jwt-token>"

# Expected: 404 Not Found (lokator nie widzi archived lease)

# Sprawdź czy właściciel może stworzyć nowe zaproszenie
curl -X POST \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/invitations \
  -H "Authorization: Bearer <owner-jwt-token>"

# Expected: 201 Created (mieszkanie dostępne dla nowego lokatora)
```

### Krok 6: Weryfikacja RLS policies

```sql
-- Test RLS manually in Supabase SQL Editor

-- 1. Set auth context (simulate owner)
SELECT set_config('request.jwt.claim.sub', '<owner-uuid>', true);

-- 2. Try to update lease
UPDATE leases
SET status = 'archived', archived_at = NOW()
WHERE apartment_id = '<apartment-uuid>' AND status = 'active';

-- Expected: 1 row updated (success)

-- 3. Set auth context (simulate tenant)
SELECT set_config('request.jwt.claim.sub', '<tenant-uuid>', true);

-- 4. Try to update lease
UPDATE leases
SET status = 'archived', archived_at = NOW()
WHERE apartment_id = '<apartment-uuid>' AND status = 'active';

-- Expected: 0 rows updated (RLS blocked)

-- 5. Verify tenant lost access
SELECT * FROM leases
WHERE tenant_id = '<tenant-uuid>';

-- Expected: 0 rows (archived leases not visible to tenant)
```

### Krok 7: Integration Testing (opcjonalnie)

```typescript
// tests/api/apartments/lease/end.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('POST /api/apartments/:id/lease/end', () => {
  it('should return 401 without authentication', async () => {
    // Test implementation
  });

  it('should return 200 and archive lease for owner', async () => {
    // Test implementation
  });

  it('should return 404 for tenant (not owner)', async () => {
    // Test implementation
  });

  it('should return 404 when no active lease exists', async () => {
    // Test implementation
  });

  it('should return 400 for invalid UUID', async () => {
    // Test implementation
  });

  it('should return 400 for notes exceeding 1000 chars', async () => {
    // Test implementation
  });

  it('should set archived_at timestamp', async () => {
    // Test implementation
  });

  it('should preserve tenant_id for history', async () => {
    // Test implementation
  });

  it('should allow creating new invitation after ending lease', async () => {
    // Test implementation
  });
});
```

### Krok 8: Code Review Checklist

- [ ] Service layer properly separates business logic
- [ ] Validation schemas for both params and body
- [ ] Early returns for authentication and validation errors
- [ ] Proper HTTP status codes (200, 400, 401, 404, 500)
- [ ] Error messages in Polish
- [ ] Uses context.locals.supabase (not direct import)
- [ ] Proper error logging (console.error for 500)
- [ ] RLS policies enforce owner-only access
- [ ] TypeScript types are correct
- [ ] JSDoc comments for public functions
- [ ] Tested manually or with integration tests
- [ ] Verified tenant loses access after archive
- [ ] Notes field is optional and validated
- [ ] archived_at timestamp is set correctly

### Krok 9: Documentation Update

Dodaj przykład użycia w dokumentacji API:

```markdown
## Zakończenie najmu

### POST /api/apartments/:id/lease/end

Kończy aktywny najem dla mieszkania. Dostępne tylko dla właściciela.

**Efekty:**
- Status najmu zmienia się na "archived"
- Ustawiane jest pole archived_at
- Lokator automatycznie traci dostęp do danych mieszkania
- Mieszkanie staje się dostępne dla nowego lokatora

**Request:**
```json
{
  "notes": "Koniec umowy najmu. Mieszkanie w dobrym stanie."
}
```

**Response 200:**
```json
{
  "id": "uuid",
  "status": "archived",
  "archived_at": "2025-01-12T10:00:00Z",
  ...
}
```
```

## 10. Checklist gotowości do produkcji

### Pre-deployment:
- [ ] Kod przechodzi linting (ESLint)
- [ ] Kod przechodzi type checking (TypeScript)
- [ ] Manual testing dla wszystkich scenariuszy
- [ ] Verified RLS policies block tenant updates
- [ ] Verified tenant loses access after archive
- [ ] Error messages tested
- [ ] Validated notes max length enforcement
- [ ] Performance testing (response time < 700ms)

### Security:
- [ ] Only owner can end lease (RLS verified)
- [ ] Input validation prevents XSS/injection
- [ ] Error messages don't leak sensitive data
- [ ] JWT authentication enforced
- [ ] UUID validation prevents enumeration

### Data Integrity:
- [ ] archived_at timestamp set correctly
- [ ] tenant_id preserved for history
- [ ] Status changed to 'archived'
- [ ] No cascade deletion issues
- [ ] Apartment available for new invitations

### Monitoring:
- [ ] Log successful lease endings (info level)
- [ ] Log unauthorized attempts (warning level)
- [ ] Monitor 404 rate (may indicate UI issues)
- [ ] Track response times
- [ ] Alert on high 500 error rate

### Post-deployment:
- [ ] Verify endpoint works in production
- [ ] Test with real JWT tokens
- [ ] Monitor error logs for first 48h
- [ ] Verify RLS works correctly in production
- [ ] Test tenant access loss in production
- [ ] Verify new invitations work after lease end
