# API Endpoint Implementation Plan: DELETE /api/apartments/:id/protocols/:type/photos/:photoId

## 1. Przegląd punktu końcowego

Endpoint służy do usuwania zdjęcia z protokołu (odbioru lub zwrotu). Usuwa zarówno rekord z bazy danych jak i plik z Supabase Storage. Dostęp ma tylko właściciel mieszkania. Po pomyślnym usunięciu zwraca status 204 No Content.

## 2. Szczegóły żądania

- **Metoda HTTP:** DELETE
- **Struktura URL:** `/api/apartments/:id/protocols/:type/photos/:photoId`
- **Parametry:**
  - **Wymagane (path params):**
    - `id` (string, UUID) - ID mieszkania
    - `type` (string, enum: "move_in" | "move_out") - typ protokołu
    - `photoId` (string, UUID) - ID zdjęcia do usunięcia
  - **Opcjonalne:** Brak
- **Request Body:** Brak (DELETE request)
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagane)

## 3. Wykorzystywane typy

### DTOs (Response)
Brak - endpoint zwraca 204 No Content (empty body)

### Database Types
```typescript
// z src/db/database.types.ts
Tables<'protocol_photos'> // for SELECT and DELETE
Enums<'protocol_type'> // "move_in" | "move_out"
```

## 4. Szczegóły odpowiedzi

### Response 204 (No Content)
Empty body - successful deletion

