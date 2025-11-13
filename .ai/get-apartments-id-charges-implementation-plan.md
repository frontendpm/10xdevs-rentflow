# API Endpoint Implementation Plan: GET /api/apartments/:id/charges

## 1. Przegląd punktu końcowego

**Endpoint:** `GET /api/apartments/:apartmentId/charges`

**Cel:** Pobranie listy opłat dla aktywnego najmu mieszkania, pogrupowanych według miesięcy (wg daty wymagalności), posortowanych malejąco (najnowsze na górze).

**Funkcjonalność:**
- Zwraca wszystkie opłaty dla aktywnego najmu mieszkania
- Opcjonalnie: historyczne opłaty dla konkretnego lease_id
- Opcjonalne filtrowanie po miesiącu, statusie płatności, i przeterminowaniu
- Automatycznie oblicza status płatności na podstawie wpłat (poprzez view `charges_with_status`)
- Generuje signed URLs dla załączników opłat
- Grupuje opłaty według miesięcy (format YYYY-MM)

## 2. Szczegóły żądania

### HTTP Method
`GET`

### URL Structure
```
/api/apartments/:apartmentId/charges
```

### Path Parameters
- `apartmentId` (required): UUID - ID mieszkania

### Query Parameters
- `lease_id` (optional): UUID - ID konkretnego najmu (dla widoku historycznego)
- `month` (optional): string - Filtr po miesiącu w formacie YYYY-MM
- `status` (optional): string - Filtr po statusie płatności (`unpaid`, `partially_paid`, `paid`)
- `overdue` (optional): boolean - Filtr tylko przeterminowanych opłat

### Headers
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

### Request Body
Brak (GET request)

## 3. Wykorzystywane typy

### DTOs
```typescript
import type {
  ChargeListItemDTO,
  ChargesListDTO
} from '@/types';
```

**ChargeListItemDTO:**
```typescript
type ChargeListItemDTO = Omit<
  Tables<'charges_with_status'>,
  'created_by' | 'lease_id'
> & {
  attachment_url?: string;
};
```

Pola:
- `id`: UUID opłaty
- `amount`: kwota opłaty (NUMERIC)
- `due_date`: data wymagalności (DATE)
- `type`: typ opłaty (rent, bill, other)
- `comment`: opcjonalny komentarz (max 300 znaków)
- `attachment_path`: ścieżka do załącznika w Storage
- `attachment_url`: signed URL do pobrania załącznika (generowany dynamicznie)
- `created_at`: timestamp utworzenia
- `updated_at`: timestamp ostatniej aktualizacji
- `total_paid`: suma wpłat (NUMERIC, obliczone przez view)
- `remaining_amount`: pozostała kwota do zapłaty (obliczone przez view)
- `payment_status`: status płatności (unpaid, partially_paid, paid)
- `is_overdue`: flaga przeterminowania (boolean)

**ChargesListDTO:**
```typescript
type ChargesListDTO = {
  charges_by_month: Record<string, ChargeListItemDTO[]>;
};
```

### Zod Schemas dla walidacji
```typescript
import { z } from 'zod';

const getChargesQuerySchema = z.object({
  lease_id: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(), // YYYY-MM
  status: z.enum(['unpaid', 'partially_paid', 'paid']).optional(),
  overdue: z.enum(['true', 'false']).optional().transform(val => val === 'true')
});
```

## 4. Szczegóły odpowiedzi

### Success Response (200 OK)

**Owner/Tenant - Lista opłat pogrupowana po miesiącach:**
```json
{
  "charges_by_month": {
    "2025-01": [
      {
        "id": "uuid",
        "amount": 2000.00,
        "due_date": "2025-01-10",
        "type": "rent",
        "comment": "Czynsz za styczeń 2025",
        "attachment_path": "apartment-uuid/charge-uuid.pdf",
        "attachment_url": "https://storage.supabase.co/...",
        "created_at": "2025-01-01T10:00:00Z",
        "updated_at": "2025-01-01T10:00:00Z",
        "payment_status": "partially_paid",
        "total_paid": 1000.00,
        "remaining_amount": 1000.00,
        "is_overdue": false
      }
    ],
    "2024-12": [
      {
        "id": "uuid",
        "amount": 2000.00,
        "due_date": "2024-12-10",
        "type": "rent",
        "comment": "Czynsz za grudzień 2024",
        "attachment_path": null,
        "attachment_url": null,
        "created_at": "2024-12-01T10:00:00Z",
        "updated_at": "2024-12-01T10:00:00Z",
        "payment_status": "paid",
        "total_paid": 2000.00,
        "remaining_amount": 0.00,
        "is_overdue": false
      }
    ]
  }
}
```

