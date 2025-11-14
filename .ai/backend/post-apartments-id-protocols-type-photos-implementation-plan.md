# API Endpoint Implementation Plan: POST /api/apartments/:id/protocols/:type/photos

## 1. Przegląd punktu końcowego

Endpoint służy do uploadowania zdjęcia do protokołu (odbioru lub zwrotu) dla aktywnego najmu mieszkania. Obsługuje multipart/form-data, waliduje typ i rozmiar pliku, sprawdza limit zdjęć (max 10 per protokół) oraz zapisuje plik w Supabase Storage. Dostęp ma tylko właściciel mieszkania.

## 2. Szczegóły żądania

- **Metoda HTTP:** POST
- **Struktura URL:** `/api/apartments/:id/protocols/:type/photos`
- **Parametry:**
  - **Wymagane (path params):**
    - `id` (string, UUID) - ID mieszkania
    - `type` (string, enum: "move_in" | "move_out") - typ protokołu
  - **Opcjonalne:** Brak
- **Request Body:** multipart/form-data
  - **field:** `file` (File object)
  - **MIME types:** image/jpeg, image/png
  - **Max size:** 5MB
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagane)
  - `Content-Type: multipart/form-data` (wymagane)

## 3. Wykorzystywane typy

### DTOs (Response)
```typescript
// z src/types.ts
export type UploadProtocolPhotoResponseDTO = ProtocolPhotoDTO;

export type ProtocolPhotoDTO = Omit<Tables<'protocol_photos'>, 'created_by'> & {
  file_url: string;
};
```

### Database Types
```typescript
// z src/db/database.types.ts
TablesInsert<'protocol_photos'> // for INSERT
Enums<'protocol_type'> // "move_in" | "move_out"
```

## 4. Szczegóły odpowiedzi

### Response 201 (Created)
```json
{
  "id": "uuid",
  "protocol_id": "uuid",
  "file_path": "apartment-uuid/protocol-uuid/photo1.jpg",
  "file_url": "https://storage.supabase.co/...",
  "uploaded_at": "2025-01-12T10:00:00Z"
}
```