### Error 400 (Bad Request)
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowy identyfikator zdjęcia"
}
```

### Error 401 (Unauthorized)
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

### Error 403 (Forbidden)
```json
{
  "error": "Forbidden",
  "message": "Nie masz uprawnień do usunięcia tego zdjęcia"
}
```

### Error 404 (Not Found)
```json
{
  "error": "Not Found",
  "message": "Zdjęcie nie zostało znalezione"
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

### Krok 1: Walidacja parametrów
1. Walidacja `id` (apartment ID) jako UUID
2. Walidacja `type` jako enum (`move_in` | `move_out`)
3. Walidacja `photoId` jako UUID
4. Sprawdzenie autoryzacji użytkownika (JWT)

### Krok 2: Pobranie informacji o zdjęciu
```sql
SELECT pp.*, p.lease_id
FROM protocol_photos pp
JOIN protocols p ON p.id = pp.protocol_id
WHERE pp.id = :photo_id
```
- Pobranie `file_path` (potrzebne do usunięcia z storage)
- Pobranie `protocol_id` (weryfikacja)
- Pobranie `lease_id` (dla weryfikacji ownership)
- Jeśli brak rekordu → return 404

### Krok 3: Weryfikacja ownership (via RLS lub explicit)
1. RLS automatycznie zweryfikuje dostęp podczas SELECT
2. Dodatkowo można zweryfikować że protocol należy do właściciela
3. Sprawdzenie user role (owner only)

### Krok 4: Usunięcie z bazy danych
```sql
DELETE FROM protocol_photos
WHERE id = :photo_id
```
- RLS automatycznie weryfikuje dostęp
- Database cascade: brak (protocol_photos nie ma child records)

### Krok 5: Usunięcie z Supabase Storage
```typescript
const { error } = await supabase.storage
  .from('protocol-photos')
  .remove([file_path]);
```
- Storage RLS automatycznie weryfikuje dostęp właściciela
- Jeśli storage deletion failed → log error (ale kontynuuj, DB już usunięte)

### Krok 6: Response
- Return 204 No Content (empty body)

## 6. Względy bezpieczeństwa

### Autoryzacja (RLS)
- **Owner only:** Tylko właściciel mieszkania może usuwać zdjęcia
- **Chain verification:** RLS weryfikuje ownership przez: photo → protocol → lease → apartment → owner
- **Storage RLS:** Bucket `protocol-photos` ma policies dla owner delete

### Walidacja danych
- **UUID validation:** Wszystkie IDs muszą być poprawnymi UUID
- **Protocol type validation:** Typ musi być `move_in` lub `move_out`
- **SQL Injection:** Prepared statements (Supabase auto-handles)

### Deletion Safety
- **Atomic operations:** DELETE z RLS zapewnia że tylko authorized user może usunąć
- **Cascade consideration:** Brak child records dla protocol_photos (bezpieczne usunięcie)
- **Storage cleanup:** Ważne aby usunąć plik z storage (nie zostawiać orphaned files)

### Edge Cases
- **Photo already deleted:** Jeśli photo nie istnieje → 404
- **Storage delete fails:** DB już usunięte, log error ale zwróć 204 (eventual consistency)
- **Concurrent deletions:** UUID uniqueness zapobiega race conditions

### Logging
- Loguj successful deletions (audit trail)
- Loguj failed storage deletions (orphaned files monitoring)
- Loguj unauthorized attempts (403)
- NIE loguj file paths w public logs (security)

## 7. Obsługa błędów

### Błędy walidacji (400)
- **Invalid apartment ID:** Nieprawidłowy format UUID
- **Invalid protocol type:** Typ nie jest `move_in` ani `move_out`
- **Invalid photo ID:** Nieprawidłowy format UUID
- **Handling:** Zwróć 400 z descriptive message

### Błędy autoryzacji (401)
- **Missing JWT:** Brak tokena w Authorization header
- **Invalid JWT:** Token wygasł lub nieprawidłowy
- **Handling:** Zwróć 401 z komunikatem "Brak autoryzacji"

### Błędy dostępu (403)
- **RLS violation:** User nie jest właścicielem
- **Non-owner attempt:** User nie ma uprawnień do usunięcia
- **Storage RLS rejection:** Storage policies odrzuciły deletion
- **Handling:** Zwróć 403 z komunikatem "Nie masz uprawnień do usunięcia tego zdjęcia"

### Błędy nie znalezienia zasobu (404)
- **Photo not found:** Zdjęcie nie istnieje
- **Protocol not found:** Protokół nie istnieje (nie powinno się zdarzyć jeśli photo exists)
- **Apartment not found:** Mieszkanie nie istnieje (nie powinno się zdarzyć)
- **Handling:** Zwróć 404 z komunikatem "Zdjęcie nie zostało znalezione"

### Błędy Storage (500)
- **Storage delete failed:** Błąd usunięcia z Supabase Storage
- **Storage connection error:** Błąd połączenia
- **Handling:**
  - Log full error (orphaned file warning)
  - **Continue with 204** (DB already deleted, eventual consistency acceptable)
  - Alternative: Return 500 jeśli storage delete is critical

### Błędy bazy danych (500)
- **Database connection error**
- **DELETE query failed**
- **Handling:** Log error, return 500

### Error handling order
1. Najpierw usuń z DB (atomic, transactional)
2. Potem usuń z Storage (może failed, ale to acceptable)
3. Jeśli DB delete failed → return error, nie próbuj storage delete
4. Jeśli DB delete succeeded, ale storage failed → log warning, return 204

## 8. Rozważania dotyczące wydajności

### Query optimization
- **Single query fetch:** Pobierz photo z JOINem do protocol (1 query)
- **Index usage:** Już istnieją:
  - `idx_protocol_photos_protocol_id` - szybkie wyszukiwanie
  - Primary key index na `id` - instant lookup

### Deletion performance
- **Database DELETE:** Very fast (single row by PK)
- **Storage DELETE:** May take longer (network call)
  - Timeout: Set reasonable timeout (5s)
  - Async consideration: Można rozważyć async storage delete (background job)

### Concurrent deletions
- **Race conditions:** UUID PK eliminuje conflicts
- **Idempotency:** Second DELETE na już usuniętym photo → 404 (expected)

### Caching
- **MVP:** Brak cachingu
- **Future:** Invalidate protocol cache on photo delete

### Monitoring
- **Orphaned files:** Monitor storage dla files bez DB records
- **Cleanup job:** Periodic job do usuwania orphaned files (future)

## 9. Etapy wdrożenia

### Etap 1: Struktura pliku API route
1. Utwórz plik: `src/pages/api/apartments/[id]/protocols/[type]/photos/[photoId].ts`
2. Dodaj `export const prerender = false`
3. Zaimplementuj handler `DELETE`
4. Pobierz `supabase` z `context.locals`

### Etap 2: Walidacja parametrów
1. Utwórz Zod schema dla path params:
```typescript
const paramsSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['move_in', 'move_out']),
  photoId: z.string().uuid()
});
```
2. Waliduj parametry z `context.params`
3. Return 400 jeśli walidacja failed

### Etap 3: Autoryzacja
1. Pobierz user z `context.locals.user`
2. Jeśli brak user → return 401
3. Sprawdź role (owner only):
```typescript
const { data: userData } = await supabase
  .from('users')
  .select('role')
  .eq('id', user.id)
  .single();

if (userData?.role !== 'owner') {
  return 403;
}
```

### Etap 4: Service - Pobranie informacji o zdjęciu
1. Rozszerz `src/lib/services/protocolService.ts`
2. Implementuj `getProtocolPhotoForDeletion`:
```typescript
export async function getProtocolPhotoForDeletion(
  supabase: SupabaseClient,
  photoId: string
): Promise<{ file_path: string; protocol_id: string } | null> {
  const { data, error } = await supabase
    .from('protocol_photos')
    .select('file_path, protocol_id')
    .eq('id', photoId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching photo for deletion:', error);
    return null;
  }

  return data;
}
```
3. RLS automatycznie weryfikuje ownership

### Etap 5: Usunięcie z bazy danych
1. Implementuj `deleteProtocolPhotoRecord`:
```typescript
export async function deleteProtocolPhotoRecord(
  supabase: SupabaseClient,
  photoId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('protocol_photos')
    .delete()
    .eq('id', photoId);

  if (error) {
    // Check if it's RLS violation
    if (error.message.includes('row-level security')) {
      throw new Error('FORBIDDEN');
    }
    throw error;
  }

  return true;
}
```

### Etap 6: Usunięcie z Storage
1. Implementuj `deleteProtocolPhotoFromStorage`:
```typescript
export async function deleteProtocolPhotoFromStorage(
  supabase: SupabaseClient,
  filePath: string
): Promise<void> {
  const { error } = await supabase.storage
    .from('protocol-photos')
    .remove([filePath]);

  if (error) {
    // Log but don't throw - eventual consistency acceptable
    console.error('Failed to delete photo from storage:', filePath, error);
    console.warn('Photo deleted from DB but orphaned in storage - manual cleanup may be needed');
  }
}
```

### Etap 7: Orchestration w API handler
```typescript
// In API handler:
try {
  // ... validation and auth ...

  // 1. Get photo info
  const photo = await getProtocolPhotoForDeletion(supabase, photoId);

  if (!photo) {
    return new Response(
      JSON.stringify({
        error: 'Not Found',
        message: 'Zdjęcie nie zostało znalezione'
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. Delete from database (atomic)
  await deleteProtocolPhotoRecord(supabase, photoId);

  // 3. Delete from storage (best effort)
  await deleteProtocolPhotoFromStorage(supabase, photo.file_path);

  // 4. Return success
  return new Response(null, { status: 204 });
} catch (error) {
  // Handle errors...
}
```

### Etap 8: Obsługa błędów
1. Wrap logikę w try-catch
2. Handle ZodError → 400
3. Handle FORBIDDEN error → 403
4. Handle not found → 404
5. Handle database errors → 500
6. Log wszystkie błędy z odpowiednimi levels

### Etap 9: Response
1. Return 204 No Content:
```typescript
return new Response(null, { status: 204 });
```
2. **Note:** 204 response NIE może mieć body (per HTTP spec)

### Etap 10: Testy
1. **Unit tests** dla serwisu:
   - Test successful photo fetch
   - Test photo not found
   - Test successful DB deletion
   - Test successful storage deletion
   - Test storage deletion failure (doesn't break flow)
2. **Integration tests** dla endpoint:
   - Test owner can delete photo (204)
   - Test tenant cannot delete (403)
   - Test unauthorized (401)
   - Test photo not found (404)
   - Test invalid photo ID (400)
   - Test photo is actually deleted from DB
   - Test file is deleted from storage
   - Test idempotency (second delete → 404)

### Etap 11: Dokumentacja
1. JSDoc dla funkcji serwisu
2. Komentarze w kodzie
3. Update API documentation

## 10. Przykładowy kod implementacji

### API Route Handler
```typescript
// src/pages/api/apartments/[id]/protocols/[type]/photos/[photoId].ts
import type { APIContext } from 'astro';
import { z } from 'zod';
import {
  getProtocolPhotoForDeletion,
  deleteProtocolPhotoRecord,
  deleteProtocolPhotoFromStorage
} from '@/lib/services/protocolService';

export const prerender = false;

const paramsSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['move_in', 'move_out']),
  photoId: z.string().uuid()
});

export async function DELETE(context: APIContext): Promise<Response> {
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

    // 2. Validate params
    const validation = paramsSchema.safeParse(context.params);
    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Nieprawidłowe parametry',
          details: validation.error.flatten()
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { id: apartmentId, type, photoId } = validation.data;
    const supabase = context.locals.supabase;

    // 3. Check user role
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'owner') {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: 'Tylko właściciele mogą usuwać zdjęcia z protokołów'
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Get photo info (verifies ownership via RLS)
    const photo = await getProtocolPhotoForDeletion(supabase, photoId);

    if (!photo) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Zdjęcie nie zostało znalezione'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Delete from database (atomic)
    await deleteProtocolPhotoRecord(supabase, photoId);

    // 6. Delete from storage (best effort)
    await deleteProtocolPhotoFromStorage(supabase, photo.file_path);

    // 7. Return success (204 No Content)
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/apartments/:id/protocols/:type/photos/:photoId error:', error);

    // Check for RLS/Forbidden error
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: 'Nie masz uprawnień do usunięcia tego zdjęcia'
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

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

### Service Implementation (additions)
```typescript
// src/lib/services/protocolService.ts

export async function getProtocolPhotoForDeletion(
  supabase: SupabaseClient,
  photoId: string
): Promise<{ file_path: string; protocol_id: string } | null> {
  const { data, error } = await supabase
    .from('protocol_photos')
    .select('file_path, protocol_id')
    .eq('id', photoId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching photo for deletion:', error);
    return null;
  }

  return data;
}

export async function deleteProtocolPhotoRecord(
  supabase: SupabaseClient,
  photoId: string
): Promise<void> {
  const { error } = await supabase
    .from('protocol_photos')
    .delete()
    .eq('id', photoId);

  if (error) {
    // Check if it's RLS violation
    if (error.message && error.message.includes('row-level security')) {
      throw new Error('FORBIDDEN');
    }

    console.error('Error deleting photo from database:', error);
    throw new Error(`Database deletion failed: ${error.message}`);
  }
}

export async function deleteProtocolPhotoFromStorage(
  supabase: SupabaseClient,
  filePath: string
): Promise<void> {
  const { error } = await supabase.storage
    .from('protocol-photos')
    .remove([filePath]);

  if (error) {
    // Log but don't throw - eventual consistency acceptable
    console.error('Failed to delete photo from storage:', filePath, error);
    console.warn(
      'Photo deleted from DB but orphaned in storage:',
      filePath,
      '- manual cleanup may be needed'
    );

    // Optional: Send to monitoring/alerting system
    // monitoringService.logOrphanedFile(filePath);
  } else {
    console.log('Successfully deleted photo from storage:', filePath);
  }
}
```

## 11. Checklisty

### Pre-Implementation Checklist
- [ ] Zapoznanie z API plan (sekcja 4.7)
- [ ] Zapoznanie z DB plan (protocol_photos table)
- [ ] Zapoznanie z Storage RLS policies (delete)
- [ ] Weryfikacja cascade behaviors
- [ ] Zrozumienie HTTP 204 No Content semantics

### Implementation Checklist
- [ ] Utworzenie pliku API route
- [ ] Implementacja walidacji parametrów (Zod)
- [ ] Implementacja autoryzacji (user + role check)
- [ ] Implementacja pobierania info o zdjęciu
- [ ] Implementacja usunięcia z bazy danych
- [ ] Implementacja usunięcia z storage
- [ ] Implementacja proper error handling order
- [ ] Implementacja logging (audit trail)
- [ ] Implementacja obsługi błędów
- [ ] Return 204 (empty body)
- [ ] Testy jednostkowe
- [ ] Testy integracyjne

### Testing Checklist
- [ ] Test: Owner może usunąć zdjęcie (204)
- [ ] Test: Tenant nie może usunąć (403)
- [ ] Test: Unauthorized (401)
- [ ] Test: Zdjęcie nie istnieje (404)
- [ ] Test: Invalid photo ID (400)
- [ ] Test: Zdjęcie jest usunięte z DB
- [ ] Test: Plik jest usunięty z storage
- [ ] Test: Drugie DELETE na tym samym photo → 404 (idempotency check)
- [ ] Test: Storage delete failure doesn't break flow (204 still returned)
- [ ] Test: RLS policies działają poprawnie
- [ ] Test: Response body jest pusty (204 spec compliance)

### Post-Implementation Checklist
- [ ] Code review
- [ ] Security audit (RLS verification)
- [ ] Orphaned files monitoring setup
- [ ] JSDoc documentation
- [ ] Update API docs
- [ ] Deployment staging
- [ ] Manual delete testing
- [ ] Verify storage cleanup
- [ ] Performance test
- [ ] Production deployment

### Monitoring & Maintenance
- [ ] Setup alerting dla orphaned files
- [ ] Create cleanup job dla orphaned files (future)
- [ ] Monitor deletion success rate
- [ ] Track storage vs DB consistency
