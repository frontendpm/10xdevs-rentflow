# API Endpoint Implementation Plan: GET /api/dashboard

## 1. Przegląd punktu końcowego

Endpoint służy do pobierania danych dashboardu na podstawie roli użytkownika. Dla właściciela zwraca listę mieszkań z podsumowaniami finansowymi i ogólnymi statystykami. Dla lokatora zwraca informacje o mieszkaniu i podsumowanie finansowe najmu. To główny endpoint dla strony głównej aplikacji po zalogowaniu.

## 2. Szczegóły żądania

- **Metoda HTTP:** GET
- **Struktura URL:** `/api/dashboard`
- **Parametry:**
  - **Wymagane:** Brak
  - **Opcjonalne:** Brak
- **Request Body:** Brak (GET request)
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagane)

## 3. Wykorzystywane typy

### DTOs (Response)
```typescript
// z src/types.ts

// Union type - response zależy od roli
export type DashboardDTO = DashboardOwnerDTO | DashboardTenantDTO;

// Owner dashboard
export type DashboardOwnerDTO = {
  role: 'owner';
  apartments: DashboardApartmentItem[];
  statistics: DashboardStatistics;
};

export type DashboardApartmentItem = Pick<
  Tables<'apartments'>,
  'id' | 'name' | 'address'
> & {
  lease_status?: Enums<'lease_status'>;
  tenant?: Pick<Tables<'users'>, 'full_name'>;
  financial_summary: SimplifiedFinancialSummary;
};

export type DashboardStatistics = {
  total_apartments: number;
  active_leases: number;
  total_unpaid: number;
  total_overdue: number;
};

// Tenant dashboard
export type DashboardTenantDTO = {
  role: 'tenant';
  apartment: Pick<Tables<'apartments'>, 'id' | 'name' | 'address'> & {
    owner: OwnerInfo;
  };
  financial_summary: DashboardTenantFinancialSummary;
};

export type DashboardTenantFinancialSummary = {
  total_due: number;
  total_overdue: number;
  upcoming_charges: UpcomingChargeInfo[];
};

export type SimplifiedFinancialSummary = Pick<FinancialSummary, 'total_unpaid' | 'total_overdue'>;

export type UpcomingChargeInfo = Pick<
  Tables<'charges'>,
  'id' | 'amount' | 'due_date' | 'type'
>;
```

### Type Guards
```typescript
export function isDashboardOwnerDTO(dto: DashboardDTO): dto is DashboardOwnerDTO {
  return dto.role === 'owner';
}

export function isDashboardTenantDTO(dto: DashboardDTO): dto is DashboardTenantDTO {
  return dto.role === 'tenant';
}
```

## 4. Szczegóły odpowiedzi

### Response 200 (Owner)
```json
{
  "role": "owner",
  "apartments": [
    {
      "id": "uuid",
      "name": "Kawalerka na Woli",
      "address": "ul. Złota 44, Warszawa",
      "lease_status": "active",
      "tenant": {
        "full_name": "Anna Kowalska"
      },
      "financial_summary": {
        "total_unpaid": 2000.00,
        "total_overdue": 0.00
      }
    }
  ],
  "statistics": {
    "total_apartments": 1,
    "active_leases": 1,
    "total_unpaid": 2000.00,
    "total_overdue": 0.00
  }
}
```

### Response 200 (Tenant)
```json
{
  "role": "tenant",
  "apartment": {
    "id": "uuid",
    "name": "Kawalerka na Woli",
    "address": "ul. Złota 44, Warszawa",
    "owner": {
      "id": "uuid",
      "full_name": "Jan Kowalski",
      "email": "jan@example.com"
    }
  },
  "financial_summary": {
    "total_due": 2000.00,
    "total_overdue": 0.00,
    "upcoming_charges": [
      {
        "id": "uuid",
        "amount": 2000.00,
        "due_date": "2025-02-10",
        "type": "rent"
      }
    ]
  }
}
```

