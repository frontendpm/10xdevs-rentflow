# API Endpoint Implementation Plan: POST /api/charges/:id/attachment

## 1. Przegląd punktu końcowego

**Endpoint:** `POST /api/charges/:id/attachment`

**Cel:** Dodanie załącznika do opłaty (tylko właściciel).

**Funkcjonalność:**
- Uploaduje plik do Supabase Storage (bucket: `charge-attachments`)
- Aktualizuje pole `attachment_path` w tabeli `charges`
- Tylko 1 załącznik na opłatę (zastępuje istniejący)
- Walidacja typu pliku (PDF, JPG, PNG) i rozmiaru (max 5MB)
- Generuje signed URL dla uploaded file

## 2. Szczegóły żądania

### HTTP Method
`POST`

### URL Structure
```
/api/charges/:id/attachment
```

### Path Parameters
- `id` (required): UUID - ID opłaty

### Headers
```
Authorization: Bearer <jwt-token>
Content-Type: multipart/form-data
```

### Request Body (multipart/form-data)
- `file`: File - Plik załącznika (PDF, JPG, PNG, max 5MB)

## 3. Wykorzystywane typy

### Response DTO
```typescript
import type { UploadChargeAttachmentResponseDTO } from '@/types';

type UploadChargeAttachmentResponseDTO = Pick<
  Tables<'charges'>,
  'id' | 'attachment_path'
> & {
  attachment_url: string;
};
```

## 4. Szczegóły odpowiedzi

### Success Response (200 OK)
```json
{
  "id": "uuid",
  "attachment_path": "apartment-uuid/charge-uuid.pdf",
  "attachment_url": "https://storage.supabase.co/..."
}
```

### Error Responses

**400 Bad Request** - Nieprawidłowy format pliku
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowy format pliku. Dozwolone: PDF, JPG, PNG"
}
```

**400 Bad Request** - Brak pliku
```json
{
  "error": "Validation Error",
  "message": "Nie przesłano pliku"
}
```

**413 Payload Too Large** - Plik zbyt duży
```json
{
  "error": "Payload Too Large",
  "message": "Rozmiar pliku nie może przekraczać 5MB"
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
  "message": "Nie masz uprawnień do dodania załącznika do tej opłaty"
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
  "message": "Wystąpił błąd podczas przesyłania załącznika"
}
```

## 5. Przepływ danych

### Business Logic Flow
```
ChargesService.uploadAttachment()
    ↓
Verify charge exists and user is owner
    ├─ RLS filters by owner access
    ├─ Not found → return 404/403
    └─ Found → continue
    ↓
Get apartment_id for charge (for Storage path)
    ↓
Validate file:
    ├─ Check if file exists
    ├─ Validate MIME type (application/pdf, image/jpeg, image/png)
    ├─ Validate file size (max 5MB)
    └─ Validation failed → return 400/413
    ↓
Delete old attachment from Storage (if exists)
    ↓
Generate file path: {apartment_id}/{charge_id}.{extension}
    ↓
Upload file to Supabase Storage (bucket: charge-attachments)
    ├─ RLS on storage.objects validates access
    └─ Upload failed → return 500
    ↓
Update charge.attachment_path in database
    ↓
Generate signed URL for uploaded file
    ↓
Return UploadChargeAttachmentResponseDTO
```

### Validation Rules

**MIME Types (allowed):**
- `application/pdf` → .pdf
- `image/jpeg` → .jpg, .jpeg
- `image/png` → .png

**File Size:**
- Maximum: 5MB (5,242,880 bytes)

**File Naming:**
- Path format: `{apartment_id}/{charge_id}.{extension}`
- Example: `a1b2c3d4-e5f6-7g8h-9i0j-k1l2m3n4o5p6/c7d8e9f0-a1b2-3c4d-5e6f-7g8h9i0j1k2l.pdf`

## 6. Względy bezpieczeństwa

### Authorization
- **Owner-only:** Tylko właściciel może dodawać załączniki
- **RLS on charges:** UPDATE policy weryfikuje ownership
- **RLS on storage.objects:** INSERT policy weryfikuje czy foldername[1] należy do właściciela

### File Validation
- **MIME type check:** Walidacja typu pliku na podstawie MIME type (nie tylko extension)
- **File size limit:** Strict 5MB limit
- **File name sanitization:** Używamy UUID dla nazwy pliku (bezpieczne)

### Storage Security
- **Signed URLs:** Generated URLs expire after 1 hour
- **RLS on Storage:** Policies kontrolują kto może upload/read/delete
- **Path structure:** Pliki organizowane per apartment (isolation)

## 7. Obsługa błędów

### File Validation Errors
```typescript
// No file uploaded
if (!file) {
  throw new Error('NO_FILE_UPLOADED');
}

// Invalid MIME type
const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
if (!allowedTypes.includes(file.type)) {
  throw new Error('INVALID_FILE_TYPE');
}

