# API Endpoint Implementation Plan: GET /api/apartments/:id

## 1. Przegląd punktu końcowego

Endpoint zwraca szczegółowe informacje o konkretnym mieszkaniu. Właściciele mogą zobaczyć pełne dane swoich mieszkań wraz z informacjami o aktywnym najmie i lokatorze. Lokatorzy mogą zobaczyć dane mieszkania, w którym aktualnie zamieszkują (z aktywnym najmem).

**Kluczowe cechy:**
- Autoryzacja na poziomie RLS (owner lub tenant z aktywnym najmem)
- Zwraca pełne dane mieszkania wraz z lease info
- 404 jeśli mieszkanie nie istnieje lub użytkownik nie ma dostępu
- Automatyczne dołączanie danych o aktywnym najmie (jeśli istnieje)

## 2. Szczegóły żądania

- **Metoda HTTP:** GET
- **Struktura URL:** `/api/apartments/:id`
- **Parametry:**
  - **Wymagane:**
    - `id` (UUID) - path parameter, identyfikator mieszkania
  - **Opcjonalne:** brak
- **Request Body:** nie dotyczy (GET)
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagany)

## 3. Wykorzystywane typy

**Path Param Validation:**
```typescript
const ApartmentIdParamSchema = z.object({
  id: z.string().uuid('Nieprawidłowy identyfikator mieszkania')
});
```

**DTO (Response):**
```typescript
export type ApartmentDetailsDTO = Tables<'apartments'> & {
  lease?: LeaseInfo;
};

export type LeaseInfo = Pick<Tables<'leases'>, 'id' | 'status' | 'start_date'> & {
  tenant: TenantInfo;
};

export type TenantInfo = Pick<Tables<'users'>, 'id' | 'full_name' | 'email'>;
```

## 4. Szczegóły odpowiedzi

### Success Response (200 OK):
```json
{
  "id": "uuid",
  "name": "Kawalerka na Woli",
  "address": "ul. Złota 44, Warszawa",
  "owner_id": "uuid",
  "created_at": "2025-01-12T10:00:00Z",
  "updated_at": "2025-01-12T10:00:00Z",
  "created_by": "uuid",
  "lease": {
    "id": "uuid",
    "status": "active",
    "start_date": "2025-01-01",
    "tenant_id": "uuid",
    "tenant": {
      "id": "uuid",
      "full_name": "Anna Kowalska",
      "email": "anna@example.com"
    }
  }
}
```

**Uwaga:** Pole `lease` jest opcjonalne - jeśli mieszkanie nie ma aktywnego lokatora, pole to będzie `undefined`.

### Error Responses:

**400 Bad Request (Invalid UUID):**
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowy identyfikator mieszkania"
}
```

**401 Unauthorized:**
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

**404 Not Found:**
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

### Szczegółowy flow:

1. **Pobranie użytkownika z context.locals**
   - Sprawdzenie czy `context.locals.user` istnieje
   - Jeśli nie → 401 Unauthorized

2. **Walidacja path parameter**
   - Parsowanie `context.params.id`
   - Walidacja UUID format
   - Jeśli błąd → 400 Bad Request

3. **Query do bazy danych**
   ```sql
   SELECT
     a.*,
     l.id as lease_id,
     l.status as lease_status,
     l.start_date as lease_start_date,
     l.tenant_id,
     u.id as tenant_id,
     u.full_name as tenant_name,
     u.email as tenant_email
   FROM apartments a
   LEFT JOIN leases l ON l.apartment_id = a.id
     AND l.status = 'active'
   LEFT JOIN users u ON u.id = l.tenant_id
   WHERE a.id = $1
   ```

   **Ważne:** RLS policies automatycznie filtrują wyniki:
   - Dla owner: `a.owner_id = auth.uid()`
   - Dla tenant: istnieje aktywny lease z `l.tenant_id = auth.uid()`

4. **Sprawdzenie czy znaleziono mieszkanie**
   - Jeśli brak wyników → 404 Not Found
   - RLS może zwrócić 0 wyników jeśli użytkownik nie ma dostępu

5. **Transformacja danych do DTO**
   - Mapowanie apartment data
   - Jeśli istnieje lease, dodanie lease info z tenant info
   - Jeśli brak lease, pole `lease` = undefined

6. **Zwrócenie odpowiedzi**
   - Status 200 OK
   - Body: `ApartmentDetailsDTO`

### RLS Security Check:

RLS automatycznie zapewnia że:
- **Owner** może zobaczyć tylko swoje mieszkania
- **Tenant** może zobaczyć tylko mieszkanie z aktywnym najmem

Jeśli użytkownik nie ma dostępu, query zwróci 0 wyników → 404

## 6. Względy bezpieczeństwa

### Autoryzacja:

**RLS Policies (z db-plan.md):**

```sql
-- Owner może widzieć swoje mieszkania
CREATE POLICY "Owners can view their apartments"
  ON apartments FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- Tenant może widzieć mieszkanie z aktywnym najmem
