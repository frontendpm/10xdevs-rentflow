# API Endpoint Implementation Plan: DELETE /api/charges/:id

## 1. Przegląd punktu końcowego

**Endpoint:** `DELETE /api/charges/:id`

**Cel:** Usunięcie opłaty (tylko właściciel).

**Funkcjonalność:**
- Usuwa opłatę wraz ze wszystkimi powiązanymi wpłatami (CASCADE)
- Usuwa załącznik z Supabase Storage (jeśli istnieje)
- **Reguła biznesowa:** Nie można usunąć w pełni opłaconej opłaty
- Tylko właściciel może usuwać opłaty

## 2. Szczegóły żądania

### HTTP Method
`DELETE`

### URL Structure
```
/api/charges/:id
```

### Path Parameters
- `id` (required): UUID - ID opłaty

### Headers
```
Authorization: Bearer <jwt-token>
```

### Request Body
Brak

## 3. Wykorzystywane typy

Brak szczególnych DTOs - endpoint zwraca status 204 (No Content) bez body.

## 4. Szczegóły odpowiedzi

### Success Response (204 No Content)
Brak body, tylko status code 204.

### Error Responses

**400 Bad Request** - Opłata w pełni opłacona
```json
{
  "error": "Bad Request",
  "message": "Nie można usunąć w pełni opłaconej opłaty"
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
  "message": "Nie masz uprawnień do usunięcia tej opłaty"
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
  "message": "Wystąpił błąd podczas usuwania opłaty"
}
```

## 5. Przepływ danych

### Business Logic Flow
```
ChargesService.deleteCharge()
    ↓
Fetch charge to verify access and get attachment_path
    ├─ RLS filters by owner access
    ├─ Not found → return 404/403
    └─ Found → continue
    ↓
Check payment_status
    ├─ payment_status = 'paid' → throw error (business rule)
    └─ Not fully paid → continue
    ↓
Delete attachment from Storage (if exists)
    ├─ Delete file from 'charge-attachments' bucket
    └─ Continue even if fails (log warning)
    ↓
Delete charge from database
    ├─ CASCADE deletes all payments
    └─ RLS validates owner access
    ↓
Return 204 No Content
```

### Database Interactions

**Query 1: Fetch charge (verify access & get attachment_path)**
```sql
SELECT id, attachment_path, payment_status
FROM charges_with_status
WHERE id = :chargeId;
-- RLS filters by owner access
```

**Query 2: Delete charge**
```sql
DELETE FROM charges
WHERE id = :chargeId;
-- RLS policy validates owner access
-- CASCADE automatically deletes all payments
```

## 6. Względy bezpieczeństwa

### Authorization
- **Owner-only:** Tylko właściciel może usuwać
- **RLS Policy:** DELETE policy weryfikuje ownership

### Business Rules
- **Cannot delete paid charges:** Sprawdzane na poziomie aplikacji przed DELETE
- **Cascade deletes:** Payments są usuwane automatycznie przez ON DELETE CASCADE

### Storage Cleanup
- Attachment jest usuwany z Storage przed usunięciem z DB
- Jeśli Storage delete fails, operation continues (only log warning)

## 7. Obsługa błędów

### Business Rule Violation (400)
```typescript
if (charge.payment_status === 'paid') {
  throw new Error('CANNOT_DELETE_PAID_CHARGE');
}
```

### Storage Errors
```typescript
// Non-blocking - log warning if Storage delete fails
if (deleteError) {
  console.warn(`Failed to delete attachment for charge ${chargeId}:`, deleteError);
  // Continue with DB delete
}
```

### Database Errors (500)
```typescript
catch (error) {
  console.error('Error deleting charge:', error);
  throw new Error('DATABASE_ERROR');
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje
- Single query to verify & get attachment_path
- CASCADE delete handles payments automatically (no manual cleanup)

### Storage Cleanup
- Delete attachment before DB delete (order matters)
- Non-blocking approach - don't fail entire operation if Storage delete fails

### Monitorowanie
- Log failed Storage deletions
- Monitor orphaned files in Storage

## 9. Etapy wdrożenia

### Krok 1: Service method
```typescript
async deleteCharge(chargeId: string): Promise<void> {
  // 1. Fetch charge to verify access and get attachment_path
  const { data: charge, error: fetchError } = await this.supabase
    .from('charges_with_status')
    .select('id, attachment_path, payment_status')
    .eq('id', chargeId)
    .single();

  if (fetchError || !charge) {
    throw new Error('CHARGE_NOT_FOUND');
  }

  // 2. Business rule: cannot delete fully paid charge
  if (charge.payment_status === 'paid') {
    throw new Error('CANNOT_DELETE_PAID_CHARGE');
  }

  // 3. Delete attachment from Storage (if exists)
  if (charge.attachment_path) {
    const { error: deleteStorageError } = await this.supabase.storage
      .from('charge-attachments')
      .remove([charge.attachment_path]);

    if (deleteStorageError) {
      console.warn(
        `Failed to delete attachment for charge ${chargeId}:`,
        deleteStorageError
      );
      // Continue with DB delete even if Storage delete fails
    }
  }

  // 4. Delete charge (CASCADE deletes payments)
  const { error: deleteError } = await this.supabase
    .from('charges')
    .delete()
    .eq('id', chargeId);

  if (deleteError) {
    console.error('Error deleting charge:', deleteError);
    throw new Error('DATABASE_ERROR');
  }

  // Success - no return value (204 No Content)
}
```

### Krok 2: API route handler (DELETE)
**Plik:** `src/pages/api/charges/[id].ts` (dodać do istniejącego pliku)

```typescript
export async function DELETE(context: APIContext): Promise<Response> {
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

  // 2. Check if user is owner
  if (user.role !== 'owner') {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Tylko właściciele mogą usuwać opłaty'
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 3. Validate chargeId
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

  // 4. Call service
  try {
    const chargesService = new ChargesService(supabase);
    await chargesService.deleteCharge(chargeId);

    // Success - 204 No Content
    return new Response(null, { status: 204 });

  } catch (error: any) {
    console.error('Error in DELETE /api/charges/:id:', error);

    if (error.message === 'CHARGE_NOT_FOUND') {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Opłata nie została znaleziona'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (error.message === 'CANNOT_DELETE_PAID_CHARGE') {
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'Nie można usunąć w pełni opłaconej opłaty'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Wystąpił błąd podczas usuwania opłaty'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### Krok 3: Testowanie
1. **Unit tests:** ChargesService.deleteCharge()
   - Test successful deletion
   - Test cannot delete paid charge
   - Test charge not found
   - Test Storage cleanup
2. **Integration tests:** API endpoint
3. **E2E tests:** Full delete flow

### Krok 4: Monitoring & Cleanup
- Implementować periodic job do czyszczenia orphaned files w Storage
- Monitor metrics: deleted charges, failed Storage cleanups