// File too large (5MB)
if (file.size > 5 * 1024 * 1024) {
  throw new Error('FILE_TOO_LARGE');
}
```

### Storage Errors
```typescript
// Upload failed
if (uploadError) {
  console.error('Storage upload error:', uploadError);
  throw new Error('STORAGE_UPLOAD_ERROR');
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje
1. **Delete old before upload:** Usuń stary plik przed uploadem nowego (save space)
2. **Unique file names:** UUID-based naming prevents collisions
3. **Content-Type preservation:** Upload with correct Content-Type header

### Storage Limits
- Supabase Storage limits:
  - Max file size: 50MB (our limit: 5MB)
  - Rate limits apply

### Monitorowanie
- Log upload durations
- Monitor Storage usage per apartment
- Track failed uploads

## 9. Etapy wdrożenia

### Krok 1: Helper funkcja do walidacji pliku
**Plik:** `src/lib/utils/file-validation.ts`

```typescript
const ALLOWED_MIME_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png'
} as const;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function validateAttachmentFile(file: File): {
  valid: boolean;
  error?: string;
  extension?: string;
} {
  // Check if file exists
  if (!file) {
    return { valid: false, error: 'NO_FILE_UPLOADED' };
  }

  // Validate MIME type
  if (!(file.type in ALLOWED_MIME_TYPES)) {
    return { valid: false, error: 'INVALID_FILE_TYPE' };
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'FILE_TOO_LARGE' };
  }

  const extension = ALLOWED_MIME_TYPES[file.type as keyof typeof ALLOWED_MIME_TYPES];

  return { valid: true, extension };
}
```

### Krok 2: Service method
```typescript
async uploadAttachment(
  chargeId: string,
  file: File
): Promise<UploadChargeAttachmentResponseDTO> {
  // 1. Validate file
  const validation = validateAttachmentFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 2. Fetch charge and get apartment_id
  const { data: charge, error: fetchError } = await this.supabase
    .from('charges')
    .select(`
      id,
      attachment_path,
      lease:leases!inner(
        apartment:apartments!inner(id)
      )
    `)
    .eq('id', chargeId)
    .single();

  if (fetchError || !charge) {
    throw new Error('CHARGE_NOT_FOUND');
  }

  const apartmentId = charge.lease.apartment.id;

  // 3. Delete old attachment if exists
  if (charge.attachment_path) {
    await this.supabase.storage
      .from('charge-attachments')
      .remove([charge.attachment_path]);
    // Ignore errors - old file cleanup is non-critical
  }

  // 4. Generate file path
  const filePath = `${apartmentId}/${chargeId}.${validation.extension}`;

  // 5. Upload to Storage
  const { error: uploadError } = await this.supabase.storage
    .from('charge-attachments')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: true // Replace if exists
    });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    throw new Error('STORAGE_UPLOAD_ERROR');
  }

  // 6. Update charge.attachment_path
  const { error: updateError } = await this.supabase
    .from('charges')
    .update({ attachment_path: filePath })
    .eq('id', chargeId);

  if (updateError) {
    console.error('Error updating attachment_path:', updateError);
    // Try to cleanup uploaded file
    await this.supabase.storage
      .from('charge-attachments')
      .remove([filePath]);
    throw new Error('DATABASE_ERROR');
  }

  // 7. Generate signed URL
  const { data: signedUrl } = await this.supabase.storage
    .from('charge-attachments')
    .createSignedUrl(filePath, 3600);

  if (!signedUrl) {
    throw new Error('FAILED_TO_GENERATE_URL');
  }

  return {
    id: chargeId,
    attachment_path: filePath,
    attachment_url: signedUrl.signedUrl
  };
}
```

### Krok 3: API route handler
**Plik:** `src/pages/api/charges/[id]/attachment.ts`

```typescript
import type { APIContext } from 'astro';
import { ChargesService } from '@/lib/services/charges.service';

export const prerender = false;

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
        message: 'Tylko właściciele mogą dodawać załączniki'
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

  // 4. Parse multipart/form-data
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        message: 'Nieprawidłowy format danych'
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const file = formData.get('file') as File;

  // 5. Call service
  try {
    const chargesService = new ChargesService(supabase);
    const result = await chargesService.uploadAttachment(chargeId, file);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in POST /api/charges/:id/attachment:', error);

    if (error.message === 'NO_FILE_UPLOADED') {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Nie przesłano pliku'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (error.message === 'INVALID_FILE_TYPE') {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Nieprawidłowy format pliku. Dozwolone: PDF, JPG, PNG'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (error.message === 'FILE_TOO_LARGE') {
      return new Response(
        JSON.stringify({
          error: 'Payload Too Large',
          message: 'Rozmiar pliku nie może przekraczać 5MB'
        }),
        { status: 413, headers: { 'Content-Type': 'application/json' } }
      );
    }

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
        message: 'Wystąpił błąd podczas przesyłania załącznika'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### Krok 4: Testowanie
1. **Unit tests:** File validation helper
2. **Integration tests:** ChargesService.uploadAttachment()
3. **E2E tests:** Upload different file types and sizes

### Krok 5: Dokumentacja
- JSDoc comments
- Examples with curl
- Frontend integration guide (FormData usage)
