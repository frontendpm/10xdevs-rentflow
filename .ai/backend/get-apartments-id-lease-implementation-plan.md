# API Endpoint Implementation Plan: GET /api/apartments/:id/lease

## 1. Przegląd punktu końcowego

Endpoint pobiera aktywny najem dla określonego mieszkania wraz ze szczegółowymi informacjami o lokatorze. Jest to endpoint read-only, który zwraca dane o aktualnym najmie mieszkania. Dostęp do endpointu mają właściciel mieszkania oraz lokator posiadający aktywny najem w tym mieszkaniu.

**Główne zastosowania:**
- Wyświetlanie szczegółów aktywnego najmu na stronie mieszkania
- Sprawdzanie statusu najmu przed wykonaniem operacji
- Pobieranie danych lokatora przez właściciela

## 2. Szczegóły żądania

- **Metoda HTTP:** GET
- **Struktura URL:** `/api/apartments/:id/lease`
- **Parametry:**
  - **Wymagane:**
    - `id` (path parameter) - UUID mieszkania
  - **Opcjonalne:** brak
- **Request Body:** brak (metoda GET)
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagane)

**Przykład żądania:**
```http
GET /api/apartments/550e8400-e29b-41d4-a716-446655440000/lease
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 3. Wykorzystywane typy

### DTOs (z src/types.ts):

```typescript
/**
 * Active lease DTO
 * @endpoint GET /api/apartments/:apartmentId/lease
 */
export type ActiveLeaseDTO = Tables<'leases'> & {
  tenant: TenantInfo;
};

/**
 * Tenant-specific user information
 */
export type TenantInfo = UserInfo;

/**
 * Partial user information for tenant/owner references
 */
export type UserInfo = Pick<Tables<'users'>, 'id' | 'full_name' | 'email'>;
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
```

## 4. Szczegóły odpowiedzi

### Response 200 (Success):

```json
{
  "id": "uuid",
  "apartment_id": "uuid",
  "tenant_id": "uuid",
  "status": "active",
  "start_date": "2025-01-01",
  "notes": "Lokator preferuje kontakt przez email",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-01T10:00:00Z",
  "tenant": {
    "id": "uuid",
    "full_name": "Anna Kowalska",
    "email": "anna@example.com"
  }
}
```

**Kody statusu:**
- `200 OK` - Pomyślnie pobrano aktywny najem
- `401 Unauthorized` - Brak autoryzacji (brak tokenu JWT lub token wygasł)
- `403 Forbidden` - Użytkownik nie ma uprawnień do dostępu do tego mieszkania
- `404 Not Found` - Brak aktywnego najmu dla tego mieszkania
- `500 Internal Server Error` - Błąd serwera

### Error Response Format:

```json
{
  "error": "Not Found",
  "message": "Brak aktywnego najmu dla tego mieszkania"
}
```

## 5. Przepływ danych

### 5.1. Request Flow:

```
1. Client Request
   ↓
2. API Route Handler (/api/apartments/[id]/lease.ts)
   ↓
3. Authentication Check (middleware - context.locals.user)
   ↓
4. Input Validation (Zod schema - apartmentId UUID)
   ↓
5. Service Layer (lease.service.ts - getActiveLease)
   ↓
6. Database Query (Supabase with RLS)
   |
   ├─→ SELECT lease with status='active' for apartment
   └─→ JOIN users table for tenant info
   ↓
7. Response Transformation (raw data → ActiveLeaseDTO)
   ↓
8. Return Response (200 or error)
```

### 5.2. Database Query:

```typescript
// Przykładowe zapytanie w lease.service.ts
const { data: lease, error } = await supabase
  .from('leases')
  .select(`
    *,
    tenant:users!tenant_id (
      id,
      full_name,
      email
    )
  `)
  .eq('apartment_id', apartmentId)
  .eq('status', 'active')
  .single();