### Error 400 (Bad Request - Invalid File Type)
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowy format pliku. Dozwolone: JPG, PNG"
}
```

### Error 400 (Bad Request - Limit Reached)
```json
{
  "error": "Bad Request",
  "message": "Nie można dodać więcej niż 10 zdjęć do protokołu"
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
  "message": "Tylko właściciele mogą dodawać zdjęcia do protokołów"
}
```

### Error 404 (Not Found - Protocol Not Found)
```json
{
  "error": "Not Found",
  "message": "Protokół nie został jeszcze utworzony"
}
```

### Error 413 (Payload Too Large)
```json
{
  "error": "Payload Too Large",
  "message": "Rozmiar pliku nie może przekraczać 5MB"
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
1. Walidacja `id` jako UUID
2. Walidacja `type` jako enum (`move_in` | `move_out`)
3. Sprawdzenie autoryzacji użytkownika (JWT)

### Krok 2: Parsowanie multipart/form-data
1. Wyciągnij plik z form data field `file`
2. Jeśli brak pliku → return 400

### Krok 3: Walidacja pliku
1. **MIME type check:** Sprawdź czy file.type === 'image/jpeg' || 'image/png'
2. **Size check:** Sprawdź czy file.size <= 5MB (5 * 1024 * 1024 bytes)
3. Jeśli walidacja failed → return 400 lub 413

### Krok 4: Weryfikacja protokołu
1. Pobierz aktywny lease dla apartment
2. Pobierz protokół dla lease i type
3. Jeśli protokół nie istnieje → return 404

### Krok 5: Sprawdzenie limitu zdjęć
```sql
SELECT COUNT(*) FROM protocol_photos
WHERE protocol_id = :protocol_id
```
- Jeśli count >= 10 → return 400 (limit reached)
- **Note:** Database trigger również wymusza ten limit

### Krok 6: Generowanie unique filename
1. Wygeneruj UUID dla zdjęcia
2. Określ rozszerzenie z MIME type:
   - image/jpeg → .jpg
   - image/png → .png
3. Konstruuj file_path: `{apartment_id}/{protocol_id}/{photo_uuid}.{ext}`

### Krok 7: Upload do Supabase Storage
```typescript
const { data: uploadData, error: uploadError } = await supabase.storage
  .from('protocol-photos')
  .upload(file_path, file, {
    contentType: file.type,
    upsert: false
  });
```
- Jeśli upload failed → return 500 (log error)

### Krok 8: Zapis do database
```sql
INSERT INTO protocol_photos (protocol_id, file_path, created_by)
VALUES (:protocol_id, :file_path, :user_id)
RETURNING *
```

### Krok 9: Generowanie signed URL
```typescript
const { data: signedUrlData } = await supabase.storage
  .from('protocol-photos')
  .createSignedUrl(file_path, 3600); // 1 hour
```

### Krok 10: Mapowanie do DTO
- Pomiń `created_by` z response
- Dodaj `file_url` z signed URL
- Return 201 z UploadProtocolPhotoResponseDTO

## 6. Względy bezpieczeństwa

### Autoryzacja (RLS)
- **Owner only:** Tylko właściciel mieszkania może uploadować zdjęcia
- **RLS policies:** Automatycznie weryfikują ownership chain
- **Storage RLS:** Bucket `protocol-photos` ma policies dla owner upload

### Walidacja pliku
- **MIME type validation:** Sprawdzaj file.type, NIE tylko rozszerzenie pliku
  - **Why:** Rozszerzenie można łatwo zmienić, MIME type jest bardziej wiarygodny
  - **Note:** MIME type też można sfałszować, ale to pierwszy poziom obrony
- **Magic bytes validation (future):** Sprawdzenie prawdziwej zawartości pliku
- **Size limit:** Strict 5MB limit zapobiega DoS

### Storage Security
- **Path structure:** `{apartment_id}/{protocol_id}/{uuid}.{ext}` zapobiega collisions
- **UUID filenames:** Zapobiega path traversal attacks
- **Upsert: false:** Zapobiega nadpisaniu istniejących plików
- **Content-Type header:** Ustawiony z file.type dla prawidłowego serving

### Business Rules
- **Max 10 photos per protocol:** Wymuszane przez database trigger + application check
- **Active lease required:** Protokół musi należeć do aktywnego najmu
- **Owner verification:** RLS + application-level check

### Logging
- Loguj failed uploads (storage errors)
- Loguj próby przekroczenia limitu zdjęć
- Loguj invalid file types
- NIE loguj file contents ani user-uploaded filenames

### Error Handling Security
- **Generic messages:** Nie ujawniaj internal paths ani storage details w error messages
- **Rate limiting:** (Supabase built-in) zapobiega abuse

## 7. Obsługa błędów

### Błędy walidacji (400)
- **Invalid apartment ID:** Nieprawidłowy format UUID
- **Invalid protocol type:** Typ nie jest `move_in` ani `move_out`
- **Missing file:** Brak pliku w form data
- **Invalid file type:** Plik nie jest JPG ani PNG
- **Photo limit reached:** Już 10 zdjęć w protokole
- **Handling:** Zwróć 400 z descriptive message

### Błędy autoryzacji (401)
- **Missing JWT:** Brak tokena
- **Invalid JWT:** Token wygasł
- **Handling:** Zwróć 401

### Błędy dostępu (403)
- **Non-owner attempt:** User nie jest właścicielem
- **RLS violation:** Storage RLS odrzuciło upload
- **Handling:** Zwróć 403

### Błędy nie znalezienia zasobu (404)
- **Protocol not found:** Protokół nie istnieje
- **No active lease:** Brak aktywnego najmu
- **Apartment not found:** Mieszkanie nie istnieje
- **Handling:** Zwróć 404 z komunikatem "Protokół nie został jeszcze utworzony"

### Błędy rozmiaru pliku (413)
- **File too large:** Plik > 5MB
- **Handling:** Zwróć 413 z komunikatem "Rozmiar pliku nie może przekraczać 5MB"

### Błędy Storage (500)
- **Upload failed:** Błąd uploadu do Supabase Storage
- **Bucket not found:** Bucket nie istnieje (configuration error)
- **Storage connection error:** Błąd połączenia
- **Handling:** Log full error, return 500 generic message

### Błędy bazy danych (500)
- **Insert failed:** Błąd zapisu do protocol_photos
- **Trigger error:** Database trigger odrzucił insert (photo limit)
- **Handling:** Log error, cleanup uploaded file (rollback), return 500

### Rollback on error
- **Important:** Jeśli upload do storage succeeded, ale insert do DB failed:
  1. Delete uploaded file from storage
  2. Log rollback action
  3. Return 500

## 8. Rozważania dotyczące wydajności

### File upload optimization
- **Streaming upload:** Use file stream zamiast buffering całego pliku w memory
- **Chunk size:** Default Supabase settings (optimized)
- **Timeout:** Set reasonable timeout (30s dla 5MB)

### Database operations
- **Single query check:** Sprawdź photo count jednym zapytaniem
- **Batch operations:** Nie dotyczy (single photo upload)
- **Indexes:** Już istnieją:
  - `idx_protocol_photos_protocol_id` - szybkie count i insert

### Concurrent uploads
- **Race conditions:** Database trigger zapobiega przekroczeniu limitu
- **UUID filenames:** Eliminują name conflicts
- **Atomic operations:** Storage upload + DB insert jako transaction (with rollback)

### Caching
- **MVP:** Brak cachingu
- **Future:** Cache photo count (invalidate on insert/delete)

### Storage performance
- **CDN:** Supabase Storage używa CDN (automatic)
- **Signed URLs:** 1h expiry (balance między security a performance)

## 9. Etapy wdrożenia

### Etap 1: Struktura pliku API route
1. Utwórz plik: `src/pages/api/apartments/[id]/protocols/[type]/photos/index.ts`
2. Dodaj `export const prerender = false`
3. Zaimplementuj handler `POST`
4. Pobierz `supabase` z `context.locals`

### Etap 2: Walidacja parametrów
1. Utwórz Zod schema dla path params:
```typescript
const paramsSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['move_in', 'move_out'])
});
```
2. Waliduj parametry
3. Return 400 jeśli failed

### Etap 3: Parsowanie multipart/form-data
1. Parse form data z request:
```typescript
const formData = await context.request.formData();
const file = formData.get('file') as File | null;

if (!file) {
  return new Response(
    JSON.stringify({
      error: 'Validation Error',
      message: 'Brak pliku do uploadu'
    }),
    { status: 400 }
  );
}
```

### Etap 4: Walidacja pliku
1. Sprawdź MIME type:
```typescript
const allowedTypes = ['image/jpeg', 'image/png'];
if (!allowedTypes.includes(file.type)) {
  return new Response(
    JSON.stringify({
      error: 'Validation Error',
      message: 'Nieprawidłowy format pliku. Dozwolone: JPG, PNG'
    }),
    { status: 400 }
  );
}
```
2. Sprawdź rozmiar:
```typescript
const maxSize = 5 * 1024 * 1024; // 5MB
if (file.size > maxSize) {
  return new Response(
    JSON.stringify({
      error: 'Payload Too Large',
      message: 'Rozmiar pliku nie może przekraczać 5MB'
    }),
    { status: 413 }
  );
}
```

### Etap 5: Autoryzacja
1. Sprawdź user i role:
```typescript
const user = context.locals.user;
if (!user) {
  return 401;
}

const { data: userData } = await supabase
  .from('users')
  .select('role')
  .eq('id', user.id)
  .single();

if (userData?.role !== 'owner') {
  return 403;
}
```

### Etap 6: Service - Weryfikacja protokołu
1. Rozszerz `src/lib/services/protocolService.ts`
2. Implementuj `getProtocolForUpload`:
```typescript
export async function getProtocolForUpload(
  supabase: SupabaseClient,
  apartmentId: string,
  type: 'move_in' | 'move_out'
): Promise<{ id: string } | null> {
  // Get active lease
  const { data: lease } = await supabase
    .from('leases')
    .select('id')
    .eq('apartment_id', apartmentId)
    .eq('status', 'active')
    .maybeSingle();

  if (!lease) return null;

  // Get protocol
  const { data: protocol } = await supabase
    .from('protocols')
    .select('id')
    .eq('lease_id', lease.id)
    .eq('type', type)
    .maybeSingle();

  return protocol;
}
```

### Etap 7: Sprawdzenie limitu zdjęć
1. Implementuj `checkPhotoLimit`:
```typescript
export async function checkPhotoLimit(
  supabase: SupabaseClient,
  protocolId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from('protocol_photos')
    .select('*', { count: 'exact', head: true })
    .eq('protocol_id', protocolId);

  if (error) throw error;
  return (count || 0) < 10;
}
```

### Etap 8: Generowanie file path
1. Implementuj helper:
```typescript
function generateFilePath(
  apartmentId: string,
  protocolId: string,
  mimeType: string
): { path: string; uuid: string } {
  const photoUuid = crypto.randomUUID();
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const path = `${apartmentId}/${protocolId}/${photoUuid}.${extension}`;

  return { path, uuid: photoUuid };
}
```

### Etap 9: Upload do Storage
1. Implementuj `uploadProtocolPhoto`:
```typescript
export async function uploadProtocolPhoto(
  supabase: SupabaseClient,
  filePath: string,
  file: File
): Promise<void> {
  const { error } = await supabase.storage
    .from('protocol-photos')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}
```

### Etap 10: Zapis do database
1. Implementuj `saveProtocolPhotoRecord`:
```typescript
export async function saveProtocolPhotoRecord(
  supabase: SupabaseClient,
  protocolId: string,
  filePath: string,
  userId: string
): Promise<any> {
  const { data, error } = await supabase
    .from('protocol_photos')
    .insert({
      protocol_id: protocolId,
      file_path: filePath,
      created_by: userId
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Database insert failed: ${error.message}`);
  }

  return data;
}
```

### Etap 11: Rollback on failure
1. Implementuj cleanup funkcję:
```typescript
async function cleanupUploadedFile(
  supabase: SupabaseClient,
  filePath: string
): Promise<void> {
  try {
    await supabase.storage
      .from('protocol-photos')
      .remove([filePath]);
    console.log('Cleaned up uploaded file:', filePath);
  } catch (error) {
    console.error('Failed to cleanup uploaded file:', filePath, error);
  }
}
```

### Etap 12: Orchestration w API handler
```typescript
// In API handler:
let uploadedFilePath: string | null = null;