### Error 401 (Unauthorized)
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

### Error 500 (Internal Server Error)
```json
{
  "error": "Internal Server Error",
  "message": "Wystąpił błąd serwera"
}
```

## 5. Przepływ danych

### Krok 1: Autoryzacja i określenie roli
1. Sprawdzenie JWT tokena z `context.locals.user`
2. Jeśli brak user → return 401
3. Pobranie roli użytkownika z tabeli `users`:
```sql
SELECT id, role FROM users WHERE id = :user_id
```

### Krok 2a: Owner Dashboard Flow

#### 2a.1: Pobranie mieszkań właściciela
```sql
SELECT
  a.id,
  a.name,
  a.address
FROM apartments a
WHERE a.owner_id = :owner_id
ORDER BY a.created_at DESC
```

#### 2a.2: Dla każdego mieszkania - pobranie aktywnego najmu
```sql
SELECT
  l.id,
  l.status,
  l.tenant_id,
  u.full_name as tenant_name
FROM leases l
LEFT JOIN users u ON u.id = l.tenant_id
WHERE l.apartment_id = :apartment_id
  AND l.status = 'active'
```

#### 2a.3: Dla każdego mieszkania - obliczenie financial summary
Użycie view `charges_with_status`:
```sql
SELECT
  COALESCE(SUM(CASE WHEN payment_status IN ('unpaid', 'partially_paid') THEN remaining_amount ELSE 0 END), 0) as total_unpaid,
  COALESCE(SUM(CASE WHEN is_overdue = true THEN remaining_amount ELSE 0 END), 0) as total_overdue
FROM charges_with_status c
JOIN leases l ON l.id = c.lease_id
WHERE l.apartment_id = :apartment_id
  AND l.status = 'active'
```

#### 2a.4: Obliczenie ogólnych statystyk
- `total_apartments`: COUNT mieszkań
- `active_leases`: COUNT mieszkań z active lease
- `total_unpaid`: SUM wszystkich total_unpaid
- `total_overdue`: SUM wszystkich total_overdue

### Krok 2b: Tenant Dashboard Flow

#### 2b.1: Pobranie mieszkania lokatora
```sql
SELECT
  a.id,
  a.name,
  a.address,
  a.owner_id,
  u.id as owner_id,
  u.full_name as owner_name,
  u.email as owner_email
FROM apartments a
JOIN leases l ON l.apartment_id = a.id
JOIN users u ON u.id = a.owner_id
WHERE l.tenant_id = :tenant_id
  AND l.status = 'active'
```
- RLS automatycznie ogranicza do mieszkania z aktywnym najmem

#### 2b.2: Obliczenie financial summary lokatora
```sql
SELECT
  COALESCE(SUM(CASE WHEN payment_status IN ('unpaid', 'partially_paid') THEN remaining_amount ELSE 0 END), 0) as total_due,
  COALESCE(SUM(CASE WHEN is_overdue = true THEN remaining_amount ELSE 0 END), 0) as total_overdue
FROM charges_with_status c
JOIN leases l ON l.id = c.lease_id
WHERE l.tenant_id = :tenant_id
  AND l.status = 'active'
```

#### 2b.3: Pobranie nadchodzących opłat (upcoming charges)
```sql
SELECT
  c.id,
  c.amount,
  c.due_date,
  c.type
FROM charges_with_status c
JOIN leases l ON l.id = c.lease_id
WHERE l.tenant_id = :tenant_id
  AND l.status = 'active'
  AND c.payment_status != 'paid'
  AND c.due_date >= CURRENT_DATE
ORDER BY c.due_date ASC
LIMIT 5
```

### Krok 3: Mapowanie do DTO
- Zależnie od roli mapuj do DashboardOwnerDTO lub DashboardTenantDTO
- Pomiń zbędne pola (created_by, timestamps gdzie nie potrzebne)

### Krok 4: Response
- Return 200 z odpowiednim DTO

## 6. Względy bezpieczeństwa

