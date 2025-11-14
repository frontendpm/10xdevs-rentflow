# API Endpoint Implementation Plan: DELETE /api/charges/:id/attachment

## 1. Przegląd punktu końcowego

**Endpoint:** `DELETE /api/charges/:id/attachment`

**Cel:** Usunięcie załącznika z opłaty (tylko właściciel).

**Funkcjonalność:**
- Usuwa plik z Supabase Storage
- Ustawia `attachment_path` na `null` w tabeli `charges`
- Tylko właściciel może usuwać załączniki
- Endpoint zwraca 204 (No Content) po sukcesie

## 2. Szczegóły żądania

### HTTP Method
`DELETE`

### URL Structure
```
/api/charges/:id/attachment
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

Brak szczególnych DTOs - endpoint zwraca status 204 (No Content).

## 4. Szczegóły odpowiedzi

### Success Response (204 No Content)
Brak body, tylko status code 204.

### Error Responses

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
  "message": "Nie masz uprawnień do usunięcia załącznika tej opłaty"
}
```

**404 Not Found** - Opłata nie istnieje
```json
{
  "error": "Not Found",
  "message": "Opłata nie została znaleziona"
}
```

**404 Not Found** - Brak załącznika
```json
{
  "error": "Not Found",
  "message": "Brak załącznika do usunięcia"
}
```

**500 Internal Server Error**
```json
{
  "error": "Internal Server Error",
  "message": "Wystąpił błąd podczas usuwania załącznika"
}
```

## 5. Przepływ danych

### Business Logic Flow
```
ChargesService.deleteAttachment()
    ↓
Fetch charge to verify access and get attachment_path
    ├─ RLS filters by owner access
    ├─ Not found → return 404/403
    └─ Found → continue
    ↓
Check if attachment_path exists
    ├─ No attachment → return 404
    └─ Attachment exists → continue
    ↓
Delete file from Supabase Storage
    ├─ RLS on storage.objects validates access
    └─ Delete failed → log warning, continue
    ↓
Update charge: set attachment_path = null
    ↓
Return 204 No Content
```

### Database Interactions

**Query 1: Fetch charge**
```sql
SELECT id, attachment_path
FROM charges
WHERE id = :chargeId;
-- RLS filters by owner access
```

**Query 2: Update charge**
```sql
UPDATE charges
SET attachment_path = NULL
WHERE id = :chargeId;
-- RLS validates owner access
```

### Storage Interactions

```typescript
await supabase.storage
  .from('charge-attachments')
  .remove([attachment_path]);
// RLS on storage.objects validates DELETE access
```

## 6. Względy bezpieczeństwa

### Authorization
- **Owner-only:** Tylko właściciel może usuwać załączniki
- **RLS on charges:** UPDATE policy weryfikuje ownership
- **RLS on storage.objects:** DELETE policy weryfikuje ownership

### Error Handling
- **404 if no attachment:** Informujemy użytkownika że brak załącznika
- **Non-blocking Storage delete:** Jeśli Storage delete fails, kontynuujemy z DB update

## 7. Obsługa błędów

### Missing Attachment (404)
```typescript
if (!charge.attachment_path) {
  throw new Error('NO_ATTACHMENT');
}
```

### Storage Errors
```typescript
// Non-critical - log warning if Storage delete fails
if (deleteError) {
  console.warn(`Failed to delete attachment from Storage:`, deleteError);
  // Continue with DB update
}
```

### Database Errors (500)
```typescript
if (updateError) {
  console.error('Error updating charge:', updateError);
  throw new Error('DATABASE_ERROR');
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje
- Single query to fetch and verify
- Non-blocking Storage delete (continue even if fails)

### Cleanup Strategy
- Delete from Storage first, then update DB
- If Storage delete fails, still update DB to null (prevents orphaned records)

### Monitorowanie
- Log failed Storage deletions
- Periodic cleanup job for orphaned files

## 9. Etapy wdrożenia

### Krok 1: Service method
**Plik:** `src/lib/services/charges.service.ts`

```typescript
async deleteAttachment(chargeId: string): Promise<void> {
  // 1. Fetch charge to verify access and get attachment_path
  const { data: charge, error: fetchError } = await this.supabase
    .from('charges')
    .select('id, attachment_path')
    .eq('id', chargeId)
    .single();

  if (fetchError || !charge) {
    throw new Error('CHARGE_NOT_FOUND');
  }

  // 2. Check if attachment exists
  if (!charge.attachment_path) {
    throw new Error('NO_ATTACHMENT');
  }

  // 3. Delete file from Storage
  const { error: deleteStorageError } = await this.supabase.storage
    .from('charge-attachments')
    .remove([charge.attachment_path]);

  if (deleteStorageError) {
    console.warn(
      `Failed to delete attachment from Storage for charge ${chargeId}:`,
      deleteStorageError
    );
    // Continue with DB update even if Storage delete fails
  }

  // 4. Update charge: set attachment_path to null
  const { error: updateError } = await this.supabase
    .from('charges')
    .update({ attachment_path: null })
    .eq('id', chargeId);

  if (updateError) {
    console.error('Error updating charge:', updateError);
    throw new Error('DATABASE_ERROR');
  }

  // Success - no return value (204 No Content)
}
```

### Krok 2: API route handler
**Plik:** `src/pages/api/charges/[id]/attachment.ts` (dodać do istniejącego pliku)

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
        message: 'Tylko właściciele mogą usuwać załączniki'
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
    await chargesService.deleteAttachment(chargeId);

    // Success - 204 No Content
    return new Response(null, { status: 204 });

  } catch (error: any) {
    console.error('Error in DELETE /api/charges/:id/attachment:', error);

    if (error.message === 'CHARGE_NOT_FOUND') {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Opłata nie została znaleziona'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (error.message === 'NO_ATTACHMENT') {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Brak załącznika do usunięcia'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Wystąpił błąd podczas usuwania załącznika'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### Krok 3: Kompletny plik attachment.ts
**Plik:** `src/pages/api/charges/[id]/attachment.ts`

```typescript
import type { APIContext } from 'astro';
import { ChargesService } from '@/lib/services/charges.service';

export const prerender = false;

/**
 * POST /api/charges/:id/attachment
 * Upload attachment to charge
 */
export async function POST(context: APIContext): Promise<Response> {
  // ... (implementation from previous plan)
}

/**
 * DELETE /api/charges/:id/attachment
 * Delete attachment from charge
 */
export async function DELETE(context: APIContext): Promise<Response> {
  // ... (implementation above)
}
```

### Krok 4: Testowanie
1. **Unit tests:** ChargesService.deleteAttachment()
   - Test successful deletion
   - Test no attachment (404)
   - Test charge not found
   - Test Storage cleanup
2. **Integration tests:** API endpoint
3. **E2E tests:** Upload then delete attachment

### Krok 5: Monitoring & Cleanup
- Implementować periodic cleanup job dla orphaned files
- Monitor metrics: deleted attachments, failed Storage cleanups
- Log Storage usage trends per apartment

## 10. Dodatkowe uwagi

### Kolejność operacji
1. **Delete from Storage first** - zapobiega orphaned records w DB
2. **Update DB second** - nawet jeśli Storage delete fails, DB jest spójne

### Idempotency
- Wywołanie DELETE na opłacie bez załącznika zwraca 404 (nie 204)
- To informuje użytkownika że nie było co usuwać

### Rollback Strategy
- Jeśli DB update fails po Storage delete, plik pozostaje usunięty
- Akceptowalne - plik był do usunięcia anyway
- Periodic cleanup job posprząta orphaned files
