# API Endpoint Implementation Plan: POST /api/apartments/:id/charges

## 1. Przegląd punktu końcowego

**Endpoint:** `POST /api/apartments/:apartmentId/charges`

**Cel:** Utworzenie nowej opłaty dla aktywnego najmu mieszkania (tylko właściciel).

**Funkcjonalność:**
- Tworzy nową opłatę przypisaną do aktywnego najmu
- Waliduje wszystkie pola zgodnie z regułami biznesowymi
- Automatycznie ustawia status płatności na "unpaid"
- Tylko właściciel może tworzyć opłaty
- Wymaga istnienia aktywnego najmu

## 2. Szczegóły żądania

### HTTP Method
`POST`

### URL Structure
```
/api/apartments/:apartmentId/charges
```

### Path Parameters
- `apartmentId` (required): UUID - ID mieszkania

### Headers
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

### Request Body
```json
{
  "amount": 2000.00,
  "due_date": "2025-02-10",
  "type": "rent",
  "comment": "Czynsz za luty 2025"
}
```

**Pola:**
- `amount` (required): number - Kwota opłaty w PLN, musi być > 0, max 2 miejsca po przecinku
- `due_date` (required): string - Data wymagalności w formacie ISO 8601 (YYYY-MM-DD)
- `type` (required): enum - Typ opłaty: "rent", "bill", "other"
- `comment` (optional): string - Komentarz, max 300 znaków

## 3. Wykorzystywane typy

### Command Model
```typescript
import type { CreateChargeCommand } from '@/types';

type CreateChargeCommand = Pick<
  TablesInsert<'charges'>,
  'amount' | 'due_date' | 'type'
> & {
  comment?: string;
};
```

### Response DTO
```typescript
// Zwraca pełne dane opłaty z automatycznie obliczonym statusem
type ChargeListItemDTO = Omit<
  Tables<'charges_with_status'>,
  'created_by' | 'lease_id'
> & {
  attachment_url?: string;
};
```

### Zod Schema
```typescript
import { z } from 'zod';

const createChargeSchema = z.object({
  amount: z.number()
    .positive({ message: 'Kwota musi być większa od 0' })
    .multipleOf(0.01, { message: 'Kwota może mieć maksymalnie 2 miejsca po przecinku' })
    .max(999999.99, { message: 'Kwota nie może przekraczać 999 999.99 zł' }),
  due_date: z.string()
    .datetime({ message: 'Data musi być w formacie ISO 8601' })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data musi być w formacie YYYY-MM-DD' })),
  type: z.enum(['rent', 'bill', 'other'], {
    errorMap: () => ({ message: 'Typ musi być: rent, bill lub other' })
  }),
  comment: z.string()
    .max(300, { message: 'Komentarz nie może przekraczać 300 znaków' })
    .optional()
});
```

## 4. Szczegóły odpowiedzi

### Success Response (201 Created)
```json
{
  "id": "uuid",
  "amount": 2000.00,
  "due_date": "2025-02-10",
  "type": "rent",
  "comment": "Czynsz za luty 2025",
  "attachment_path": null,
  "attachment_url": null,
  "created_at": "2025-01-12T10:00:00Z",
  "updated_at": "2025-01-12T10:00:00Z",
  "payment_status": "unpaid",
  "total_paid": 0.00,
  "remaining_amount": 2000.00,
  "is_overdue": false
}
```

### Error Responses

**400 Bad Request** - Błędy walidacji
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowe dane",
  "details": {
    "amount": "Kwota musi być większa od 0",
    "comment": "Komentarz nie może przekraczać 300 znaków"
  }
}
```

**401 Unauthorized**
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

**403 Forbidden** - Nie jest właścicielem
```json
{
  "error": "Forbidden",
  "message": "Tylko właściciele mogą dodawać opłaty"
}
```

**404 Not Found** - Brak mieszkania
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
  "message": "Wystąpił błąd podczas tworzenia opłaty"
}
```

## 5. Przepływ danych

### 1. Request Processing
```
Client Request (POST with JSON body)
    ↓
Astro API Route (/api/apartments/[id]/charges.ts)
    ↓
Validate apartmentId (UUID format)
    ↓
Parse and validate request body (Zod schema)
    ↓
Get authenticated user from context.locals.user
    ↓
Check user authentication (401 if not authenticated)
```