try {
  // ... validation ...

  // Upload to storage
  const { path: filePath } = generateFilePath(apartmentId, protocol.id, file.type);
  uploadedFilePath = filePath;

  await uploadProtocolPhoto(supabase, filePath, file);

  // Save to database
  const photo = await saveProtocolPhotoRecord(
    supabase,
    protocol.id,
    filePath,
    user.id
  );

  // Generate signed URL
  const { data: signedUrlData } = await supabase.storage
    .from('protocol-photos')
    .createSignedUrl(filePath, 3600);

  // Map to DTO
  const photoDTO: UploadProtocolPhotoResponseDTO = {
    id: photo.id,
    protocol_id: photo.protocol_id,
    file_path: photo.file_path,
    file_url: signedUrlData?.signedUrl || '',
    uploaded_at: photo.uploaded_at
  };

  return new Response(JSON.stringify(photoDTO), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
} catch (error) {
  // Rollback: delete uploaded file if DB insert failed
  if (uploadedFilePath) {
    await cleanupUploadedFile(supabase, uploadedFilePath);
  }

  throw error; // Re-throw for error handler
}
```

### Etap 13: Obsługa błędów
1. Wrap całą logikę w try-catch
2. Handle wszystkie error cases
3. Implement rollback logic
4. Log errors appropriately

### Etap 14: Testy
1. **Unit tests:**
   - Test file validation (type, size)
   - Test photo limit check
   - Test file path generation
2. **Integration tests:**
   - Test successful upload
   - Test invalid file type
   - Test file too large
   - Test photo limit exceeded
   - Test protocol not found
   - Test unauthorized access
   - Test rollback on DB failure

### Etap 15: Dokumentacja
1. JSDoc dla funkcji
2. Komentarze w kodzie
3. Update API docs

## 10. Przykładowy kod implementacji

### API Route Handler
```typescript
// src/pages/api/apartments/[id]/protocols/[type]/photos/index.ts
import type { APIContext } from 'astro';
import { z } from 'zod';
import {
  getProtocolForUpload,
  checkPhotoLimit,
  uploadProtocolPhoto,
  saveProtocolPhotoRecord
} from '@/lib/services/protocolService';
import type { UploadProtocolPhotoResponseDTO } from '@/types';

export const prerender = false;

const paramsSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['move_in', 'move_out'])
});

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function generateFilePath(
  apartmentId: string,
  protocolId: string,
  mimeType: string
): string {
  const photoUuid = crypto.randomUUID();
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  return `${apartmentId}/${protocolId}/${photoUuid}.${extension}`;
}

