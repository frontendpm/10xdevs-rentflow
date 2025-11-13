# API Endpoint Implementation Plan: GET /api/apartments/:id/leases

## 1. Przegląd punktu końcowego

Endpoint pobiera pełną historię najmów dla określonego mieszkania, włącznie z aktywnymi i archiwalnymi najmami. Jest to endpoint dostępny wyłącznie dla właściciela mieszkania, który pozwala na przegląd historii lokatorów, śledzenie dat rozpoczęcia i zakończenia najmów oraz zarządzanie dokumentacją najmu.

**Główne zastosowania:**
- Przeglądanie historii lokatorów mieszkania
- Audyt najmów dla celów księgowych
- Sprawdzanie dat najmów dla raportowania
- Przygotowanie dokumentacji dla nowych lokatorów

**Kluczowe funkcje:**
- Zwraca wszystkie najmy (active + archived)
- Opcjonalne filtrowanie po statusie
- Sortowanie od najnowszych do najstarszych
- Uproszczone dane lokatora (tylko full_name)

## 2. Szczegóły żądania

- **Metoda HTTP:** GET
- **Struktura URL:** `/api/apartments/:id/leases`
- **Parametry:**
  - **Wymagane:**
    - `id` (path parameter) - UUID mieszkania
  - **Opcjonalne:**
    - `status` (query parameter) - filtr statusu ('active' | 'archived')
- **Request Body:** brak (metoda GET)
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagane)

**Przykłady żądań:**

```http
# Wszystkie najmy
GET /api/apartments/550e8400-e29b-41d4-a716-446655440000/leases
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Tylko aktywne najmy
GET /api/apartments/550e8400-e29b-41d4-a716-446655440000/leases?status=active
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Tylko zarchiwizowane najmy
GET /api/apartments/550e8400-e29b-41d4-a716-446655440000/leases?status=archived
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 3. Wykorzystywane typy

### DTOs (z src/types.ts):

```typescript
/**
 * Lease history item DTO
 * @endpoint GET /api/apartments/:apartmentId/leases
 */
export type LeaseHistoryItemDTO = Pick<
  Tables<'leases'>,
  'id' | 'status' | 'start_date' | 'archived_at'
> & {
  tenant: Pick<Tables<'users'>, 'full_name'>;
};

/**
 * Lease history response DTO
 * @endpoint GET /api/apartments/:apartmentId/leases
 */