CREATE POLICY "Tenants can view their apartment"
  ON apartments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leases
      WHERE leases.apartment_id = apartments.id
        AND leases.tenant_id = auth.uid()
        AND leases.status = 'active'
    )
  );
```

### Walidacja:
- **UUID validation** - zapobieganie SQL injection i invalid requests
- **RLS** - automatyczna filtracja na poziomie bazy danych

### Data exposure:
- Pełne dane mieszkania dla owner i tenant
- Dane lokatora (tylko imię i email) widoczne dla owner
- Tenant NIE widzi `owner_id`, `created_by` (choć są w response - można rozważyć ich ukrycie w przyszłości)

### 404 vs 403:
- **Wybór:** Zwracamy **404** zamiast **403** gdy użytkownik nie ma dostępu
- **Uzasadnienie:** Nie ujawniamy istnienia zasobu, do którego użytkownik nie ma dostępu (security by obscurity)

## 7. Obsługa błędów

### Scenariusze błędów:

| Kod | Scenariusz | Response | Logging |
|-----|-----------|----------|---------|
| 400 | Invalid UUID format | `{ "error": "Validation Error", "message": "Nieprawidłowy identyfikator mieszkania" }` | Info |
| 401 | Brak JWT tokenu | `{ "error": "Unauthorized", "message": "Brak autoryzacji" }` | Warning |
| 404 | Mieszkanie nie istnieje | `{ "error": "Not Found", "message": "Mieszkanie nie zostało znalezione" }` | Info |
| 404 | User nie ma dostępu (RLS) | `{ "error": "Not Found", "message": "Mieszkanie nie zostało znalezione" }` | Warning |
| 500 | Błąd bazy danych | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` | Error |

### Error handling pattern:
```typescript
try {
  // Validate path param
  const { id } = ApartmentIdParamSchema.parse(context.params);

  // Get apartment details
  const apartment = await apartmentService.getApartmentDetails(id);

  if (!apartment) {
    return new Response(JSON.stringify({
      error: 'Not Found',
      message: 'Mieszkanie nie zostało znalezione'
    }), { status: 404 });
  }

  return new Response(JSON.stringify(apartment), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
} catch (error) {
  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({
      error: 'Validation Error',
      message: 'Nieprawidłowy identyfikator mieszkania'
    }), { status: 400 });
  }

  console.error('GET /api/apartments/:id error:', error);
  return new Response(JSON.stringify({
    error: 'Internal Server Error',
    message: 'Wystąpił błąd serwera'
  }), { status: 500 });
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje:

1. **Single query z JOINs:**
   - Jedna query zamiast N+1 (apartment + lease + user)
   - LEFT JOIN aby obsłużyć przypadek braku lease

2. **Indeksy:**
   - Primary key index na `apartments.id` (automatyczny)
   - `idx_leases_apartment_id` - dla JOIN
   - `idx_leases_status` - dla filtrowania active leases

3. **RLS optimization:**
   - RLS policies używają indexed columns (owner_id, tenant_id, status)
   - PostgreSQL query planner optymalizuje RLS jako część głównego query

### Potencjalne problemy:

- **Brak cachingu:**
  - MVP: brak cachingu
  - Post-MVP: rozważyć cache (Redis/CDN) dla często używanych mieszkań

## 9. Etapy wdrożenia

### Krok 1: Utworzenie validation schema
```typescript
// src/lib/validation/apartments.validation.ts
import { z } from 'zod';