### Autoryzacja (RLS)
- **RLS policies:** Automatycznie ograniczają dane do:
  - Owner: tylko swoje mieszkania
  - Tenant: tylko mieszkanie z aktywnym najmem
- **Role-based logic:** Różne queries w zależności od roli

### Walidacja danych
- **User ID verification:** auth.uid() z JWT
- **Role verification:** Pobranie z DB (trusted source)
- **SQL Injection:** Prepared statements (Supabase auto-handles)

### Data Exposure
- **Owner:** Nie widzi danych innych właścicieli
- **Tenant:** Nie widzi innych mieszkań, tylko swoje
- **PII protection:** Zwracane tylko niezbędne dane (full_name, email właściciela dla lokatora)

### Performance Security
- **Rate limiting:** Supabase built-in
- **Query limits:** LIMIT na upcoming charges (prevent large responses)
- **Pagination consideration:** MVP zwraca wszystko, future: pagination dla owners z wieloma mieszkaniami

### Logging
- Loguj failed authentications
- Loguj query errors (monitoring)
- NIE loguj PII (emails, names)

## 7. Obsługa błędów

### Błędy autoryzacji (401)
- **Missing JWT:** Brak tokena
- **Invalid JWT:** Token wygasł lub nieprawidłowy
- **Handling:** Zwróć 401 z komunikatem "Brak autoryzacji"

### Błędy bazy danych (500)
- **User not found:** User ID z JWT nie istnieje w bazie (corrupted data)
- **Query timeout:** Zbyt długie zapytanie (performance issue)
- **Database connection error:** Błąd połączenia z Supabase
- **Handling:** Log full error, return 500 generic message

### Edge Cases
- **Owner bez mieszkań:** Zwróć pustą listę apartments i zerowe statistics
- **Tenant bez aktywnego najmu:** Nie powinno się zdarzyć (najem archived → user loses access), ale handle gracefully (empty response lub error)