export type LeaseHistoryDTO = {
  leases: LeaseHistoryItemDTO[];
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
  archived_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

// Enums<'lease_status'>:
type LeaseStatus = 'active' | 'archived';
```

### Validation Schemas:

```typescript
const apartmentIdParamSchema = z.object({
  id: z.string().uuid({
    message: 'Nieprawidłowy identyfikator mieszkania'
  })
});

const leaseStatusQuerySchema = z.object({
  status: z
    .enum(['active', 'archived'], {
      errorMap: () => ({ message: 'Status musi być "active" lub "archived"' })
    })
    .optional()
});
```

## 4. Szczegóły odpowiedzi

### Response 200 (Success):

**Bez filtru (wszystkie najmy):**
```json
{
  "leases": [
    {
      "id": "uuid",
      "status": "active",
      "start_date": "2025-01-01",
      "archived_at": null,
      "tenant": {
        "full_name": "Anna Kowalska"
      }
    },
    {
      "id": "uuid",
      "status": "archived",
      "start_date": "2024-01-01",
      "archived_at": "2024-12-31T23:59:59Z",
      "tenant": {
        "full_name": "Piotr Nowak"
      }
    }
  ]
}
```

**Z filtrem status=active:**
```json
{
  "leases": [
    {
      "id": "uuid",
      "status": "active",
      "start_date": "2025-01-01",
      "archived_at": null,
      "tenant": {
        "full_name": "Anna Kowalska"
      }
    }
  ]
}
```

**Pusta lista (brak najmów):**
```json
{
  "leases": []
}
```

**Kody statusu:**
- `200 OK` - Pomyślnie pobrano historię najmów (nawet jeśli pusta)
- `400 Bad Request` - Nieprawidłowy parametr (invalid UUID lub status)
- `401 Unauthorized` - Brak autoryzacji
- `403 Forbidden` - Nie jesteś właścicielem mieszkania
- `404 Not Found` - Mieszkanie nie znalezione (lub brak dostępu)
- `500 Internal Server Error` - Błąd serwera

### Error Response Format:

```json
{
  "error": "Validation Error",
  "message": "Status musi być \"active\" lub \"archived\""
}
```

## 5. Przepływ danych

### 5.1. Request Flow:

```
1. Client Request (GET with optional status query)
   ↓
2. API Route Handler (/api/apartments/[id]/leases.ts)
   ↓
3. Authentication Check (middleware - context.locals.user)
   ↓
4. Input Validation (Zod schemas)
   |
   ├─→ Validate apartmentId (UUID)
   └─→ Validate status query param (optional: 'active' | 'archived')
   ↓
5. Service Layer (lease.service.ts - getLeaseHistory)
   ↓
6. Database Query (Supabase with RLS)
   |
   ├─→ SELECT leases for apartment_id
   ├─→ JOIN users table for tenant full_name
   ├─→ Optional: WHERE status = ?
   └─→ ORDER BY created_at DESC
   ↓
7. Response Transformation (raw data → LeaseHistoryDTO)
   ↓
8. Return Response (200 or error)
```

### 5.2. Database Query:

```typescript
// Przykładowe zapytanie w lease.service.ts
const query = supabase
  .from('leases')
  .select(`
    id,
    status,
    start_date,
    archived_at,
    tenant:users!tenant_id (
      full_name
    )
  `)
  .eq('apartment_id', apartmentId)
  .order('created_at', { ascending: false });

// Optional status filter
if (statusFilter) {
  query.eq('status', statusFilter);
}

const { data: leases, error } = await query;
```

**RLS automatycznie filtruje wyniki:**
- Policy: "Owners can view leases for their apartments"
- Sprawdza czy `apartments.owner_id = auth.uid()`
- Lokatorzy NIE mają dostępu do tego endpointu

### 5.3. Service Layer Logic:

```typescript
// src/lib/services/lease.service.ts
export async function getLeaseHistory(
  supabase: SupabaseClient,
  apartmentId: string,
  statusFilter?: 'active' | 'archived'
): Promise<LeaseHistoryItemDTO[]> {
  // Build query
  let query = supabase
    .from('leases')
    .select(`
      id,
      status,
      start_date,
      archived_at,
      tenant:users!tenant_id (full_name)
    `)
    .eq('apartment_id', apartmentId)
    .order('created_at', { ascending: false });

  // Apply optional status filter
  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  // Execute query
  const { data: leases, error } = await query;

  if (error) {
    console.error('Database error in getLeaseHistory:', error);
    throw new Error('DATABASE_ERROR');
  }

  // RLS will return empty array if user doesn't have access
  return leases as LeaseHistoryItemDTO[];
}
```

### 5.4. Sortowanie:

**Default ordering:** `created_at DESC` (najnowsze najmy na górze)

**Rationale:**
- Właściciel najpierw widzi aktualne najmy
- Historia jest uporządkowana chronologicznie od najnowszych
- Zgodne z UX best practices dla list historycznych

## 6. Względy bezpieczeństwa

### 6.1. Authentication:
- **JWT Token:** Wymagany w nagłówku Authorization
- **Middleware:** Sprawdzenie `context.locals.user`
- **Early return:** Brak użytkownika → 401

### 6.2. Authorization (RLS):
- **Owner-only access:** Tylko właściciel może zobaczyć historię najmów
- **RLS Policy:**
  ```sql
  -- Owners can view leases for their apartments
  CREATE POLICY "Owners can view leases for their apartments"
    ON leases FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM apartments
        WHERE apartments.id = leases.apartment_id
          AND apartments.owner_id = auth.uid()
      )
    );
  ```
- **Tenant exclusion:** Lokatorzy NIE widzą historii (tylko swój aktywny najem)

### 6.3. Input Validation:
- **apartmentId:** UUID validation (Zod)
- **status:** Enum validation ('active' | 'archived') (Zod)
- **No SQL injection:** Supabase prepared statements

### 6.4. Data Sanitization:
- **Minimal tenant data:** Tylko full_name (nie email, nie ID)
- **No sensitive data:** Nie zwracamy notes, created_by, itp.
- **Type safety:** TypeScript types enforce structure

### 6.5. Information Disclosure Prevention:

| Ryzyko | Mitigation |
|--------|-----------|
| Enumeration attack (checking if apartment exists) | Same 404 response for "not found" vs "no access" |
| Tenant data leakage | Only full_name exposed (no email, phone) |
| Owner data leakage | RLS prevents cross-owner access |
| Status filter bypass | Enum validation prevents invalid values |

### 6.6. Potential Security Risks:

1. **Information leakage via timing:**
   - Response time może różnić się dla pustej listy vs brak dostępu
   - **Mitigation:** Akceptowalne dla MVP, monitor dla anomalii

2. **Tenant enumeration:**
   - Można zobaczyć imiona poprzednich lokatorów
   - **Mitigation:** Expected behavior - owner needs this info

3. **Status filter injection:**
   - Nieprawidłowe wartości filtra
   - **Mitigation:** Zod enum validation

## 7. Obsługa błędów

### 7.1. Tabela błędów:

| Kod | Scenariusz | Response | Logowanie | Akcja |
|-----|-----------|----------|-----------|-------|
| 200 | Success (even if empty array) | `{ "leases": [] }` | Info (optional) | Return data |
| 400 | Invalid UUID | `{ "error": "Validation Error", "message": "Nieprawidłowy identyfikator mieszkania" }` | Info | Return Zod error |
| 400 | Invalid status filter | `{ "error": "Validation Error", "message": "Status musi być \"active\" lub \"archived\"" }` | Info | Return Zod error |
| 401 | No auth | `{ "error": "Unauthorized", "message": "Brak autoryzacji" }` | Info | Early return |
| 403 | Not owner | `{ "error": "Forbidden", "message": "Nie masz uprawnień do dostępu do historii najmów" }` | Warning | RLS blocked query |
| 404 | Apartment not found | `{ "error": "Not Found", "message": "Mieszkanie nie zostało znalezione" }` | Info | Return 404 |
| 500 | Database error | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` | Error | Log and return generic |

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

  // 3. Validate query parameters
  const url = new URL(context.request.url);
  const statusParam = url.searchParams.get('status');

  let statusFilter: 'active' | 'archived' | undefined;
  if (statusParam) {
    const validatedQuery = leaseStatusQuerySchema.parse({ status: statusParam });
    statusFilter = validatedQuery.status;
  }

  // 4. Service call
  const leases = await getLeaseHistory(
    context.locals.supabase,
    validatedParams.id,
    statusFilter
  );

  // 5. Check if user has access (RLS returns empty array if no access)
  // This is ambiguous: could be no leases OR no access
  // For MVP, accept this ambiguity (both return 200 with empty array)

  // 6. Happy path - return success
  return new Response(JSON.stringify({ leases }), {
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
  if (error instanceof Error && error.message === 'DATABASE_ERROR') {
    console.error('Database error in getLeaseHistory:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Wystąpił błąd serwera'
    }), { status: 500 });
  }

  // Unexpected errors
  console.error('Unexpected error in GET /api/apartments/:id/leases:', error);
  return new Response(JSON.stringify({
    error: 'Internal Server Error',
    message: 'Wystąpił błąd serwera'
  }), { status: 500 });
}
```

### 7.3. Ambiguity: Empty Array vs No Access

**Problem:**
- RLS zwraca pustą tablicę zarówno gdy:
  1. Brak najmów dla mieszkania (legitimate)
  2. Brak dostępu do mieszkania (security)

**Options:**
1. **Accept ambiguity:** Obie zwracają 200 z pustą tablicą
2. **Additional query:** Sprawdź czy mieszkanie istnieje i czy user jest właścicielem

**Rekomendacja dla MVP:** Accept ambiguity (option 1)
- **Pros:** Prostszy kod, szybsze zapytanie
- **Cons:** Nie rozróżnia "no leases" vs "no access"
- **Mitigation:** Frontend nigdy nie powinien requestować dla mieszkania, do którego nie ma dostępu

### 7.4. Logging Strategy:

```typescript
// Info level - successful requests
console.info(`Lease history fetched for apartment: ${apartmentId}, count: ${leases.length}`);