async function cleanupUploadedFile(
  supabase: any,
  filePath: string
): Promise<void> {
  try {
    await supabase.storage.from('protocol-photos').remove([filePath]);
    console.log('Cleaned up uploaded file:', filePath);
  } catch (error) {
    console.error('Failed to cleanup:', error);
  }
}

export async function POST(context: APIContext): Promise<Response> {
  let uploadedFilePath: string | null = null;

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
          message: 'Nieprawidłowe parametry'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { id: apartmentId, type } = validation.data;
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
          message: 'Tylko właściciele mogą dodawać zdjęcia do protokołów'
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Parse form data
    const formData = await context.request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Brak pliku do uploadu'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Nieprawidłowy format pliku. Dozwolone: JPG, PNG'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({
          error: 'Payload Too Large',
          message: 'Rozmiar pliku nie może przekraczać 5MB'
        }),
        { status: 413, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 7. Get protocol
    const protocol = await getProtocolForUpload(supabase, apartmentId, type);
    if (!protocol) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Protokół nie został jeszcze utworzony'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 8. Check photo limit
    const canUpload = await checkPhotoLimit(supabase, protocol.id);
    if (!canUpload) {
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'Nie można dodać więcej niż 10 zdjęć do protokołu'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 9. Generate file path
    const filePath = generateFilePath(apartmentId, protocol.id, file.type);
    uploadedFilePath = filePath;

    // 10. Upload to storage
    await uploadProtocolPhoto(supabase, filePath, file);

    // 11. Save to database
    const photo = await saveProtocolPhotoRecord(
      supabase,
      protocol.id,
      filePath,
      user.id
    );

    // 12. Generate signed URL
    const { data: signedUrlData } = await supabase.storage
      .from('protocol-photos')
      .createSignedUrl(filePath, 3600);

    // 13. Map to DTO
    const photoDTO: UploadProtocolPhotoResponseDTO = {
      id: photo.id,
      protocol_id: photo.protocol_id,
      file_path: photo.file_path,
      file_url: signedUrlData?.signedUrl || '',
      uploaded_at: photo.uploaded_at
    };

    return new Response(JSON.stringify(photoDTO), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('POST /api/apartments/:id/protocols/:type/photos error:', error);

    // Rollback: cleanup uploaded file
    if (uploadedFilePath) {
      await cleanupUploadedFile(context.locals.supabase, uploadedFilePath);
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

## 11. Checklisty

### Pre-Implementation Checklist
- [ ] Zapoznanie z API plan
- [ ] Zapoznanie z DB plan (protocol_photos, trigger limit)
- [ ] Zapoznanie z Storage RLS policies
- [ ] Weryfikacja bucket `protocol-photos` istnieje
- [ ] Zrozumienie multipart/form-data w Astro

### Implementation Checklist
- [ ] Utworzenie pliku API route
- [ ] Implementacja walidacji parametrów
- [ ] Implementacja parsowania form data
- [ ] Implementacja walidacji pliku (type, size)
- [ ] Implementacja autoryzacji (user + role)
- [ ] Implementacja weryfikacji protokołu
- [ ] Implementacja sprawdzenia limitu zdjęć
- [ ] Implementacja generowania file path
- [ ] Implementacja uploadu do storage
- [ ] Implementacja zapisu do database
- [ ] Implementacja rollback logic
- [ ] Implementacja generowania signed URL
- [ ] Implementacja mapowania do DTO
- [ ] Implementacja obsługi błędów
- [ ] Testy

### Testing Checklist
- [ ] Test: Successful upload (201)
- [ ] Test: Invalid file type (400)
- [ ] Test: File too large (413)
- [ ] Test: Photo limit exceeded (400)
- [ ] Test: Protocol not found (404)
- [ ] Test: Unauthorized (401)
- [ ] Test: Non-owner (403)
- [ ] Test: Rollback działa (file deleted on DB error)
- [ ] Test: File path structure jest prawidłowa
- [ ] Test: MIME type validation działa
- [ ] Test: Database trigger limit enforcement

### Post-Implementation Checklist
- [ ] Code review
- [ ] Security audit (file validation)
- [ ] JSDoc documentation
- [ ] Update API docs
- [ ] Deployment staging
- [ ] Manual upload testing
- [ ] Performance test (<2s dla 5MB)
- [ ] Production deployment
