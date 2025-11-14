# API Endpoint Implementation Plan: GET /api/apartments/:id/summary

## 1. Przegląd punktu końcowego

Endpoint zwraca podsumowanie mieszkania z kluczowymi metrykami finansowymi. Przeznaczony dla właścicieli do wyświetlenia na dashboardzie. Zawiera podstawowe informacje o mieszkaniu, aktywnym najmie oraz statystyki opłat (nieopłacone, częściowo opłacone, zaległe, nadchodzące).

**Kluczowe cechy:**
- Dostępny **tylko dla właściciela** mieszkania
- Zwraca skrócone dane mieszkania (id, name, address)
- Zawiera informacje o aktywnym najmie i lokatorze
- Oblicza financial summary na podstawie charges
- Wykorzystuje database view `charges_with_status` dla efektywności
- Używany głównie do wyświetlenia na dashboardzie właściciela

## 2. Szczegóły żądania

- **Metoda HTTP:** GET
- **Struktura URL:** `/api/apartments/:id/summary`
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
export type ApartmentSummaryDTO = {
  apartment: Pick<Tables<'apartments'>, 'id' | 'name' | 'address'>;
  lease?: {
    id: string;
    status: Enums<'lease_status'>;
    tenant: Pick<Tables<'users'>, 'full_name'>;
  };
  financial_summary: FinancialSummary;
};

export type FinancialSummary = {
  total_unpaid: number;
  total_partially_paid: number;
  total_overdue: number;
  upcoming_charges_count: number;
};
```

**Database View (używany):**
```sql
-- charges_with_status VIEW (z db-plan.md)
-- Automatycznie oblicza payment_status i is_overdue
SELECT
  c.*,
  COALESCE(SUM(p.amount), 0) AS total_paid,
  c.amount - COALESCE(SUM(p.amount), 0) AS remaining_amount,
  CASE
    WHEN COALESCE(SUM(p.amount), 0) = 0 THEN 'unpaid'
    WHEN COALESCE(SUM(p.amount), 0) < c.amount THEN 'partially_paid'
    WHEN COALESCE(SUM(p.amount), 0) >= c.amount THEN 'paid'
  END AS payment_status,
  CASE
    WHEN c.due_date < CURRENT_DATE
      AND COALESCE(SUM(p.amount), 0) < c.amount
    THEN TRUE
    ELSE FALSE
  END AS is_overdue