// Warning level - potential security issues
console.warn(`Unauthorized lease history access attempt: apartment=${apartmentId}, user=${userId}`);

// Error level - unexpected failures
console.error('Database error in getLeaseHistory:', {
  apartmentId,
  userId,
  error: error.message,
  stack: error.stack
});
```

## 8. Rozważania dotyczące wydajności

### 8.1. Potencjalne wąskie gardła:

1. **JOIN with users table:**
   - Każdy najem wymaga JOIN z users dla full_name
   - **Optymalizacja:** Index na leases.tenant_id (już istnieje: idx_leases_tenant_id)

2. **RLS policy evaluation:**
   - Policy sprawdza EXISTS subquery dla każdego wiersza
   - **Optymalizacja:** Index na apartments.owner_id (już istnieje: idx_apartments_owner_id)

3. **Filtering and sorting:**
   - ORDER BY created_at DESC może być wolne dla dużej liczby najmów
   - **Optymalizacja:** Index na leases.created_at (rozważyć dodanie w przyszłości)

4. **Large result sets:**
   - Mieszkanie z wieloma najmami (10+ lat historii)
   - **Mitigation:** Pagination (post-MVP feature)

### 8.2. Query Optimization:

**Optymalne zapytanie:**

```typescript
// Select tylko potrzebne pola
.select(`
  id,
  status,
  start_date,
  archived_at,
  tenant:users!tenant_id (full_name)
`)