### 2. Business Logic (ChargesService)
```
ChargesService.createCharge()
    ↓
Verify apartment exists and user is owner
    ├─ Not found → return 404
    ├─ Not owner → return 403 (via RLS)
    └─ Owner → continue
    ↓
Get active lease for apartment
    ├─ No active lease → return 404
    └─ Active lease found → continue
    ↓
Insert new charge:
    ├─ lease_id = active_lease.id
    ├─ amount, due_date, type, comment from request
    ├─ created_by = auth.uid()
    └─ attachment_path = null (initially)
    ↓
RLS automatically validates:
    ├─ User is owner of apartment (via JOIN)
    └─ Access granted → insert
    ↓
Query charges_with_status to get computed fields
    ↓
Return created charge with payment status
```

### 3. Database Interactions

**Query 1: Verify apartment and ownership**
```sql
SELECT id, owner_id
FROM apartments
WHERE id = :apartmentId;
-- RLS automatically filters by owner_id = auth.uid()
```

**Query 2: Get active lease**
```sql
SELECT id
FROM leases
WHERE apartment_id = :apartmentId
  AND status = 'active'
LIMIT 1;
-- RLS automatically filters access
```

**Query 3: Insert new charge**
```sql
INSERT INTO charges (lease_id, amount, due_date, type, comment, created_by)
VALUES (:leaseId, :amount, :dueDate, :type, :comment, auth.uid())
RETURNING id;
-- RLS policy "Owners can insert charges for their apartments" validates
```

**Query 4: Get created charge with status**
```sql
SELECT *
FROM charges_with_status
WHERE id = :chargeId;
-- Returns charge with computed payment_status, total_paid, etc.
```

## 6. Względy bezpieczeństwa

### Authorization
- **Owner-only:** Tylko właściciel mieszkania może tworzyć opłaty
- **RLS Policy:** INSERT policy weryfikuje czy użytkownik jest właścicielem (poprzez JOIN z apartments)
- **Role check:** Dodatkowa walidacja w service czy user.role === 'owner'

### Input Validation
- **Amount:** Musi być > 0, max 2 miejsca po przecinku, max 999,999.99
- **Due date:** Format ISO 8601 (YYYY-MM-DD)
- **Type:** Enum validation (rent, bill, other)
- **Comment:** Max 300 znaków
- **SQL Injection:** Zapobiegane przez Supabase prepared statements

### Business Rules Enforcement
- Wymaga istnienia aktywnego najmu
- created_by automatycznie ustawiane na auth.uid()
- attachment_path inicjalnie null (załącznik dodawany osobnym endpointem)

## 7. Obsługa błędów

### Validation Errors (400)
```typescript
try {
  const validated = createChargeSchema.parse(requestBody);
} catch (error) {
  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({
      error: 'Validation Error',
      message: 'Nieprawidłowe dane',
      details: error.flatten().fieldErrors
    }), { status: 400 });
  }
}
```

### Authorization Errors
- **401:** Brak authenticated user
- **403:** User nie jest właścicielem (RLS zwróci błąd przy INSERT)

### Not Found Errors (404)
- Apartment nie istnieje
- Brak aktywnego najmu dla mieszkania

### Database Errors (500)
```typescript
catch (error) {
  console.error('Error creating charge:', error);
  return new Response(JSON.stringify({
    error: 'Internal Server Error',
    message: 'Wystąpił błąd podczas tworzenia opłaty'
  }), { status: 500 });
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje
1. **Single transaction:** Wszystkie operacje w jednej transakcji
2. **Minimal queries:** 4 queries total (verify apartment, get lease, insert, fetch with status)
3. **Indexed columns:** lease_id, due_date mają indeksy

### Potencjalne wąskie gardła
- Weryfikacja ownership poprzez RLS może wymagać JOIN z apartments
- Query do charges_with_status po INSERT (agregacja wpłat)

### Monitorowanie
- Logować czas wykonania INSERT
- Monitorować częstotliwość błędów 404 (brak active lease)

## 9. Etapy wdrożenia

### Krok 1: Utworzenie Zod schema
**Plik:** `src/lib/validation/charges.validation.ts`

```typescript
import { z } from 'zod';