export const ApartmentIdParamSchema = z.object({
  id: z.string().uuid('Nieprawidłowy identyfikator mieszkania')
});
```

### Krok 2: Rozszerzenie apartment service
```typescript
// src/lib/services/apartment.service.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type { ApartmentDetailsDTO } from '@/types';

export class ApartmentService {
  constructor(private supabase: SupabaseClient) {}

  async getApartmentDetails(
    apartmentId: string
  ): Promise<ApartmentDetailsDTO | null> {
    // Query z LEFT JOIN
    const { data, error } = await this.supabase
      .from('apartments')
      .select(`
        *,
        leases!inner(
          id,
          status,
          start_date,
          tenant_id,
          tenant:users!leases_tenant_id_fkey(
            id,
            full_name,
            email
          )
        )
      `)
      .eq('id', apartmentId)
      .eq('leases.status', 'active')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    // Transformacja do DTO
    const apartment: ApartmentDetailsDTO = {
      ...data,
      lease: data.leases?.[0] ? {
        id: data.leases[0].id,
        status: data.leases[0].status,
        start_date: data.leases[0].start_date,
        tenant_id: data.leases[0].tenant_id,
        tenant: {
          id: data.leases[0].tenant.id,
          full_name: data.leases[0].tenant.full_name,
          email: data.leases[0].tenant.email
        }
      } : undefined
    };

    // Usuń pole leases z response
    delete (apartment as any).leases;

    return apartment;
  }
}
```

**Uwaga:** Supabase select syntax z nested relations może wymagać dostosowania. Alternatywnie można użyć raw SQL lub dwóch osobnych queries.

### Krok 3: Implementacja API route
```typescript
// src/pages/api/apartments/[id]/index.ts
import type { APIContext } from 'astro';
import { z } from 'zod';
import { ApartmentService } from '@/lib/services/apartment.service';
import { ApartmentIdParamSchema } from '@/lib/validation/apartments.validation';

export const prerender = false;

export async function GET(context: APIContext) {
  // 1. Check authorization
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      message: 'Brak autoryzacji'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // 2. Validate path parameter
    const { id } = ApartmentIdParamSchema.parse(context.params);

    // 3. Get apartment details
    const apartmentService = new ApartmentService(context.locals.supabase);
    const apartment = await apartmentService.getApartmentDetails(id);

    // 4. Check if found
    if (!apartment) {
      return new Response(JSON.stringify({
        error: 'Not Found',
        message: 'Mieszkanie nie zostało znalezione'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 5. Return response
    return new Response(JSON.stringify(apartment), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({
        error: 'Validation Error',
        message: 'Nieprawidłowy identyfikator mieszkania'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.error('GET /api/apartments/:id error:', {
      userId: user.id,
      apartmentId: context.params.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Wystąpił błąd serwera'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

### Krok 4: Testy
1. **Test happy path (owner):**
   - Owner pobiera swoje mieszkanie z aktywnym najmem
   - Owner pobiera swoje mieszkanie bez aktywnego najmu
   - Weryfikacja pełnych danych + lease info

2. **Test happy path (tenant):**
   - Tenant pobiera mieszkanie z aktywnym najmem
   - Weryfikacja danych mieszkania

3. **Test autoryzacji:**
   - Brak tokenu → 401
   - Owner próbuje pobrać cudze mieszkanie → 404
   - Tenant próbuje pobrać cudze mieszkanie → 404
   - Tenant z archiwalnym najmem próbuje pobrać mieszkanie → 404

4. **Test walidacji:**
   - Invalid UUID → 400
   - Nieistniejący UUID → 404

5. **Test RLS:**
   - Weryfikacja że RLS filtruje wyniki
   - Weryfikacja że query zwraca null dla unauthorized access

### Krok 5: Dokumentacja
1. JSDoc dla getApartmentDetails method
2. Komentarze w kodzie dla RLS behavior
3. Przykłady response dla przypadków z/bez lease

---

**Priorytet:** Wysoki (używany w widoku szczegółów mieszkania)
**Szacowany czas:** 3-4 godziny
**Zależności:**
- Middleware autoryzacji
- GET /api/apartments (podobna logika)
- Typy DTO