// NOT: SELECT * (pobiera zbędne dane)
```

**Indeksy (z db-plan.md):**
- ✅ `idx_leases_apartment_id` - dla WHERE apartment_id
- ✅ `idx_leases_tenant_id` - dla JOIN z users
- ✅ `idx_leases_status` - dla WHERE status (opcjonalny filtr)
- ⚠️  `idx_leases_created_at` - brak (rozważyć dla ORDER BY)

**Rekomendacja:** Dodać index na created_at w przyszłości jeśli performance będzie problemem.

### 8.3. Caching Strategy:

**MVP:** Brak cache'owania
- Historia najmów zmienia się rzadko
- Ale musi być aktualna (np. po end lease)
- Cache invalidation byłby złożony

**Post-MVP:** Cache z TTL 5 minut
- Jeśli endpoint często wywoływany
- Invalidate cache po end lease lub create lease

### 8.4. Pagination:

**MVP:** Brak paginacji (zwraca wszystkie najmy)

**Rationale:**
- Większość mieszkań ma 1-5 najmów
- Nawet przy 10+ latach historii: ~10-20 najmów max
- Pagination można dodać post-MVP jeśli potrzebne

**Post-MVP:** Dodać query params:
- `limit`: number of leases per page (default 20)
- `offset`: number of leases to skip
- Response z metadatą: `{ leases: [...], total: 50, page: 1, per_page: 20 }`

### 8.5. Response Time Targets:

- **Target:** < 200ms (95th percentile)
- **Acceptable:** < 500ms
- **Critical:** > 1000ms (requires optimization)

**Factors affecting response time:**
- Number of leases (1-5: fast, 10+: slower)
- RLS policy complexity
- Network latency to Supabase

### 8.6. Monitoring Metrics:

- **Response time** per apartment (detect slow apartments)
- **Result set size** (number of leases returned)
- **Status filter usage** (how often active vs archived filtered)
- **Empty result rate** (may indicate missing leases or access issues)

## 9. Etapy wdrożenia

### Krok 1: Rozszerzenie lease.service.ts

```typescript
// src/lib/services/lease.service.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type { LeaseHistoryItemDTO } from '@/types';
import type { Enums } from '@/db/database.types';

/**
 * Get lease history for an apartment
 *
 * @param supabase - Supabase client with user context
 * @param apartmentId - UUID of the apartment
 * @param statusFilter - Optional filter by lease status ('active' | 'archived')
 * @returns Array of lease history items (empty if no leases or no access via RLS)
 * @throws Error with code 'DATABASE_ERROR' if database query fails
 */