```

**RLS automatycznie filtruje wyniki:**
- Dla właściciela: sprawdza czy `apartments.owner_id = auth.uid()`
- Dla lokatora: sprawdza czy `leases.tenant_id = auth.uid() AND status = 'active'`

### 5.3. Service Layer Logic:

```typescript
// src/lib/services/lease.service.ts
export async function getActiveLease(
  supabase: SupabaseClient,
  apartmentId: string
): Promise<ActiveLeaseDTO | null> {
  // 1. Query database
  const { data: lease, error } = await supabase
    .from('leases')
    .select(`
      *,
      tenant:users!tenant_id (id, full_name, email)
    `)
    .eq('apartment_id', apartmentId)
    .eq('status', 'active')
    .single();

  // 2. Handle error
  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    throw error;
  }

  // 3. Return typed result
  return lease as ActiveLeaseDTO;
}
```

## 6. Względy bezpieczeństwa

### 6.1. Authentication:
- **JWT Token:** Wymagany w nagłówku Authorization
- **Middleware:** Sprawdzenie `context.locals.user` (ustawiane przez middleware Astro)
- **Early return:** Jeśli brak użytkownika → 401 Unauthorized

### 6.2. Authorization (RLS):
- **Row Level Security** automatycznie filtruje wyniki zapytań
- **Policy dla właścicieli:**
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
- **Policy dla lokatorów:**
  ```sql
  -- Tenants can view their active lease
  CREATE POLICY "Tenants can view their active lease"
    ON leases FOR SELECT
    TO authenticated
    USING (
      tenant_id = auth.uid() AND status = 'active'
    );
  ```

### 6.3. Input Validation:
- **apartmentId:** Walidacja UUID za pomocą Zod
  ```typescript
  const paramSchema = z.object({
    id: z.string().uuid({ message: 'Nieprawidłowy identyfikator mieszkania' })
  });
  ```

### 6.4. Data Sanitization:
- Supabase automatycznie używa prepared statements (ochrona przed SQL injection)
- TypeScript types zapewniają type safety
- Brak user-generated content w tym endpoincie (tylko odczyt)

### 6.5. Potential Security Risks:
- **Timing attacks:** Możliwe rozróżnienie czy mieszkanie istnieje vs brak najmu (obie zwracają 404)
- **Mitigation:** Zawsze zwracaj ten sam komunikat błędu 404
- **Information disclosure:** Nie ujawniaj szczegółów błędów bazy danych (tylko generic 500)

## 7. Obsługa błędów

### 7.1. Tabela błędów:

| Kod | Scenariusz | Response | Logowanie |
|-----|-----------|----------|-----------|
| 401 | Brak tokenu JWT lub token wygasł | `{ "error": "Unauthorized", "message": "Brak autoryzacji" }` | Info |
| 403 | Użytkownik nie ma dostępu do mieszkania | `{ "error": "Forbidden", "message": "Nie masz uprawnień do dostępu do tego mieszkania" }` | Warning |
| 404 | Brak aktywnego najmu dla mieszkania | `{ "error": "Not Found", "message": "Brak aktywnego najmu dla tego mieszkania" }` | Info |
| 400 | Nieprawidłowy format UUID | `{ "error": "Validation Error", "message": "Nieprawidłowy identyfikator mieszkania" }` | Info |
| 500 | Błąd bazy danych lub serwera | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` | Error |

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

  // 2. Input validation (early return)
  const validatedParams = paramSchema.parse(context.params);

  // 3. Service call
  const lease = await getActiveLease(supabase, validatedParams.id);

  // 4. Not found check (early return)
  if (!lease) {
    return new Response(JSON.stringify({
      error: 'Not Found',
      message: 'Brak aktywnego najmu dla tego mieszkania'
    }), { status: 404 });
  }

  // 5. Happy path - return success
  return new Response(JSON.stringify(lease), {
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

  // Database or other errors
  console.error('Error fetching active lease:', error);
  return new Response(JSON.stringify({
    error: 'Internal Server Error',
    message: 'Wystąpił błąd serwera'
  }), { status: 500 });
}
```

### 7.3. Logging Strategy:

- **Info level:** 401, 404, 400 (expected errors)
- **Warning level:** 403 (potential security issue - unauthorized access attempt)
- **Error level:** 500 (unexpected errors, database issues)

```typescript
console.info(`Active lease not found for apartment: ${apartmentId}`);
console.warn(`Unauthorized access attempt to apartment: ${apartmentId} by user: ${userId}`);
console.error('Database error in getActiveLease:', error);
```

## 8. Rozważania dotyczące wydajności

### 8.1. Potencjalne wąskie gardła:

1. **Database JOIN:** Zapytanie łączy tabele `leases` i `users`
   - **Optymalizacja:** Indeksy na `leases.apartment_id`, `leases.tenant_id`, `leases.status`
   - **Już zaimplementowane w db-plan.md:**
     - `idx_leases_apartment_id`
     - `idx_leases_tenant_id`
     - `idx_leases_status`

2. **RLS Policy Evaluation:** Supabase musi sprawdzić dwie policy (owner + tenant)
   - **Optymalizacja:** Partial indexes na aktywne najmy
   - **Już zaimplementowane:** `idx_one_active_lease_per_apartment`

3. **Network Latency:** Czas odpowiedzi Supabase
   - **Mitigation:** Brak - infrastruktura managed przez Supabase
   - **Monitoring:** Rozważ dodanie metryk czasów odpowiedzi

### 8.2. Caching Strategy:

**Nie zalecane dla MVP:**
- Dane najmu zmieniają się rzadko, ale muszą być aktualne
- Cache invalidation byłby skomplikowany (end lease, new tenant)
- Overhead zarządzania cache nie jest uzasadniony dla MVP

**Post-MVP:** Rozważyć cache z TTL 1 minuta jeśli:
- Endpoint jest często wywoływany
- Performance monitoring wskazuje na problem

### 8.3. Query Optimization:

```typescript
// Optymalne zapytanie - pobiera tylko potrzebne pola
.select(`
  id,
  apartment_id,
  tenant_id,
  status,
  start_date,
  archived_at,
  notes,
  created_at,
  updated_at,
  created_by,
  tenant:users!tenant_id (id, full_name, email)
`)
```

**Unikaj:**
- `SELECT *` - pobiera niepotrzebne dane
- Nested queries - zwiększa złożoność

### 8.4. Response Time Targets:

- **Target:** < 200ms (95th percentile)
- **Acceptable:** < 500ms
- **Critical:** > 1000ms (wymaga optymalizacji)

## 9. Etapy wdrożenia

### Krok 1: Utworzenie struktury plików

```bash
# Utworzenie pliku service
touch src/lib/services/lease.service.ts

# Utworzenie API route
mkdir -p src/pages/api/apartments/[id]
touch src/pages/api/apartments/[id]/lease.ts
```

### Krok 2: Implementacja lease.service.ts

```typescript
// src/lib/services/lease.service.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type { ActiveLeaseDTO } from '@/types';

/**
 * Get active lease for an apartment
 *
 * @param supabase - Supabase client with user context
 * @param apartmentId - UUID of the apartment
 * @returns Active lease with tenant info or null if not found
 * @throws Error if database query fails
 */
export async function getActiveLease(
  supabase: SupabaseClient,
  apartmentId: string
): Promise<ActiveLeaseDTO | null> {
  const { data: lease, error } = await supabase
    .from('leases')
    .select(`
      id,
      apartment_id,
      tenant_id,
      status,
      start_date,
      archived_at,
      notes,
      created_at,
      updated_at,
      created_by,
      tenant:users!tenant_id (
        id,
        full_name,
        email
      )
    `)
    .eq('apartment_id', apartmentId)
    .eq('status', 'active')
    .single();

  if (error) {
    // PGRST116 = No rows returned
    if (error.code === 'PGRST116') {
      return null;
    }

    // Log and throw other errors
    console.error('Database error in getActiveLease:', error);
    throw new Error('Failed to fetch active lease');
  }

  return lease as ActiveLeaseDTO;
}
```

### Krok 3: Implementacja validation schema

```typescript
// src/lib/validations/apartment.validation.ts (lub w pliku route)
import { z } from 'zod';

export const apartmentIdParamSchema = z.object({
  id: z.string().uuid({
    message: 'Nieprawidłowy identyfikator mieszkania'
  })
});
```

### Krok 4: Implementacja API route

```typescript
// src/pages/api/apartments/[id]/lease.ts
import type { APIContext } from 'astro';
import { z } from 'zod';
import { getActiveLease } from '@/lib/services/lease.service';

export const prerender = false;

const paramSchema = z.object({
  id: z.string().uuid({
    message: 'Nieprawidłowy identyfikator mieszkania'
  })
});

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

    // 2. Input validation
    const validated = paramSchema.safeParse(context.params);
    if (!validated.success) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: validated.error.errors[0].message
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const { id: apartmentId } = validated.data;

    // 3. Get supabase client from context
    const supabase = context.locals.supabase;

    // 4. Fetch active lease
    const lease = await getActiveLease(supabase, apartmentId);

    // 5. Check if lease exists
    if (!lease) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Brak aktywnego najmu dla tego mieszkania'
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 6. Return success response
    return new Response(JSON.stringify(lease), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Log error for debugging
    console.error('Error in GET /api/apartments/:id/lease:', error);

    // Return generic error to client
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
# Test jako właściciel
curl -X GET \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/lease \
  -H "Authorization: Bearer <owner-jwt-token>"

# Expected: 200 OK z danymi najmu

# Test jako lokator
curl -X GET \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/lease \
  -H "Authorization: Bearer <tenant-jwt-token>"

# Expected: 200 OK z danymi najmu (jeśli to jego mieszkanie)

# Test bez autoryzacji
curl -X GET \
  http://localhost:4321/api/apartments/550e8400-e29b-41d4-a716-446655440000/lease

# Expected: 401 Unauthorized

# Test z nieprawidłowym UUID
curl -X GET \
  http://localhost:4321/api/apartments/invalid-uuid/lease \
  -H "Authorization: Bearer <jwt-token>"

# Expected: 400 Validation Error

# Test dla mieszkania bez najmu
curl -X GET \
  http://localhost:4321/api/apartments/00000000-0000-0000-0000-000000000000/lease \
  -H "Authorization: Bearer <owner-jwt-token>"

# Expected: 404 Not Found
```

**5.2. Integration Testing (opcjonalnie):**

```typescript
// tests/api/apartments/lease.test.ts
import { describe, it, expect } from 'vitest';

describe('GET /api/apartments/:id/lease', () => {
  it('should return 401 without authentication', async () => {
    // Test implementation
  });

  it('should return 200 with active lease for owner', async () => {
    // Test implementation
  });

  it('should return 200 with active lease for tenant', async () => {
    // Test implementation
  });

  it('should return 404 when no active lease exists', async () => {
    // Test implementation
  });

  it('should return 400 for invalid UUID', async () => {
    // Test implementation
  });
});
```

### Krok 6: Weryfikacja RLS Policies

Sprawdź w Supabase Dashboard czy RLS policies są włączone:

```sql
-- Sprawdź czy tabela ma włączone RLS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'leases';

-- Sprawdź aktywne policies
SELECT * FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'leases';
```

### Krok 7: Dokumentacja

Dodaj komentarz JSDoc do funkcji service i API route:

```typescript
/**
 * API Endpoint: GET /api/apartments/:id/lease
 *
 * Pobiera aktywny najem dla określonego mieszkania.
 *
 * @authorization Właściciel mieszkania lub lokator z aktywnym najmem
 * @param id - UUID mieszkania (path parameter)
 * @returns 200 - ActiveLeaseDTO z danymi najmu i lokatora
 * @returns 401 - Brak autoryzacji
 * @returns 404 - Brak aktywnego najmu
 * @returns 500 - Błąd serwera
 */
```

### Krok 8: Code Review Checklist

- [ ] Service layer poprawnie wyodrębnia logikę biznesową
- [ ] Walidacja UUID za pomocą Zod
- [ ] Early returns dla błędów
- [ ] Proper HTTP status codes (200, 401, 404, 500)
- [ ] Error messages w języku polskim
- [ ] Używa context.locals.supabase (nie import)
- [ ] Proper error logging (console.error dla 500)
- [ ] RLS policies zapewniają bezpieczeństwo
- [ ] TypeScript types są poprawne (ActiveLeaseDTO)
- [ ] Komentarze JSDoc dla funkcji publicznych
- [ ] Testowane manualnie lub automatycznie

## 10. Checklist gotowości do produkcji

### Pre-deployment:
- [ ] Kod przechodzi linting (ESLint)
- [ ] Kod przechodzi type checking (TypeScript)
- [ ] Manual testing przeprowadzone dla wszystkich scenariuszy
- [ ] RLS policies zweryfikowane w Supabase Dashboard
- [ ] Error messages przetestowane
- [ ] Performance testing (response time < 500ms)

### Monitoring:
- [ ] Dodać logging dla sukcesu (opcjonalnie)
- [ ] Monitorować error rate dla 500
- [ ] Monitorować response times
- [ ] Sprawdzać logi 403 (potential security issues)

### Post-deployment:
- [ ] Verify endpoint works in production
- [ ] Test with real JWT tokens
- [ ] Monitor error logs for first 24h
- [ ] Verify RLS policies work correctly in production