### Error Responses

**400 Bad Request** - Nieprawidłowe parametry query
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowe parametry zapytania",
  "details": {
    "month": "Format miesiąca musi być YYYY-MM"
  }
}
```

**401 Unauthorized** - Brak autoryzacji
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

**403 Forbidden** - Brak dostępu do mieszkania
```json
{
  "error": "Forbidden",
  "message": "Nie masz uprawnień do przeglądania opłat dla tego mieszkania"
}
```

**404 Not Found** - Mieszkanie nie istnieje
```json
{
  "error": "Not Found",
  "message": "Mieszkanie nie zostało znalezione"
}
```

**404 Not Found** - Brak aktywnego najmu
```json
{
  "error": "Not Found",
  "message": "Brak aktywnego najmu dla tego mieszkania"
}
```

**500 Internal Server Error**
```json
{
  "error": "Internal Server Error",
  "message": "Wystąpił błąd serwera"
}
```

## 5. Przepływ danych

### 1. Request Processing
```
Client Request
    ↓
Astro API Route (/api/apartments/[id]/charges.ts)
    ↓
Validate apartmentId (UUID format)
    ↓
Validate query parameters (Zod schema)
    ↓
Get authenticated user from context.locals.user
    ↓
Check user authentication (401 if not authenticated)
```

### 2. Business Logic (ChargesService)
```
ChargesService.getChargesForApartment()
    ↓
Verify apartment exists (query apartments table)
    ├─ Not found → return 404
    └─ Found → continue
    ↓
Get active lease for apartment (or specific lease_id if provided)
    ├─ lease_id provided → use specific lease
    └─ no lease_id → get active lease
    ├─ No active lease → return 404
    └─ Lease found → continue
    ↓
Check authorization via RLS:
    ├─ Owner: apartments.owner_id = auth.uid()
    └─ Tenant: leases.tenant_id = auth.uid() AND leases.status = 'active'
    ├─ No access → return 403 (automatically via RLS)
    └─ Access granted → continue
    ↓
Query charges_with_status view with filters:
    ├─ Filter by lease_id
    ├─ Filter by month (if provided): EXTRACT(YEAR FROM due_date) || '-' || LPAD(EXTRACT(MONTH FROM due_date)::text, 2, '0')
    ├─ Filter by status (if provided): payment_status = :status
    └─ Filter by overdue (if provided): is_overdue = :overdue
    ↓
Order by due_date DESC
    ↓
For each charge with attachment_path:
    └─ Generate signed URL from Supabase Storage (bucket: charge-attachments)
    ↓
Group charges by month (YYYY-MM format)
    ↓
Return grouped charges
```

### 3. Database Interactions

**Query 1: Verify apartment exists**
```sql
SELECT id, owner_id
FROM apartments
WHERE id = :apartmentId;
-- RLS automatically filters by owner_id or tenant access
```

**Query 2: Get active lease (if lease_id not provided)**
```sql
SELECT id, tenant_id, status
FROM leases
WHERE apartment_id = :apartmentId
  AND status = 'active'
LIMIT 1;
-- RLS automatically filters access
```

**Query 3: Get charges with payment status**
```sql
SELECT
  id, amount, due_date, type, comment,
  attachment_path, created_at, updated_at,
  total_paid, remaining_amount, payment_status, is_overdue
FROM charges_with_status
WHERE lease_id = :leaseId
  -- Optional filters
  AND (:month IS NULL OR EXTRACT(YEAR FROM due_date) || '-' || LPAD(EXTRACT(MONTH FROM due_date)::text, 2, '0') = :month)
  AND (:status IS NULL OR payment_status = :status)
  AND (:overdue IS NULL OR is_overdue = :overdue)
ORDER BY due_date DESC;
-- RLS automatically filters by owner/tenant access
```

### 4. Storage Interactions

For each charge with `attachment_path`:
```typescript
const { data: signedUrl } = await supabase.storage
  .from('charge-attachments')
  .createSignedUrl(charge.attachment_path, 3600); // 1 hour expiry