export async function getLeaseHistory(
  supabase: SupabaseClient,
  apartmentId: string,
  statusFilter?: Enums<'lease_status'>
): Promise<LeaseHistoryItemDTO[]> {
  // Build base query
  let query = supabase
    .from('leases')
    .select(`
      id,
      status,
      start_date,
      archived_at,
      tenant:users!tenant_id (
        full_name
      )
    `)
    .eq('apartment_id', apartmentId)
    .order('created_at', { ascending: false });

  // Apply optional status filter
  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  // Execute query
  const { data: leases, error } = await query;

  if (error) {
    console.error('Database error in getLeaseHistory:', error);
    const dbError = new Error('DATABASE_ERROR');
    dbError.name = 'DATABASE_ERROR';
    throw dbError;
  }

  // RLS will return empty array if user doesn't have access
  // This is acceptable - we treat "no access" same as "no leases"
  return leases as LeaseHistoryItemDTO[];
}
```

### Krok 2: Dodanie validation schemas

```typescript
// src/lib/validations/lease.validation.ts
import { z } from 'zod';

/**
 * Validation schema for apartment ID parameter
 */
export const apartmentIdParamSchema = z.object({
  id: z.string().uuid({
    message: 'Nieprawidłowy identyfikator mieszkania'
  })
});

/**
 * Validation schema for lease status query parameter
 */
export const leaseStatusQuerySchema = z.object({
  status: z
    .enum(['active', 'archived'], {
      errorMap: () => ({
        message: 'Status musi być "active" lub "archived"'
      })
    })
    .optional()
});
```

### Krok 3: Utworzenie API route

```bash
# Plik już może istnieć po implementacji poprzednich endpointów
touch src/pages/api/apartments/[id]/leases.ts
```

### Krok 4: Implementacja API route

```typescript
// src/pages/api/apartments/[id]/leases.ts
import type { APIContext } from 'astro';
import { z } from 'zod';
import { getLeaseHistory } from '@/lib/services/lease.service';
import {
  apartmentIdParamSchema,
  leaseStatusQuerySchema
} from '@/lib/validations/lease.validation';
import type { Enums } from '@/db/database.types';

export const prerender = false;

/**
 * GET /api/apartments/:id/leases
 *
 * Gets all leases (active and archived) for an apartment.
 * Owner-only endpoint that returns lease history with tenant information.
 *
 * @authorization Owner of the apartment
 * @param id - UUID of the apartment (path parameter)
 * @query status - Optional filter by lease status ('active' | 'archived')
 * @returns 200 - LeaseHistoryDTO with array of leases
 * @returns 400 - Validation error
 * @returns 401 - Unauthorized
 * @returns 403 - Forbidden (not owner)
 * @returns 500 - Server error
 */