FROM charges c
LEFT JOIN payments p ON p.charge_id = c.id
GROUP BY c.id;
```

## 4. Szczegóły odpowiedzi

### Success Response (200 OK):
```json
{
  "apartment": {
    "id": "uuid",
    "name": "Kawalerka na Woli",
    "address": "ul. Złota 44, Warszawa"
  },
  "lease": {
    "id": "uuid",
    "status": "active",
    "tenant": {
      "full_name": "Anna Kowalska"
    }
  },
  "financial_summary": {
    "total_unpaid": 2000.00,
    "total_partially_paid": 500.00,
    "total_overdue": 1500.00,
    "upcoming_charges_count": 2
  }
}
```

**Uwaga:**
- Pole `lease` jest opcjonalne - jeśli brak aktywnego najmu, będzie `undefined`
- Financial summary zawsze zwracany (0 jeśli brak charges)

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

**403 Forbidden:**
```json
{
  "error": "Forbidden",
  "message": "Nie masz uprawnień do przeglądania tego mieszkania"
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

3. **Sprawdzenie roli użytkownika**
   - Query do `users` table: SELECT role WHERE id = user.id
   - Jeśli role !== 'owner' → 403 Forbidden
   - **Ważne:** Endpoint tylko dla właścicieli (tenant nie ma dostępu)

4. **Query #1: Apartment + Lease info**
   ```sql
   SELECT
     a.id,
     a.name,
     a.address,
     l.id as lease_id,
     l.status as lease_status,
     u.full_name as tenant_name
   FROM apartments a
   LEFT JOIN leases l ON l.apartment_id = a.id
     AND l.status = 'active'
   LEFT JOIN users u ON u.id = l.tenant_id
   WHERE a.id = $1
     AND a.owner_id = auth.uid()
   ```

   RLS automatycznie filtruje: owner może zobaczyć tylko swoje mieszkania

5. **Sprawdzenie czy znaleziono mieszkanie**
   - Jeśli brak wyników → 404 Not Found

6. **Query #2: Financial Summary**

   Używamy view `charges_with_status` dla obliczonych metryk:

   ```sql
   SELECT
     -- Total unpaid
     SUM(CASE WHEN payment_status = 'unpaid' THEN remaining_amount ELSE 0 END) as total_unpaid,

     -- Total partially paid
     SUM(CASE WHEN payment_status = 'partially_paid' THEN remaining_amount ELSE 0 END) as total_partially_paid,

     -- Total overdue
     SUM(CASE WHEN is_overdue = TRUE THEN remaining_amount ELSE 0 END) as total_overdue,

     -- Upcoming charges count
     COUNT(*) FILTER (WHERE due_date >= CURRENT_DATE AND payment_status != 'paid') as upcoming_charges_count

   FROM charges_with_status
   WHERE lease_id = $1
   ```

   **Uwaga:** Jeśli brak aktywnego lease, financial summary będzie zerami.

7. **Transformacja danych do DTO**
   - Mapowanie apartment data (tylko id, name, address)
   - Mapowanie lease info (jeśli istnieje)
   - Mapowanie financial summary

8. **Zwrócenie odpowiedzi**
   - Status 200 OK
   - Body: `ApartmentSummaryDTO`

### Optymalizacja queries:

**Opcja 1: Dwa osobne queries** (prostsze)
- Query 1: apartment + lease
- Query 2: financial summary

**Opcja 2: Single complex query** (szybsze, ale bardziej skomplikowane)
- LEFT JOIN charges_with_status z aggregacją
- Może być trudniejsze do debugowania

Dla MVP zalecamy **Opcję 1** - czytelniejsza i łatwiejsza do utrzymania.

## 6. Względy bezpieczeństwa

### Autoryzacja:

**RLS Policies:**
- Owner może widzieć swoje mieszkania: `owner_id = auth.uid()`
- Charges są dostępne tylko dla właściciela mieszkania (via leases join)

**Explicit Role Check:**
- Dodatkowe sprawdzenie `role = 'owner'` przed wykonaniem queries
- Tenant **NIE MOŻE** dostać się do tego endpointu (403 Forbidden)

### Walidacja:
- UUID validation dla apartment ID
- RLS automatycznie filtruje dostęp

### Data exposure:
- **Minimal apartment data** - tylko id, name, address (brak owner_id, timestamps)
- **Tenant info** - tylko full_name (brak email, id)
- **Financial data** - tylko agregowane sumy (brak szczegółów pojedynczych charges)

### Rationale dla owner-only:
- Dashboard endpoint z wrażliwymi danymi finansowymi
- Tenant ma dostęp do szczegółowych charges przez inny endpoint
- Upraszcza logikę (nie trzeba różnicować response dla tenant)

## 7. Obsługa błędów

### Scenariusze błędów:

| Kod | Scenariusz | Response | Logging |
|-----|-----------|----------|---------|
| 400 | Invalid UUID | `{ "error": "Validation Error", "message": "Nieprawidłowy identyfikator mieszkania" }` | Info |
| 401 | Brak JWT | `{ "error": "Unauthorized", "message": "Brak autoryzacji" }` | Warning |
| 403 | User role !== 'owner' | `{ "error": "Forbidden", "message": "Nie masz uprawnień do przeglądania tego mieszkania" }` | Warning |
| 404 | Apartment not found | `{ "error": "Not Found", "message": "Mieszkanie nie zostało znalezione" }` | Info |
| 404 | Not owner (RLS) | `{ "error": "Not Found", "message": "Mieszkanie nie zostało znalezione" }` | Warning |
| 500 | Database error | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` | Error |

### Error handling pattern:
```typescript
try {
  const { id } = ApartmentIdParamSchema.parse(context.params);

  // Check role
  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('id', context.locals.user.id)
    .single();

  if (user?.role !== 'owner') {
    return new Response(JSON.stringify({
      error: 'Forbidden',
      message: 'Nie masz uprawnień do przeglądania tego mieszkania'
    }), { status: 403 });
  }

  const summary = await apartmentService.getApartmentSummary(id);

  if (!summary) {
    return new Response(JSON.stringify({
      error: 'Not Found',
      message: 'Mieszkanie nie zostało znalezione'
    }), { status: 404 });
  }

  return new Response(JSON.stringify(summary), { status: 200 });
} catch (error) {
  // Handle validation and database errors
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje:

1. **Database VIEW:**
   - `charges_with_status` oblicza payment_status raz w view
   - Unikamy duplikacji logiki w aplikacji
   - PostgreSQL query planner optymalizuje view

2. **Aggregate query:**
   - Jedna query dla financial summary (SUM, COUNT)
   - Unikamy N+1 problem

3. **Minimal data transfer:**
   - Tylko niezbędne pola apartment (nie pełny rekord)
   - Tylko aggregate financial data (nie wszystkie charges)

4. **Indeksy:**
   - `idx_apartments_owner_id` - dla RLS filter
   - `idx_leases_apartment_id` - dla JOIN
   - `idx_charges_lease_id` - dla financial summary

### Potencjalne problemy:

- **VIEW performance:**
  - `charges_with_status` robi LEFT JOIN + GROUP BY
  - Dla dużej liczby charges może być wolne
  - Post-MVP: rozważyć materialized view

- **Multiple queries:**
  - Opcja 1 (2 queries) może być wolniejsza niż single query
  - MVP: akceptowalne, priorytet na czytelność

### Caching (Post-MVP):

- Dashboard data może być cache'owane na 1 minutę
- Financial summary zmienia się tylko po dodaniu payment
- Rozważyć Redis cache z invalidation

## 9. Etapy wdrożenia

### Krok 1: Reuse validation schema
```typescript
// src/lib/validation/apartments.validation.ts
export const ApartmentIdParamSchema = z.object({
  id: z.string().uuid('Nieprawidłowy identyfikator mieszkania')
});
```

### Krok 2: Rozszerzenie apartment service
```typescript
// src/lib/services/apartment.service.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type { ApartmentSummaryDTO, FinancialSummary } from '@/types';

export class ApartmentService {
  constructor(private supabase: SupabaseClient) {}

  async getApartmentSummary(
    apartmentId: string
  ): Promise<ApartmentSummaryDTO | null> {
    // 1. Get apartment + lease info
    const { data: apartment, error: aptError } = await this.supabase
      .from('apartments')
      .select(`
        id,
        name,
        address,
        leases!inner(
          id,
          status,
          tenant:users!leases_tenant_id_fkey(
            full_name
          )
        )
      `)
      .eq('id', apartmentId)
      .eq('leases.status', 'active')
      .maybeSingle();

    if (aptError) {
      throw aptError;
    }

    if (!apartment) {
      return null;
    }

    // 2. Get financial summary
    let financialSummary: FinancialSummary = {
      total_unpaid: 0,
      total_partially_paid: 0,
      total_overdue: 0,
      upcoming_charges_count: 0
    };

    const activeLease = apartment.leases?.[0];
    if (activeLease) {
      const { data: charges } = await this.supabase
        .from('charges_with_status')
        .select('payment_status, remaining_amount, is_overdue, due_date')
        .eq('lease_id', activeLease.id);

      if (charges && charges.length > 0) {
        financialSummary = {
          total_unpaid: charges
            .filter(c => c.payment_status === 'unpaid')
            .reduce((sum, c) => sum + c.remaining_amount, 0),
          total_partially_paid: charges
            .filter(c => c.payment_status === 'partially_paid')
            .reduce((sum, c) => sum + c.remaining_amount, 0),
          total_overdue: charges
            .filter(c => c.is_overdue)
            .reduce((sum, c) => sum + c.remaining_amount, 0),
          upcoming_charges_count: charges
            .filter(c => c.due_date >= new Date().toISOString().split('T')[0] && c.payment_status !== 'paid')
            .length
        };
      }
    }

    // 3. Build DTO
    const summary: ApartmentSummaryDTO = {
      apartment: {
        id: apartment.id,
        name: apartment.name,
        address: apartment.address
      },
      lease: activeLease ? {
        id: activeLease.id,
        status: activeLease.status,
        tenant: {
          full_name: activeLease.tenant.full_name
        }
      } : undefined,
      financial_summary: financialSummary
    };

    return summary;
  }
}
```

### Krok 3: Implementacja API route
```typescript
// src/pages/api/apartments/[id]/summary.ts
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

    // 3. Check user role (owner only)
    const { data: userData, error: userError } = await context.locals.supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      throw new Error('Nie znaleziono użytkownika');
    }

    if (userData.role !== 'owner') {
      return new Response(JSON.stringify({
        error: 'Forbidden',
        message: 'Nie masz uprawnień do przeglądania tego mieszkania'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. Get apartment summary
    const apartmentService = new ApartmentService(context.locals.supabase);
    const summary = await apartmentService.getApartmentSummary(id);

    // 5. Check if found
    if (!summary) {
      return new Response(JSON.stringify({
        error: 'Not Found',
        message: 'Mieszkanie nie zostało znalezione'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 6. Return response
    return new Response(JSON.stringify(summary), {
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

    console.error('GET /api/apartments/:id/summary error:', {
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

### Krok 4: Weryfikacja database view

Upewnij się że view `charges_with_status` istnieje (powinien być w migration):

```sql
CREATE OR REPLACE VIEW charges_with_status AS
SELECT
  c.id,
  c.lease_id,
  c.amount,
  c.due_date,
  c.type,
  c.comment,
  c.attachment_path,
  c.created_at,
  c.updated_at,
  c.created_by,
  COALESCE(SUM(p.amount), 0) AS total_paid,
  c.amount - COALESCE(SUM(p.amount), 0) AS remaining_amount,
  CASE
    WHEN COALESCE(SUM(p.amount), 0) = 0 THEN 'unpaid'
    WHEN COALESCE(SUM(p.amount), 0) < c.amount THEN 'partially_paid'
    WHEN COALESCE(SUM(p.amount), 0) >= c.amount THEN 'paid'
  END AS payment_status,
  CASE
    WHEN c.due_date < CURRENT_DATE
      AND COALESCE(SUM(p.amount), 0) < c.amount
    THEN TRUE
    ELSE FALSE
  END AS is_overdue
FROM charges c
LEFT JOIN payments p ON p.charge_id = c.id
GROUP BY c.id;
```

### Krok 5: Testy
1. **Test happy path (owner):**
   - Owner z mieszkaniem z aktywnym najmem i charges
   - Owner z mieszkaniem bez aktywnego najmu
   - Owner z mieszkaniem bez charges
   - Weryfikacja wszystkich pól financial summary

2. **Test financial calculations:**
   - Mieszkanie z unpaid charges
   - Mieszkanie z partially_paid charges
   - Mieszkanie z paid charges
   - Mieszkanie z overdue charges
   - Mieszkanie z upcoming charges (future due_date)
   - Weryfikacja sum i count

3. **Test autoryzacji:**
   - Brak tokenu → 401
   - Tenant próbuje dostać się do endpointu → 403
   - Owner próbuje pobrać cudze mieszkanie → 404

4. **Test walidacji:**
   - Invalid UUID → 400
   - Nieistniejący UUID → 404

5. **Test edge cases:**
   - Mieszkanie bez leases → financial summary = 0
   - Mieszkanie z archived lease → financial summary = 0
   - Wszystkie charges paid → total_unpaid, total_overdue = 0

### Krok 6: Dokumentacja
1. JSDoc dla getApartmentSummary method
2. Komentarze w kodzie dla financial calculations
3. Przykłady response dla różnych scenariuszy

---

**Priorytet:** Wysoki (używany na dashboardzie właściciela)
**Szacowany czas:** 4-6 godzin
**Zależności:**
- Middleware autoryzacji
- Database view `charges_with_status`
- Typy DTO (ApartmentSummaryDTO, FinancialSummary)
- Validation schemas

**UWAGA:** Endpoint dostępny tylko dla właścicieli (owner role). Tenant nie może uzyskać dostępu do tego endpointu.
