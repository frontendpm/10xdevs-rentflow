# API Endpoint Implementation Plan: GET /api/charges/:id

## 1. Przegląd punktu końcowego

**Endpoint:** `GET /api/charges/:id`

**Cel:** Pobranie szczegółowych informacji o konkretnej opłacie, w tym listy wszystkich wpłat.

**Funkcjonalność:**
- Zwraca pełne dane opłaty z automatycznie obliczonym statusem płatności
- Zawiera listę wszystkich wpłat powiązanych z opłatą
- Generuje signed URL dla załącznika (jeśli istnieje)
- Dostępne dla właściciela i lokatora z aktywnym najmem

## 2. Szczegóły żądania

### HTTP Method
`GET`

### URL Structure
```
/api/charges/:id
```

### Path Parameters
- `id` (required): UUID - ID opłaty

### Headers
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

### Query Parameters
Brak

### Request Body
Brak (GET request)

## 3. Wykorzystywane typy

### Response DTO
```typescript
import type { ChargeDetailsDTO, PaymentDTO } from '@/types';

type ChargeDetailsDTO = ChargeListItemDTO & {
  payments: PaymentDTO[];
};

type ChargeListItemDTO = Omit<
  Tables<'charges_with_status'>,
  'created_by' | 'lease_id'
> & {
  attachment_url?: string;
};

type PaymentDTO = Tables<'payments'>;
```

## 4. Szczegóły odpowiedzi

### Success Response (200 OK)
```json
{
  "id": "uuid",
  "amount": 2000.00,
  "due_date": "2025-01-10",
  "type": "rent",
  "comment": "Czynsz za styczeń 2025",
  "attachment_path": "apartment-uuid/charge-uuid.pdf",
  "attachment_url": "https://storage.supabase.co/...",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-05T15:00:00Z",
  "payment_status": "partially_paid",
  "total_paid": 1000.00,
  "remaining_amount": 1000.00,
  "is_overdue": false,
  "payments": [
    {
      "id": "uuid",
      "charge_id": "uuid",
      "amount": 1000.00,
      "payment_date": "2025-01-05",
      "created_at": "2025-01-05T15:00:00Z",
      "updated_at": "2025-01-05T15:00:00Z",
      "created_by": "uuid"
    }
  ]
}
```

### Error Responses

**401 Unauthorized**
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

**403 Forbidden** - Brak dostępu do opłaty
```json
{
  "error": "Forbidden",
  "message": "Nie masz uprawnień do przeglądania tej opłaty"
}
```

**404 Not Found** - Opłata nie istnieje
```json
{
  "error": "Not Found",
  "message": "Opłata nie została znaleziona"
}
```

**500 Internal Server Error**
```json
{
  "error": "Internal Server Error",
  "message": "Wystąpił błąd podczas pobierania opłaty"
}
```

## 5. Przepływ danych

### 1. Request Processing
```
Client Request
    ↓
Astro API Route (/api/charges/[id].ts)
    ↓
Validate chargeId (UUID format)
    ↓
Get authenticated user from context.locals.user
    ↓
Check user authentication (401 if not authenticated)
```

### 2. Business Logic (ChargesService)
```
ChargesService.getChargeById()
    ↓
Query charges_with_status for charge details
    ├─ RLS automatically filters access (owner or tenant with active lease)
    ├─ Not found or no access → return 404/403
    └─ Found → continue
    ↓
Generate signed URL for attachment (if exists)
    ↓
Query payments for this charge
    ├─ RLS automatically filters access
    └─ Order by payment_date DESC
    ↓
Combine charge details with payments list
    ↓
Return ChargeDetailsDTO
```

### 3. Database Interactions

**Query 1: Get charge with status**
```sql
SELECT *
FROM charges_with_status
WHERE id = :chargeId;
-- RLS automatically filters:
-- Owner: via JOIN leases -> apartments where owner_id = auth.uid()
-- Tenant: via JOIN leases where tenant_id = auth.uid() AND status = 'active'
```

**Query 2: Get payments for charge**
```sql
SELECT *
FROM payments
WHERE charge_id = :chargeId
ORDER BY payment_date DESC, created_at DESC;
-- RLS automatically filters access (same as charges)
```