export async function GET(context: APIContext) {
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

    // 3. Parse and validate query parameters
    const url = new URL(context.request.url);
    const statusParam = url.searchParams.get('status');

    let statusFilter: Enums<'lease_status'> | undefined;
    if (statusParam) {
      const validatedQuery = leaseStatusQuerySchema.safeParse({
        status: statusParam
      });

      if (!validatedQuery.success) {
        return new Response(
          JSON.stringify({
            error: 'Validation Error',
            message: validatedQuery.error.errors[0].message
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      statusFilter = validatedQuery.data.status;
    }

    // 4. Get supabase client from context
    const supabase = context.locals.supabase;

    // 5. Fetch lease history
    const leases = await getLeaseHistory(
      supabase,
      apartmentId,
      statusFilter
    );

    // 6. Log success (optional)
    console.info(
      `Lease history fetched for apartment: ${apartmentId}, count: ${leases.length}, filter: ${statusFilter || 'none'}`
    );

    // 7. Return success response (200 even if empty array)
    return new Response(
      JSON.stringify({ leases }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    // Handle business logic errors
    if (error instanceof Error && error.name === 'DATABASE_ERROR') {
      console.error('Database error in getLeaseHistory:', error);
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

    // Unexpected errors
    console.error('Unexpected error in GET /api/apartments/:id/leases:', error);
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
# Test 1: Get all leases (as owner)
curl -X GET \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/leases \
  -H "Authorization: Bearer <owner-jwt-token>"

# Expected: 200 OK with array of leases (active + archived)

# Test 2: Filter by active status
curl -X GET \
  "http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/leases?status=active" \
  -H "Authorization: Bearer <owner-jwt-token>"

# Expected: 200 OK with only active leases

# Test 3: Filter by archived status
curl -X GET \
  "http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/leases?status=archived" \
  -H "Authorization: Bearer <owner-jwt-token>"

# Expected: 200 OK with only archived leases

# Test 4: Invalid status filter
curl -X GET \
  "http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/leases?status=invalid" \
  -H "Authorization: Bearer <owner-jwt-token>"

# Expected: 400 Validation Error

# Test 5: Without authorization
curl -X GET \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/leases

# Expected: 401 Unauthorized

# Test 6: As tenant (not owner)
curl -X GET \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/leases \
  -H "Authorization: Bearer <tenant-jwt-token>"

# Expected: 200 OK with empty array (RLS blocks access)

# Test 7: Invalid UUID
curl -X GET \
  http://localhost:4321/api/apartments/invalid-uuid/leases \
  -H "Authorization: Bearer <owner-jwt-token>"

# Expected: 400 Validation Error

# Test 8: Apartment with no leases
curl -X GET \
  http://localhost:4321/api/apartments/00000000-0000-0000-0000-000000000000/leases \
  -H "Authorization: Bearer <owner-jwt-token>"

# Expected: 200 OK with empty array
```

**5.2. Weryfikacja sortowania:**

```bash
# Create multiple leases and verify order
# Newest lease should be first in response

# Response should be ordered by created_at DESC:
# [
#   { id: 'lease-3', status: 'active', start_date: '2025-01-01', ... },
#   { id: 'lease-2', status: 'archived', start_date: '2024-01-01', ... },
#   { id: 'lease-1', status: 'archived', start_date: '2023-01-01', ... }
# ]
```

**5.3. Weryfikacja filtru:**

```bash
# Verify filtering works correctly
# status=active should only return active leases
# status=archived should only return archived leases
# No filter should return both
```

### Krok 6: Weryfikacja RLS policies

```sql
-- Test RLS manually in Supabase SQL Editor

-- 1. Create test data
INSERT INTO leases (apartment_id, tenant_id, status, start_date, created_by)
VALUES
  ('<apartment-uuid>', '<tenant-1-uuid>', 'archived', '2023-01-01', '<owner-uuid>'),
  ('<apartment-uuid>', '<tenant-2-uuid>', 'archived', '2024-01-01', '<owner-uuid>'),
  ('<apartment-uuid>', '<tenant-3-uuid>', 'active', '2025-01-01', '<owner-uuid>');

-- 2. Set auth context (simulate owner)
SELECT set_config('request.jwt.claim.sub', '<owner-uuid>', true);

-- 3. Query as owner
SELECT * FROM leases
WHERE apartment_id = '<apartment-uuid>'
ORDER BY created_at DESC;

-- Expected: All 3 leases visible

-- 4. Set auth context (simulate tenant)
SELECT set_config('request.jwt.claim.sub', '<tenant-3-uuid>', true);

-- 5. Query as tenant
SELECT * FROM leases
WHERE apartment_id = '<apartment-uuid>';

-- Expected: Only active lease for this tenant (1 row)

-- 6. Query history as tenant (should fail)
SELECT * FROM leases
WHERE apartment_id = '<apartment-uuid>' AND status = 'archived';

-- Expected: 0 rows (archived leases not visible to tenant)
```

### Krok 7: Performance Testing

```bash
# Create apartment with many leases (simulate 10 years)
# Test response time

time curl -X GET \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/leases \
  -H "Authorization: Bearer <owner-jwt-token>"

# Expected response time: < 500ms even with 20+ leases
```

### Krok 8: Integration Testing (opcjonalnie)

```typescript
// tests/api/apartments/leases.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('GET /api/apartments/:id/leases', () => {
  it('should return 401 without authentication', async () => {
    // Test implementation
  });

  it('should return 200 with all leases for owner', async () => {
    // Test implementation
  });

  it('should return 200 with empty array for tenant', async () => {
    // Test implementation - RLS blocks access
  });

  it('should filter by status=active correctly', async () => {
    // Test implementation
  });

  it('should filter by status=archived correctly', async () => {
    // Test implementation
  });

  it('should return 400 for invalid status filter', async () => {
    // Test implementation
  });

  it('should return 400 for invalid UUID', async () => {
    // Test implementation
  });

  it('should order leases by created_at DESC', async () => {
    // Test implementation
  });

  it('should return 200 with empty array when no leases', async () => {
    // Test implementation
  });

  it('should only include full_name in tenant data', async () => {
    // Test - verify no email/id exposed
  });
});
```

### Krok 9: Code Review Checklist

- [ ] Service layer separates business logic
- [ ] Validation schemas for params and query
- [ ] Early returns for authentication errors
- [ ] Proper HTTP status codes (200, 400, 401, 500)
- [ ] Error messages in Polish
- [ ] Uses context.locals.supabase (not import)
- [ ] Proper error logging (console.error for 500)
- [ ] RLS policies enforce owner-only access
- [ ] TypeScript types are correct (LeaseHistoryDTO)
- [ ] JSDoc comments for public functions
- [ ] Query selects only necessary fields
- [ ] ORDER BY created_at DESC for chronological order
- [ ] Optional status filter works correctly
- [ ] Returns 200 with empty array (not 404) when no leases
- [ ] No sensitive tenant data exposed (only full_name)
- [ ] Tested manually or with integration tests

### Krok 10: Documentation Update

```markdown
## Historia Najmów

### GET /api/apartments/:id/leases

Pobiera pełną historię najmów dla mieszkania (aktywne i archiwalne).
Dostępne tylko dla właściciela.

**Query Parameters:**
- `status` (optional): Filter by lease status
  - `active` - tylko aktywne najmy
  - `archived` - tylko zarchiwizowane najmy
  - brak parametru - wszystkie najmy

**Response 200:**
```json
{
  "leases": [
    {
      "id": "uuid",
      "status": "active",
      "start_date": "2025-01-01",
      "archived_at": null,
      "tenant": {
        "full_name": "Anna Kowalska"
      }
    }
  ]
}
```

**Uwagi:**
- Najmy sortowane od najnowszych (created_at DESC)
- Pusta tablica gdy brak najmów
- Tylko właściciel ma dostęp (RLS)
```

## 10. Checklist gotowości do produkcji

### Pre-deployment:
- [ ] Kod przechodzi linting (ESLint)
- [ ] Kod przechodzi type checking (TypeScript)
- [ ] Manual testing dla wszystkich scenariuszy
- [ ] Status filter validation tested
- [ ] Verified RLS blocks tenant access
- [ ] Verified ordering (newest first)
- [ ] Empty array handling tested
- [ ] Performance testing (< 500ms with 20+ leases)

### Security:
- [ ] Only owner can access (RLS verified)
- [ ] No sensitive tenant data exposed
- [ ] Input validation prevents injection
- [ ] Error messages don't leak data
- [ ] JWT authentication enforced

### Data Integrity:
- [ ] Correct JOIN with users table
- [ ] Optional status filter works
- [ ] ORDER BY created_at DESC
- [ ] Empty array for no leases (not 404)
- [ ] No cascade deletion issues

### Performance:
- [ ] Query optimized (select specific fields)
- [ ] Indexes exist (apartment_id, tenant_id, status)
- [ ] Response time < 500ms
- [ ] Consider adding created_at index if needed

### Monitoring:
- [ ] Log successful requests (info level)
- [ ] Log unauthorized attempts (warning level)
- [ ] Monitor response times
- [ ] Track result set sizes
- [ ] Alert on high 500 error rate

### Post-deployment:
- [ ] Verify endpoint works in production
- [ ] Test with real JWT tokens
- [ ] Monitor error logs for first 48h
- [ ] Verify RLS works correctly in production
- [ ] Test filtering in production
- [ ] Verify ordering is correct
- [ ] Check performance with real data

### Future Enhancements (Post-MVP):
- [ ] Add pagination (limit/offset)
- [ ] Add caching with TTL
- [ ] Add created_at index for better sorting
- [ ] Consider adding lease count metadata
- [ ] Add support for date range filtering
