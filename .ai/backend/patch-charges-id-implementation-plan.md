# API Endpoint Implementation Plan: PATCH /api/charges/:id

## 1. Przegląd punktu końcowego

**Endpoint:** `PATCH /api/charges/:id`

**Cel:** Aktualizacja danych opłaty (tylko właściciel).

**Funkcjonalność:**
- Aktualizuje wybrane pola opłaty
- Tylko właściciel może edytować opłaty
- **Reguły biznesowe (wymuszane przez DB trigger):**
  - Nie można edytować opłaty ze statusem "paid"
  - Kwota nie może być niższa niż suma wpłat

## 2. Szczegóły żądania

### HTTP Method
`PATCH`

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

### Request Body
Wszystkie pola opcjonalne:
```json
{
  "amount": 2100.00,
  "due_date": "2025-01-15",
  "type": "rent",
  "comment": "Czynsz za styczeń 2025 - zaktualizowana kwota"
}
```

## 3. Wykorzystywane typy

### Command Model
```typescript
import type { UpdateChargeCommand } from '@/types';

type UpdateChargeCommand = Partial<
  Pick<TablesUpdate<'charges'>, 'amount' | 'due_date' | 'type' | 'comment'>
>;
```

### Zod Schema
```typescript
const updateChargeSchema = z.object({
  amount: z.number()
    .positive({ message: 'Kwota musi być większa od 0' })
    .multipleOf(0.01)
    .max(999999.99)
    .optional(),
  due_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  type: z.enum(['rent', 'bill', 'other']).optional(),
  comment: z.string().max(300).optional().nullable()
});
```

## 4. Szczegóły odpowiedzi

### Success Response (200 OK)
```json
{
  "id": "uuid",
  "amount": 2100.00,
  "due_date": "2025-01-15",
  "type": "rent",
  "comment": "Czynsz za styczeń 2025 - zaktualizowana kwota",
  "attachment_path": "apartment-uuid/charge-uuid.pdf",
  "attachment_url": "https://storage.supabase.co/...",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-12T10:00:00Z",
  "payment_status": "partially_paid",
  "total_paid": 1000.00,
  "remaining_amount": 1100.00,
  "is_overdue": false
}
```

### Error Responses

**400 Bad Request** - Opłata w pełni opłacona
```json
{
  "error": "Bad Request",
  "message": "Nie można edytować w pełni opłaconej opłaty"
}
```

**400 Bad Request** - Kwota zbyt niska
```json
{
  "error": "Bad Request",
  "message": "Kwota opłaty nie może być niższa niż suma dokonanych wpłat (1000.00 zł)"
}
```

**400 Bad Request** - Błędy walidacji
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowe dane",
  "details": {
    "amount": "Kwota musi być większa od 0"
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

**403 Forbidden**
```json
{
  "error": "Forbidden",
  "message": "Nie masz uprawnień do edycji tej opłaty"
}
```

**404 Not Found**
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
  "message": "Wystąpił błąd podczas aktualizacji opłaty"
}
```

## 5. Przepływ danych

### Business Logic Flow
```
ChargesService.updateCharge()
    ↓
Check charge exists
    ├─ RLS filters by owner access
    ├─ Not found → return 404/403
    └─ Found → continue
    ↓
Update charge (partial update)
    ↓
DB Trigger: check_charge_edit_constraints()
    ├─ Check if payment_status = 'paid' → EXCEPTION
    ├─ Check if new amount < total_paid → EXCEPTION
    └─ Validation passed → UPDATE
    ↓
Fetch updated charge from charges_with_status
    ↓
Generate signed URL for attachment
    ↓
Return updated charge
```

### Database Interactions

**Query 1: Update charge**
```sql
UPDATE charges
SET
  amount = COALESCE(:amount, amount),
  due_date = COALESCE(:dueDate, due_date),
  type = COALESCE(:type, type),
  comment = COALESCE(:comment, comment)