### Error Recovery
- **Partial failures:** Jeśli financial summary dla jednego mieszkania failed, pomiń to mieszkanie lub zwróć z zerowymi wartościami (don't break entire response)
- **Logging:** Log partial failures for monitoring

## 8. Rozważania dotyczące wydajności

### Query optimization

#### Owner Dashboard
- **Problem:** N+1 query dla każdego mieszkania (lease + financial summary)
- **Solution 1 (current MVP):** Sequential queries per apartment
  - Simple, readable code
  - Acceptable for small number of apartments (< 10)
- **Solution 2 (future optimization):** Single complex query with JOINs and aggregations
  ```sql
  SELECT
    a.id,
    a.name,
    a.address,
    l.status as lease_status,
    u.full_name as tenant_name,
    COALESCE(SUM(...), 0) as total_unpaid,
    COALESCE(SUM(...), 0) as total_overdue
  FROM apartments a
  LEFT JOIN leases l ON l.apartment_id = a.id AND l.status = 'active'
  LEFT JOIN users u ON u.id = l.tenant_id
  LEFT JOIN charges_with_status c ON c.lease_id = l.id
  WHERE a.owner_id = :owner_id
  GROUP BY a.id, l.status, u.full_name
  ```
  - Single query, better performance
  - More complex, harder to maintain

#### Tenant Dashboard
- **Advantage:** Single apartment, simpler queries
- **2-3 queries total:** apartment + financial summary + upcoming charges
- **Very fast:** < 100ms expected

### Caching Strategy
- **MVP:** No caching (fresh data)
- **Future optimizations:**
  - Cache dashboard data for 1 minute (Redis/memory)
  - Invalidate on charge/payment updates
  - Per-user cache key: `dashboard:${user.id}`

### Database Indexes
Already exist in db-plan.md:
- `idx_apartments_owner_id` - fast owner apartments lookup
- `idx_leases_apartment_id` - fast lease lookup
- `idx_leases_tenant_id` - fast tenant lookup
- `idx_leases_status` - filter active leases
- `idx_charges_lease_id` - fast charges lookup
- View `charges_with_status` - pre-computed payment status

### Response Size
- **Owner with many apartments:** Could be large (100+ apartments)
  - MVP: Return all
  - Future: Pagination (limit 20 per page)
- **Tenant:** Very small response (1 apartment)

### Monitoring
- Monitor response times
- Alert if > 1s (performance degradation)
- Track number of apartments per owner (identify heavy users)

## 9. Etapy wdrożenia

### Etap 1: Struktura pliku API route
1. Utwórz plik: `src/pages/api/dashboard.ts`
2. Dodaj `export const prerender = false`
3. Zaimplementuj handler `GET`
4. Pobierz `supabase` z `context.locals`

### Etap 2: Autoryzacja i określenie roli
1. Pobierz user z `context.locals.user`
2. Jeśli brak → return 401
3. Pobierz user role:
```typescript
const { data: userData, error } = await supabase
  .from('users')
  .select('id, role')
  .eq('id', user.id)
  .single();

if (error || !userData) {
  // User not found (corrupted data)
  return 500;
}

const { role } = userData;
```

### Etap 3: Service - Owner Dashboard
1. Utwórz serwis: `src/lib/services/dashboardService.ts`
2. Implementuj `getOwnerDashboard`:

```typescript
export async function getOwnerDashboard(
  supabase: SupabaseClient,
  ownerId: string
): Promise<DashboardOwnerDTO> {
  // 1. Get all apartments
  const { data: apartments, error: apartmentsError } = await supabase
    .from('apartments')
    .select('id, name, address')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (apartmentsError) throw apartmentsError;

  // 2. For each apartment, get lease and financial summary
  const apartmentItems: DashboardApartmentItem[] = await Promise.all(
    (apartments || []).map(async (apartment) => {
      // Get active lease
      const { data: lease } = await supabase
        .from('leases')
        .select('id, status, tenant_id, users(full_name)')
        .eq('apartment_id', apartment.id)
        .eq('status', 'active')
        .maybeSingle();

      // Get financial summary
      const { data: financialData } = await supabase
        .from('charges_with_status')
        .select('remaining_amount, is_overdue, payment_status')
        .eq('lease_id', lease?.id)
        .not('payment_status', 'eq', 'paid');

      const total_unpaid = financialData?.reduce(
        (sum, charge) =>
          ['unpaid', 'partially_paid'].includes(charge.payment_status || '')
            ? sum + (charge.remaining_amount || 0)
            : sum,
        0
      ) || 0;

      const total_overdue = financialData?.reduce(
        (sum, charge) =>
          charge.is_overdue ? sum + (charge.remaining_amount || 0) : sum,
        0
      ) || 0;

      return {
        id: apartment.id,
        name: apartment.name,
        address: apartment.address,
        lease_status: lease?.status,
        tenant: lease?.users ? { full_name: lease.users.full_name } : undefined,
        financial_summary: {
          total_unpaid,
          total_overdue
        }
      };
    })
  );

  // 3. Calculate statistics
  const statistics: DashboardStatistics = {
    total_apartments: apartmentItems.length,
    active_leases: apartmentItems.filter(a => a.lease_status === 'active').length,
    total_unpaid: apartmentItems.reduce((sum, a) => sum + a.financial_summary.total_unpaid, 0),
    total_overdue: apartmentItems.reduce((sum, a) => sum + a.financial_summary.total_overdue, 0)
  };

  return {
    role: 'owner',
    apartments: apartmentItems,
    statistics
  };
}
```

### Etap 4: Service - Tenant Dashboard
1. W tym samym serwisie implementuj `getTenantDashboard`:

```typescript
export async function getTenantDashboard(
  supabase: SupabaseClient,
  tenantId: string
): Promise<DashboardTenantDTO> {
  // 1. Get apartment with active lease
  const { data: leaseData, error: leaseError } = await supabase
    .from('leases')
    .select(`
      id,
      apartments (
        id,
        name,
        address,
        owner_id,
        users (
          id,
          full_name,
          email
        )
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (leaseError || !leaseData) {
    throw new Error('No active lease found for tenant');
  }

  const apartment = leaseData.apartments;
  const owner = apartment.users;

  // 2. Get financial summary
  const { data: charges } = await supabase
    .from('charges_with_status')
    .select('remaining_amount, is_overdue, payment_status')
    .eq('lease_id', leaseData.id)
    .not('payment_status', 'eq', 'paid');

  const total_due = charges?.reduce(
    (sum, charge) =>
      ['unpaid', 'partially_paid'].includes(charge.payment_status || '')
        ? sum + (charge.remaining_amount || 0)
        : sum,
    0
  ) || 0;

  const total_overdue = charges?.reduce(
    (sum, charge) =>
      charge.is_overdue ? sum + (charge.remaining_amount || 0) : sum,
    0
  ) || 0;

  // 3. Get upcoming charges
  const today = new Date().toISOString().split('T')[0];
  const { data: upcomingCharges } = await supabase
    .from('charges_with_status')
    .select('id, amount, due_date, type')
    .eq('lease_id', leaseData.id)
    .not('payment_status', 'eq', 'paid')
    .gte('due_date', today)
    .order('due_date', { ascending: true })
    .limit(5);

  return {
    role: 'tenant',
    apartment: {
      id: apartment.id,
      name: apartment.name,
      address: apartment.address,
      owner: {
        id: owner.id,
        full_name: owner.full_name,
        email: owner.email
      }
    },
    financial_summary: {
      total_due,
      total_overdue,
      upcoming_charges: upcomingCharges || []
    }
  };
}
```

### Etap 5: Orchestration w API handler
```typescript
// In API handler:
try {
  // ... auth and role check ...

  let dashboardData: DashboardDTO;

  if (role === 'owner') {
    dashboardData = await getOwnerDashboard(supabase, user.id);
  } else if (role === 'tenant') {
    dashboardData = await getTenantDashboard(supabase, user.id);
  } else {
    // Unknown role
    throw new Error('Invalid user role');
  }

  return new Response(JSON.stringify(dashboardData), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
} catch (error) {
  // Handle errors...
}
```

### Etap 6: Obsługa błędów
1. Wrap całą logikę w try-catch
2. Handle unauthorized (401)
3. Handle tenant without active lease (graceful error)
4. Handle database errors (500)
5. Log wszystkie błędy

### Etap 7: Response
1. Return 200 z DashboardDTO
2. Frontend może użyć type guards do sprawdzenia typu:
```typescript
if (isDashboardOwnerDTO(data)) {
  // Render owner dashboard
} else {
  // Render tenant dashboard
}
```

### Etap 8: Optimization (optional for MVP)
1. Rozważ pojedyncze query dla owner dashboard (zamiast N+1)
2. Dodaj caching jeśli performance issues
3. Dodaj pagination dla owners z wieloma mieszkaniami

### Etap 9: Testy
1. **Unit tests** dla serwisu:
   - Test owner dashboard with multiple apartments
   - Test owner with no apartments
   - Test tenant dashboard
   - Test tenant without active lease (error case)
2. **Integration tests** dla endpoint:
   - Test owner receives correct data
   - Test tenant receives correct data
   - Test financial calculations are accurate
   - Test unauthorized (401)
   - Test statistics are calculated correctly

### Etap 10: Dokumentacja
1. JSDoc dla funkcji serwisu
2. Komentarze w kodzie
3. Update API documentation

## 10. Przykładowy kod implementacji

### API Route Handler
```typescript
// src/pages/api/dashboard.ts
import type { APIContext } from 'astro';
import { getOwnerDashboard, getTenantDashboard } from '@/lib/services/dashboardService';
import type { DashboardDTO } from '@/types';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  try {
    // 1. Auth check
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

    const supabase = context.locals.supabase;

    // 2. Get user role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      console.error('User not found:', user.id, userError);
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'Wystąpił błąd serwera'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { role } = userData;

    // 3. Get dashboard data based on role
    let dashboardData: DashboardDTO;

    if (role === 'owner') {
      dashboardData = await getOwnerDashboard(supabase, user.id);
    } else if (role === 'tenant') {
      dashboardData = await getTenantDashboard(supabase, user.id);
    } else {
      console.error('Invalid user role:', role);
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'Nieprawidłowa rola użytkownika'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Return dashboard data
    return new Response(JSON.stringify(dashboardData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('GET /api/dashboard error:', error);

    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Wystąpił błąd serwera'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### Service Implementation
```typescript
// src/lib/services/dashboardService.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type {
  DashboardOwnerDTO,
  DashboardTenantDTO,
  DashboardApartmentItem,
  DashboardStatistics
} from '@/types';

export async function getOwnerDashboard(
  supabase: SupabaseClient,
  ownerId: string
): Promise<DashboardOwnerDTO> {
  // Get all apartments owned by the user
  const { data: apartments, error: apartmentsError } = await supabase
    .from('apartments')
    .select('id, name, address')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (apartmentsError) {
    throw new Error(`Failed to fetch apartments: ${apartmentsError.message}`);
  }

  // For each apartment, get lease info and financial summary
  const apartmentItems: DashboardApartmentItem[] = await Promise.all(
    (apartments || []).map(async (apartment) => {
      // Get active lease with tenant info
      const { data: lease } = await supabase
        .from('leases')
        .select(`
          id,
          status,
          tenant_id,
          users!leases_tenant_id_fkey (full_name)
        `)
        .eq('apartment_id', apartment.id)
        .eq('status', 'active')
        .maybeSingle();

      // Get charges for financial summary
      let total_unpaid = 0;
      let total_overdue = 0;

      if (lease) {
        const { data: charges } = await supabase
          .from('charges_with_status')
          .select('remaining_amount, is_overdue, payment_status')
          .eq('lease_id', lease.id);

        total_unpaid = (charges || []).reduce((sum, charge) => {
          if (['unpaid', 'partially_paid'].includes(charge.payment_status || '')) {
            return sum + (charge.remaining_amount || 0);
          }
          return sum;
        }, 0);

        total_overdue = (charges || []).reduce((sum, charge) => {
          if (charge.is_overdue) {
            return sum + (charge.remaining_amount || 0);
          }
          return sum;
        }, 0);
      }

      return {
        id: apartment.id,
        name: apartment.name,
        address: apartment.address,
        lease_status: lease?.status,
        tenant: lease?.users ? { full_name: lease.users.full_name } : undefined,
        financial_summary: {
          total_unpaid,
          total_overdue
        }
      };
    })
  );

  // Calculate overall statistics
  const statistics: DashboardStatistics = {
    total_apartments: apartmentItems.length,
    active_leases: apartmentItems.filter((a) => a.lease_status === 'active').length,
    total_unpaid: apartmentItems.reduce(
      (sum, a) => sum + a.financial_summary.total_unpaid,
      0
    ),
    total_overdue: apartmentItems.reduce(
      (sum, a) => sum + a.financial_summary.total_overdue,
      0
    )
  };

  return {
    role: 'owner',
    apartments: apartmentItems,
    statistics
  };
}

export async function getTenantDashboard(
  supabase: SupabaseClient,
  tenantId: string
): Promise<DashboardTenantDTO> {
  // Get active lease with apartment and owner info
  const { data: leaseData, error: leaseError } = await supabase
    .from('leases')
    .select(`
      id,
      apartments (
        id,
        name,
        address,
        owner_id,
        users!apartments_owner_id_fkey (
          id,
          full_name,
          email
        )
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single();

  if (leaseError || !leaseData || !leaseData.apartments) {
    throw new Error('No active lease found for tenant');
  }

  const apartment = leaseData.apartments;
  const owner = apartment.users;

  // Get charges for financial summary
  const { data: charges } = await supabase
    .from('charges_with_status')
    .select('remaining_amount, is_overdue, payment_status, due_date')
    .eq('lease_id', leaseData.id);

  const total_due = (charges || []).reduce((sum, charge) => {
    if (['unpaid', 'partially_paid'].includes(charge.payment_status || '')) {
      return sum + (charge.remaining_amount || 0);
    }
    return sum;
  }, 0);

  const total_overdue = (charges || []).reduce((sum, charge) => {
    if (charge.is_overdue) {
      return sum + (charge.remaining_amount || 0);
    }
    return sum;
  }, 0);

  // Get upcoming charges (not paid, future or today)
  const today = new Date().toISOString().split('T')[0];
  const { data: upcomingCharges } = await supabase
    .from('charges_with_status')
    .select('id, amount, due_date, type')
    .eq('lease_id', leaseData.id)
    .neq('payment_status', 'paid')
    .gte('due_date', today)
    .order('due_date', { ascending: true })
    .limit(5);

  return {
    role: 'tenant',
    apartment: {
      id: apartment.id,
      name: apartment.name,
      address: apartment.address,
      owner: {
        id: owner.id,
        full_name: owner.full_name,
        email: owner.email
      }
    },
    financial_summary: {
      total_due,
      total_overdue,
      upcoming_charges: upcomingCharges || []
    }
  };
}
```

## 11. Checklisty

### Pre-Implementation Checklist
- [ ] Zapoznanie z API plan (sekcja 4.8)
- [ ] Zapoznanie z DB plan (tables relationships)
- [ ] Zapoznanie z types.ts (wszystkie Dashboard types)
- [ ] Zrozumienie view charges_with_status
- [ ] Weryfikacja RLS policies

### Implementation Checklist
- [ ] Utworzenie pliku API route
- [ ] Implementacja autoryzacji
- [ ] Implementacja określenia roli
- [ ] Utworzenie dashboard service
- [ ] Implementacja getOwnerDashboard
- [ ] Implementacja getTenantDashboard
- [ ] Implementacja obliczeń finansowych
- [ ] Implementacja statistics dla owner
- [ ] Implementacja upcoming charges dla tenant
- [ ] Implementacja obsługi błędów
- [ ] Testy jednostkowe
- [ ] Testy integracyjne

### Testing Checklist
- [ ] Test: Owner dashboard z wieloma mieszkaniami
- [ ] Test: Owner bez mieszkań (pusta lista)
- [ ] Test: Owner z mieszanymi statusami najmu
- [ ] Test: Obliczenia finansowe są poprawne (owner)
- [ ] Test: Statistics są poprawnie obliczane
- [ ] Test: Tenant dashboard zwraca poprawne dane
- [ ] Test: Obliczenia finansowe są poprawne (tenant)
- [ ] Test: Upcoming charges są sortowane po due_date
- [ ] Test: Unauthorized (401)
- [ ] Test: Tenant bez aktywnego najmu (error handling)
- [ ] Test: RLS policies działają (owner nie widzi innych owners)

### Performance Testing
- [ ] Test: Owner z 1 mieszkaniem (< 200ms)
- [ ] Test: Owner z 10 mieszkaniami (< 500ms)
- [ ] Test: Owner z 50 mieszkaniami (< 1s)
- [ ] Test: Tenant dashboard (< 100ms)
- [ ] Identify bottlenecks jeśli slow
- [ ] Consider optimization jeśli > 1s

### Post-Implementation Checklist
- [ ] Code review
- [ ] Security audit (data leakage check)
- [ ] JSDoc documentation
- [ ] Update API docs
- [ ] Deployment staging
- [ ] Manual testing (both roles)
- [ ] Performance testing
- [ ] Production deployment

### Monitoring Setup
- [ ] Monitor response times
- [ ] Alert if > 1s average
- [ ] Track errors per role
- [ ] Monitor database query performance
- [ ] Track user distribution (owner vs tenant)