### 4. Storage Interactions

If charge has `attachment_path`:
```typescript
const { data: signedUrl } = await supabase.storage
  .from('charge-attachments')
  .createSignedUrl(charge.attachment_path, 3600); // 1 hour
```

## 6. Względy bezpieczeństwa

### Authorization
- **RLS Policies:** SELECT na `charges` i `payments` automatycznie filtruje dostęp
- **Owner access:** Właściciel widzi opłaty dla swoich mieszkań (poprzez JOIN)
- **Tenant access:** Lokator widzi tylko opłaty dla swojego aktywnego najmu
- **No additional checks needed:** RLS zapewnia bezpieczeństwo

### Input Validation
- Walidacja `chargeId` jako UUID

### Storage Security
- Signed URLs z expiracją (1 godzina)
- RLS policies na storage.objects weryfikują dostęp

## 7. Obsługa błędów

### Authorization Errors
- **401:** Brak authenticated user
- **403/404:** RLS zwróci pusty wynik jeśli brak dostępu

### Not Found (404)
```typescript
if (!charge) {
  throw new Error('CHARGE_NOT_FOUND');
}
```

### Database Errors (500)
```typescript
catch (error) {
  console.error('Error fetching charge details:', error);
  throw new Error('DATABASE_ERROR');
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje
1. **View usage:** `charges_with_status` agreguje payment data
2. **Indexes:** `idx_payments_charge_id` dla szybkiego JOIN
3. **Single signed URL:** Tylko jeden attachment per charge

### Potencjalne wąskie gardła
- RLS policies z JOINami mogą być kosztowne
- Generowanie signed URL dodaje latencję

### Monitorowanie
- Logować czas wykonania queries
- Monitorować częstotliwość 404 errors

## 9. Etapy wdrożenia

### Krok 1: Rozszerzenie ChargesService
**Plik:** `src/lib/services/charges.service.ts`

```typescript
async getChargeById(chargeId: string): Promise<ChargeDetailsDTO> {
  // 1. Get charge with computed status
  const { data: charge, error: chargeError } = await this.supabase
    .from('charges_with_status')
    .select('*')
    .eq('id', chargeId)
    .single();

  if (chargeError || !charge) {
    throw new Error('CHARGE_NOT_FOUND');
  }

  // 2. Generate signed URL for attachment
  let attachment_url = null;
  if (charge.attachment_path) {
    const { data: signedUrl } = await this.supabase.storage
      .from('charge-attachments')
      .createSignedUrl(charge.attachment_path, 3600);

    if (signedUrl) {
      attachment_url = signedUrl.signedUrl;
    }
  }

  // 3. Get payments for this charge
  const { data: payments, error: paymentsError } = await this.supabase
    .from('payments')
    .select('*')
    .eq('charge_id', chargeId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (paymentsError) {
    console.error('Error fetching payments:', paymentsError);
    throw new Error('DATABASE_ERROR');
  }

  // 4. Combine data
  const { created_by, lease_id, ...chargeDto } = charge;

  return {
    ...chargeDto,
    attachment_url,
    payments: payments || []
  } as ChargeDetailsDTO;
}
```

### Krok 2: Utworzenie API route
**Plik:** `src/pages/api/charges/[id].ts`

```typescript
import type { APIContext } from 'astro';
import { ChargesService } from '@/lib/services/charges.service';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const { params, locals } = context;
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

  // 2. Validate chargeId
  const chargeId = params.id;
  if (!chargeId) {
    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        message: 'Brak ID opłaty'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 3. Call service
  try {
    const chargesService = new ChargesService(supabase);
    const result = await chargesService.getChargeById(chargeId);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in GET /api/charges/:id:', error);

    if (error.message === 'CHARGE_NOT_FOUND') {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Opłata nie została znaleziona'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Wystąpił błąd podczas pobierania opłaty'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### Krok 3: Testowanie
1. **Unit tests:** ChargesService.getChargeById()
2. **Integration tests:** API endpoint
3. **E2E tests:** Full flow with payments

### Krok 4: Dokumentacja
- JSDoc comments
- API documentation
- Examples in README