export const createChargeSchema = z.object({
  amount: z.number()
    .positive({ message: 'Kwota musi być większa od 0' })
    .multipleOf(0.01, { message: 'Kwota może mieć maksymalnie 2 miejsca po przecinku' })
    .max(999999.99, { message: 'Kwota nie może przekraczać 999 999.99 zł' }),
  due_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data musi być w formacie YYYY-MM-DD' })
    .refine((date) => {
      const parsed = new Date(date);
      return !isNaN(parsed.getTime());
    }, { message: 'Nieprawidłowa data' }),
  type: z.enum(['rent', 'bill', 'other'], {
    errorMap: () => ({ message: 'Typ musi być: rent, bill lub other' })
  }),
  comment: z.string()
    .max(300, { message: 'Komentarz nie może przekraczać 300 znaków' })
    .optional()
});
```

### Krok 2: Rozszerzenie ChargesService
**Plik:** `src/lib/services/charges.service.ts`

```typescript
async createCharge(
  apartmentId: string,
  data: CreateChargeCommand,
  userId: string
): Promise<ChargeListItemDTO> {
  // 1. Verify apartment exists and user is owner
  const { data: apartment, error: apartmentError } = await this.supabase
    .from('apartments')
    .select('id, owner_id')
    .eq('id', apartmentId)
    .single();

  if (apartmentError || !apartment) {
    throw new Error('APARTMENT_NOT_FOUND');
  }

  // Additional check: verify user is owner
  if (apartment.owner_id !== userId) {
    throw new Error('FORBIDDEN');
  }

  // 2. Get active lease
  const { data: lease, error: leaseError } = await this.supabase
    .from('leases')
    .select('id')
    .eq('apartment_id', apartmentId)
    .eq('status', 'active')
    .single();

  if (leaseError || !lease) {
    throw new Error('NO_ACTIVE_LEASE');
  }

  // 3. Insert new charge
  const { data: insertedCharge, error: insertError } = await this.supabase
    .from('charges')
    .insert({
      lease_id: lease.id,
      amount: data.amount,
      due_date: data.due_date,
      type: data.type,
      comment: data.comment || null,
      created_by: userId
    })
    .select('id')
    .single();

  if (insertError || !insertedCharge) {
    console.error('Error inserting charge:', insertError);
    throw new Error('DATABASE_ERROR');
  }

  // 4. Fetch created charge with computed status
  const { data: createdCharge, error: fetchError } = await this.supabase
    .from('charges_with_status')
    .select('*')
    .eq('id', insertedCharge.id)
    .single();

  if (fetchError || !createdCharge) {
    console.error('Error fetching created charge:', fetchError);
    throw new Error('DATABASE_ERROR');
  }

  // 5. Remove internal fields
  const { created_by, lease_id, ...chargeDto } = createdCharge;

  return {
    ...chargeDto,
    attachment_url: null // No attachment initially
  } as ChargeListItemDTO;
}
```

### Krok 3: Utworzenie POST handler w API route
**Plik:** `src/pages/api/apartments/[id]/charges.ts`

```typescript
export async function POST(context: APIContext): Promise<Response> {
  const { params, request, locals } = context;
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

  // 2. Check if user is owner
  if (user.role !== 'owner') {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Tylko właściciele mogą dodawać opłaty'
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 3. Validate apartmentId
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

  // 4. Parse and validate request body
  let requestBody;
  try {
    requestBody = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        message: 'Nieprawidłowy format JSON'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let validatedData;
  try {
    validatedData = createChargeSchema.parse(requestBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Nieprawidłowe dane',
          details: error.flatten().fieldErrors
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 5. Call service
  try {
    const chargesService = new ChargesService(supabase);
    const result = await chargesService.createCharge(
      apartmentId,
      validatedData,
      user.id
    );

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in POST /api/apartments/:id/charges:', error);

    if (error.message === 'APARTMENT_NOT_FOUND') {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Mieszkanie nie zostało znalezione'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (error.message === 'FORBIDDEN') {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: 'Nie masz uprawnień do dodawania opłat dla tego mieszkania'
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
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

    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Wystąpił błąd podczas tworzenia opłaty'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### Krok 4: Testowanie
1. **Unit tests:** ChargesService.createCharge()
   - Test successful creation
   - Test apartment not found
   - Test no active lease
   - Test forbidden (not owner)
2. **Integration tests:** API endpoint
   - Test with valid data
   - Test validation errors
   - Test authorization errors
3. **E2E tests:** Full flow from frontend

### Krok 5: Dokumentacja
- Dodać JSDoc comments
- Zaktualizować API documentation
- Dodać przykłady request/response w README