```

**Note:** RLS policies na storage.objects automatycznie weryfikują dostęp.

## 6. Względy bezpieczeństwa

### Authorization
- **RLS Policies:** Wszystkie operacje SELECT na `charges` są automatycznie filtrowane przez RLS
- **Owner access:** Właściciel widzi opłaty dla swoich mieszkań (poprzez JOIN z apartments)
- **Tenant access:** Lokator widzi tylko opłaty dla swojego aktywnego najmu
- Brak dodatkowej walidacji na poziomie aplikacji - RLS zapewnia bezpieczeństwo

### Input Validation
- Walidacja `apartmentId` jako UUID
- Walidacja parametrów query za pomocą Zod schema
- Sanityzacja parametrów przed użyciem w query

### Storage Security
- Signed URLs z expiracją (1 godzina)
- RLS policies na storage.objects weryfikują dostęp
- Tylko właściciel i lokator z aktywnym najmem mogą pobrać załączniki

### Rate Limiting
- Supabase wbudowany rate limiting: 100 req/s per IP
- Wyższe limity dla authenticated users

## 7. Obsługa błędów

### Validation Errors (400)
```typescript
try {
  const queryParams = getChargesQuerySchema.parse(request.query);
} catch (error) {
  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({
      error: 'Validation Error',
      message: 'Nieprawidłowe parametry zapytania',
      details: error.flatten().fieldErrors
    }), { status: 400 });
  }
}
```

### Authorization Errors
- **401 Unauthorized:** `if (!user)` → return 401
- **403 Forbidden:** RLS zwróci pustą listę, należy sprawdzić czy apartment istnieje najpierw
- **404 Not Found:** Brak mieszkania lub brak aktywnego najmu

### Database Errors (500)
```typescript
catch (error) {
  console.error('Error fetching charges:', error);
  return new Response(JSON.stringify({
    error: 'Internal Server Error',
    message: 'Wystąpił błąd podczas pobierania opłat'
  }), { status: 500 });
}
```

### Storage Errors
```typescript
// Jeśli signed URL nie może być wygenerowany, ustawić attachment_url na null
if (!signedUrl) {
  charge.attachment_url = null;
  console.warn(`Failed to generate signed URL for charge ${charge.id}`);
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje
1. **Database View:** Użycie `charges_with_status` view eliminuje potrzebę ręcznego obliczania statusów płatności
2. **Indeksy:**
   - `idx_charges_lease_id` - dla filtrowania po lease_id
   - `idx_charges_due_date` - dla sortowania
3. **Batch signed URLs:** Generować signed URLs równolegle dla wszystkich załączników
4. **Caching:** Rozważyć cache dla często pobieranych opłat (post-MVP)

### Potencjalne wąskie gardła
- **N+1 queries dla signed URLs:** Generowanie signed URLs dla każdego załącznika osobno
  - **Rozwiązanie:** Użyć `Promise.all()` dla równoległego generowania URLs
- **Duża liczba opłat:** Filtrowanie i grupowanie po miesiącach może być kosztowne
  - **Rozwiązanie:** Dodać paginację (limit/offset) w przyszłości
- **RLS policies:** Złożone JOINy w policies mogą wpływać na wydajność
  - **Rozwiązanie:** Monitorować `pg_stat_statements` i optymalizować queries

### Monitorowanie
- Logować czas wykonania query do charges_with_status
- Logować liczbę wygenerowanych signed URLs
- Monitorować użycie rate limitu Supabase

## 9. Etapy wdrożenia

### Krok 1: Utworzenie Zod schemas dla walidacji
**Plik:** `src/lib/validation/charges.validation.ts`

```typescript
import { z } from 'zod';

export const getChargesQuerySchema = z.object({
  lease_id: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/, {
    message: 'Format miesiąca musi być YYYY-MM'
  }).optional(),
  status: z.enum(['unpaid', 'partially_paid', 'paid'], {
    errorMap: () => ({ message: 'Status musi być: unpaid, partially_paid lub paid' })
  }).optional(),
  overdue: z.enum(['true', 'false']).optional().transform(val => val === 'true')
});
```

### Krok 2: Utworzenie ChargesService
**Plik:** `src/lib/services/charges.service.ts`

```typescript
import type { SupabaseClient } from '@/db/supabase.client';
import type { ChargesListDTO, ChargeListItemDTO } from '@/types';

export class ChargesService {
  constructor(private supabase: SupabaseClient) {}

  async getChargesForApartment(
    apartmentId: string,
    filters: {
      lease_id?: string;
      month?: string;
      status?: 'unpaid' | 'partially_paid' | 'paid';
      overdue?: boolean;
    }
  ): Promise<ChargesListDTO> {
    // 1. Verify apartment exists
    const { data: apartment, error: apartmentError } = await this.supabase
      .from('apartments')
      .select('id, owner_id')
      .eq('id', apartmentId)
      .single();

    if (apartmentError || !apartment) {
      throw new Error('APARTMENT_NOT_FOUND');
    }

    // 2. Get lease_id (from filter or active lease)
    let leaseId = filters.lease_id;

    if (!leaseId) {
      const { data: lease, error: leaseError } = await this.supabase
        .from('leases')
        .select('id')
        .eq('apartment_id', apartmentId)
        .eq('status', 'active')
        .single();

      if (leaseError || !lease) {
        throw new Error('NO_ACTIVE_LEASE');
      }

      leaseId = lease.id;
    }

    // 3. Build query for charges
    let query = this.supabase
      .from('charges_with_status')
      .select('*')
      .eq('lease_id', leaseId);

    // Apply filters
    if (filters.month) {
      // Filter by month using PostgreSQL date functions
      query = query.filter(
        'due_date',
        'gte',
        `${filters.month}-01`
      ).filter(
        'due_date',
        'lt',
        `${this.getNextMonth(filters.month)}-01`
      );
    }

    if (filters.status) {
      query = query.eq('payment_status', filters.status);
    }

    if (filters.overdue !== undefined) {
      query = query.eq('is_overdue', filters.overdue);
    }

    // Order by due_date DESC
    query = query.order('due_date', { ascending: false });

    const { data: charges, error: chargesError } = await query;

    if (chargesError) {
      console.error('Error fetching charges:', chargesError);
      throw new Error('DATABASE_ERROR');
    }

    // 4. Generate signed URLs for attachments (in parallel)
    const chargesWithUrls = await Promise.all(
      (charges || []).map(async (charge) => {
        let attachment_url = null;

        if (charge.attachment_path) {
          const { data: signedUrl } = await this.supabase.storage
            .from('charge-attachments')
            .createSignedUrl(charge.attachment_path, 3600); // 1 hour

          if (signedUrl) {
            attachment_url = signedUrl.signedUrl;
          }
        }

        // Remove internal fields
        const { created_by, lease_id, ...chargeDto } = charge;

        return {
          ...chargeDto,
          attachment_url
        } as ChargeListItemDTO;
      })
    );

    // 5. Group by month (YYYY-MM)
    const chargesByMonth: Record<string, ChargeListItemDTO[]> = {};

    for (const charge of chargesWithUrls) {
      const month = charge.due_date.substring(0, 7); // Extract YYYY-MM

      if (!chargesByMonth[month]) {
        chargesByMonth[month] = [];
      }

      chargesByMonth[month].push(charge);
    }

    return { charges_by_month: chargesByMonth };
  }

  private getNextMonth(month: string): string {
    const [year, monthNum] = month.split('-').map(Number);
    const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
    const nextYear = monthNum === 12 ? year + 1 : year;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
  }
}
```

### Krok 3: Utworzenie Astro API route
**Plik:** `src/pages/api/apartments/[id]/charges.ts`

```typescript
import type { APIContext } from 'astro';
import { ChargesService } from '@/lib/services/charges.service';
import { getChargesQuerySchema } from '@/lib/validation/charges.validation';
import { z } from 'zod';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const { params, url, locals } = context;
  const { supabase, user } = locals;

  // 1. Check authentication
  if (!user) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Brak autoryzacji'
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. Validate apartmentId
  const apartmentId = params.id;
  if (!apartmentId) {
    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        message: 'Brak ID mieszkania'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 3. Validate query parameters
  const queryParams = Object.fromEntries(url.searchParams);

  let validatedParams;
  try {
    validatedParams = getChargesQuerySchema.parse(queryParams);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Nieprawidłowe parametry zapytania',
          details: error.flatten().fieldErrors
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 4. Call service
  try {
    const chargesService = new ChargesService(supabase);
    const result = await chargesService.getChargesForApartment(
      apartmentId,
      validatedParams
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in GET /api/apartments/:id/charges:', error);

    // Handle specific errors
    if (error.message === 'APARTMENT_NOT_FOUND') {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Mieszkanie nie zostało znalezione'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (error.message === 'NO_ACTIVE_LEASE') {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Brak aktywnego najmu dla tego mieszkania'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generic error
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Wystąpił błąd podczas pobierania opłat'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### Krok 4: Testowanie
1. **Test jednostkowy:** ChargesService.getChargesForApartment()
2. **Test integracyjny:** API endpoint z mock Supabase
3. **Test E2E:** Pełny flow z frontendu do bazy danych

### Krok 5: Dokumentacja
- Dodać JSDoc comments do service methods
- Zaktualizować API documentation
- Dodać przykłady użycia w README