WHERE id = :chargeId
RETURNING id;
-- RLS policy validates owner access
-- Trigger check_charge_edit_constraints validates business rules
```

**Query 2: Fetch updated charge**
```sql
SELECT *
FROM charges_with_status
WHERE id = :chargeId;
```

## 6. Względy bezpieczeństwa

### Authorization
- **Owner-only:** Tylko właściciel może edytować
- **RLS Policy:** UPDATE policy weryfikuje ownership
- **Role check:** user.role === 'owner'

### Business Rules (DB Triggers)
- **Cannot edit paid charges:** Trigger sprawdza payment_status
- **Amount validation:** Trigger sprawdza czy amount >= total_paid

### Input Validation
- Partial update - wszystkie pola opcjonalne
- Validation via Zod schema

## 7. Obsługa błędów

### Trigger Errors (400)
```typescript
// DB trigger throws exception
catch (error: any) {
  if (error.message?.includes('Cannot edit a fully paid charge')) {
    return new Response(JSON.stringify({
      error: 'Bad Request',
      message: 'Nie można edytować w pełni opłaconej opłaty'
    }), { status: 400 });
  }

  if (error.message?.includes('cannot be less than total payments')) {
    // Extract amount from error message
    const match = error.message.match(/\(([0-9.]+)\)/);
    const totalPaid = match ? match[1] : '';
    return new Response(JSON.stringify({
      error: 'Bad Request',
      message: `Kwota opłaty nie może być niższa niż suma dokonanych wpłat (${totalPaid} zł)`
    }), { status: 400 });
  }
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje
- Partial update - tylko zmienione pola
- Single transaction dla UPDATE + fetch

### Monitorowanie
- Logować częstość trigger errors (business rule violations)

## 9. Etapy wdrożenia

### Krok 1: Zod schema
```typescript
export const updateChargeSchema = z.object({
  amount: z.number()
    .positive({ message: 'Kwota musi być większa od 0' })
    .multipleOf(0.01)
    .max(999999.99)
    .optional(),
  due_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  type: z.enum(['rent', 'bill', 'other']).optional(),
  comment: z.string().max(300).optional().nullable()
}).refine(data => Object.keys(data).length > 0, {
  message: 'Należy podać przynajmniej jedno pole do aktualizacji'
});
```

### Krok 2: Service method
```typescript
async updateCharge(
  chargeId: string,
  data: UpdateChargeCommand
): Promise<ChargeListItemDTO> {
  // Build update object (only provided fields)
  const updateData: any = {};
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.due_date !== undefined) updateData.due_date = data.due_date;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.comment !== undefined) updateData.comment = data.comment;

  // Update charge
  const { error: updateError } = await this.supabase
    .from('charges')
    .update(updateData)
    .eq('id', chargeId);

  if (updateError) {
    console.error('Error updating charge:', updateError);

    // Check for business rule violations
    if (updateError.message?.includes('Cannot edit a fully paid charge')) {
      throw new Error('CHARGE_FULLY_PAID');
    }
    if (updateError.message?.includes('cannot be less than total payments')) {
      throw new Error('AMOUNT_TOO_LOW');
    }

    throw new Error('DATABASE_ERROR');
  }

  // Fetch updated charge
  const { data: updatedCharge, error: fetchError } = await this.supabase
    .from('charges_with_status')
    .select('*')
    .eq('id', chargeId)
    .single();

  if (fetchError || !updatedCharge) {
    throw new Error('CHARGE_NOT_FOUND');
  }

  // Generate signed URL
  let attachment_url = null;
  if (updatedCharge.attachment_path) {
    const { data: signedUrl } = await this.supabase.storage
      .from('charge-attachments')
      .createSignedUrl(updatedCharge.attachment_path, 3600);
    if (signedUrl) attachment_url = signedUrl.signedUrl;
  }

  const { created_by, lease_id, ...chargeDto } = updatedCharge;
  return { ...chargeDto, attachment_url } as ChargeListItemDTO;
}
```

### Krok 3: API route handler (PATCH)
```typescript
export async function PATCH(context: APIContext): Promise<Response> {
  // ... auth checks ...
  // ... parse and validate body ...

  try {
    const chargesService = new ChargesService(supabase);
    const result = await chargesService.updateCharge(chargeId, validatedData);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    if (error.message === 'CHARGE_FULLY_PAID') {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'Nie można edytować w pełni opłaconej opłaty'
      }), { status: 400 });
    }

    if (error.message === 'AMOUNT_TOO_LOW') {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'Kwota opłaty nie może być niższa niż suma dokonanych wpłat'
      }), { status: 400 });
    }

    // ... other error handling ...
  }
}
```
