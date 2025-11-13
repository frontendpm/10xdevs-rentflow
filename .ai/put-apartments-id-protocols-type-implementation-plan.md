# API Endpoint Implementation Plan: PUT /api/apartments/:id/protocols/:type

## 1. Przegląd punktu końcowego

Endpoint służy do tworzenia nowego protokołu lub aktualizacji istniejącego dla aktywnego najmu mieszkania. Używa metody PUT zgodnie z semantyką HTTP (upsert operation). Dostęp ma tylko właściciel mieszkania.

## 2. Szczegóły żądania

- **Metoda HTTP:** PUT
- **Struktura URL:** `/api/apartments/:id/protocols/:type`
- **Parametry:**
  - **Wymagane (path params):**
    - `id` (string, UUID) - ID mieszkania
    - `type` (string, enum: "move_in" | "move_out") - typ protokołu
  - **Opcjonalne:** Brak
- **Request Body:**
```json
{
  "description": "Stan liczników:\n- Prąd: 12345 kWh\n- Woda: 678 m³"
}
```
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagane)
  - `Content-Type: application/json` (wymagane)

## 3. Wykorzystywane typy

### Command Models (Request)
```typescript
// z src/types.ts
export type CreateUpdateProtocolCommand = {
  description: string;
};
```

### DTOs (Response)
```typescript
// z src/types.ts
export type ProtocolDTO = Omit<Tables<'protocols'>, 'created_by'> & {
  photos: ProtocolPhotoDTO[];
};
```

### Database Types
```typescript
// z src/db/database.types.ts
TablesInsert<'protocols'> // for INSERT
TablesUpdate<'protocols'> // for UPDATE
Enums<'protocol_type'> // "move_in" | "move_out"
```

## 4. Szczegóły odpowiedzi

### Response 200 (Update Success)
```json
{
  "id": "uuid",
  "lease_id": "uuid",
  "type": "move_in",
  "description": "Stan liczników:\n- Prąd: 12345 kWh\n- Woda: 678 m³",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-12T10:00:00Z",
  "photos": []
}
```

### Response 201 (Create Success)
```json
{
  "id": "uuid",
  "lease_id": "uuid",
  "type": "move_in",
  "description": "Stan liczników:\n- Prąd: 12345 kWh\n- Woda: 678 m³",
  "created_at": "2025-01-12T10:00:00Z",
  "updated_at": "2025-01-12T10:00:00Z",
  "photos": []
}
```

### Error 400 (Bad Request)
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowe dane",
  "details": {
    "description": "Opis jest wymagany"
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

### Error 403 (Forbidden)
```json
{
  "error": "Forbidden",
  "message": "Tylko właściciele mogą zarządzać protokołami"
}
```

### Error 404 (Not Found)
```json
{
  "error": "Not Found",
  "message": "Brak aktywnego najmu dla tego mieszkania"
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

### Krok 1: Walidacja parametrów i body
1. Walidacja `id` jako UUID
2. Walidacja `type` jako enum (`move_in` | `move_out`)
3. Walidacja `description` w request body (required string)
4. Sprawdzenie autoryzacji użytkownika (JWT z `context.locals`)

### Krok 2: Weryfikacja aktywnego najmu
1. Pobierz aktywny lease dla apartment
2. Jeśli brak active lease → return 404
3. RLS automatycznie zweryfikuje czy user jest właścicielem

### Krok 3: Sprawdzenie czy protokół istnieje
```sql
SELECT * FROM protocols
WHERE lease_id = :lease_id
  AND type = :type
```
- Jeśli istnieje → wykonaj UPDATE (return 200)
- Jeśli nie istnieje → wykonaj INSERT (return 201)

### Krok 4a: UPDATE istniejącego protokołu
```sql
UPDATE protocols
SET description = :description,
    updated_at = NOW()
WHERE id = :protocol_id
RETURNING *
```

### Krok 4b: INSERT nowego protokołu
```sql
INSERT INTO protocols (lease_id, type, description, created_by)
VALUES (:lease_id, :type, :description, :user_id)
RETURNING *
```

### Krok 5: Pobranie zdjęć (dla response)
```sql
SELECT * FROM protocol_photos
WHERE protocol_id = :protocol_id
ORDER BY uploaded_at ASC
```

### Krok 6: Generowanie signed URLs dla zdjęć
- Dla każdego zdjęcia wygeneruj signed URL (podobnie jak w GET endpoint)

### Krok 7: Mapowanie do DTO
- Pomiń `created_by` z response
- Dodaj tablicę zdjęć z signed URLs
- Zwróć odpowiedni kod statusu (200 lub 201)

## 6. Względy bezpieczeństwa

### Autoryzacja (RLS)
- **Owner only:** Tylko właściciel mieszkania może tworzyć/aktualizować protokoły
- **RLS policies:** Automatycznie weryfikują ownership przez chain: protocol → lease → apartment → owner
- **Tenant restriction:** Lokator nie może edytować protokołów (read-only)

### Walidacja danych
- **UUID validation:** apartment ID musi być poprawnym UUID
- **Enum validation:** Typ protokołu musi być `move_in` lub `move_out`
- **Description validation:** Required, string (Zod schema)
- **SQL Injection:** Prepared statements (Supabase auto-handles)

### Business Rules
- **One protocol per type:** Unique constraint (lease_id, type) zapewnia max 1 protokół każdego typu per lease
- **Active lease required:** Nie można tworzyć protokołu bez aktywnego najmu
- **Owner verification:** RLS policies weryfikują ownership

### Logging
- Loguj próby edycji przez non-owners (403)
- Loguj błędy database operations
- Nie loguj sensitive data (descriptions mogą zawierać PII)

## 7. Obsługa błędów

### Błędy walidacji (400)
- **Invalid apartment ID:** Nieprawidłowy format UUID
- **Invalid protocol type:** Typ nie jest `move_in` ani `move_out`
- **Missing description:** Brak opisu w request body
- **Invalid description:** Opis nie jest stringiem
- **Handling:** Zwróć 400 z szczegółowym komunikatem walidacji

### Błędy autoryzacji (401)
- **Missing JWT:** Brak tokena w Authorization header
- **Invalid JWT:** Token wygasł lub nieprawidłowy
- **Handling:** Zwróć 401 z komunikatem "Brak autoryzacji"

### Błędy dostępu (403)
- **RLS violation:** User nie jest właścicielem mieszkania
- **Tenant attempting edit:** Lokator próbuje edytować protokół
- **Handling:** Zwróć 403 (RLS automatically rejects, capture as 403)

### Błędy nie znalezienia zasobu (404)
- **No active lease:** Mieszkanie nie ma aktywnego najmu
- **Apartment not found:** Mieszkanie nie istnieje
- **Handling:** Zwróć 404 z komunikatem "Brak aktywnego najmu dla tego mieszkania"

### Błędy bazy danych (500)
- **Database connection error**
- **Query timeout**
- **Unique constraint violation:** (nie powinno się zdarzyć przez logikę upsert)
- **Handling:** Log full error, return 500 generic message

### Błędy Storage (500)
- **Signed URL generation failed:** Błąd przy pobieraniu zdjęć
- **Handling:** Log error, zwróć pustą tablicę zdjęć lub 500

## 8. Rozważania dotyczące wydajności

### Query optimization
- **Single query check:** Sprawdź istnienie protokołu jednym zapytaniem
- **Conditional insert/update:** Wykonaj tylko potrzebną operację (INSERT lub UPDATE)
- **Batch operations:** Generuj signed URLs równolegle (Promise.all)

### Upsert pattern
```typescript
// Preferowany pattern dla upsert
const { data: protocol, error } = await supabase
  .from('protocols')
  .upsert({
    lease_id,
    type,
    description,
    created_by: user.id
  }, {
    onConflict: 'lease_id,type'
  })
  .select()
  .single();
```
- **Advantage:** Atomic operation, eliminuje race conditions
- **Note:** Wymaga unique constraint na (lease_id, type) - już istnieje w db-plan

### Transaction considerations
- **Upsert is atomic:** Supabase upsert automatycznie obsługuje transactions
- **No explicit transaction needed:** Single upsert operation

### Caching
- **MVP:** Brak cachingu
- **Future:** Cache protocol data (invalidate on update)

### Database indexes
- Już istnieją w db-plan.md:
  - `idx_protocols_lease_type` - unique index (lease_id, type) - wspiera upsert
  - `idx_protocols_lease_id` - szybkie wyszukiwanie

## 9. Etapy wdrożenia

### Etap 1: Struktura pliku API route
1. Utwórz plik: `src/pages/api/apartments/[id]/protocols/[type].ts`
2. Dodaj `export const prerender = false`
3. Zaimplementuj handler `PUT` (oprócz istniejącego GET z poprzedniego planu)
4. Pobierz `supabase` z `context.locals`

### Etap 2: Walidacja parametrów i body
1. Utwórz Zod schema dla path params:
```typescript
const paramsSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['move_in', 'move_out'])
});
```
2. Utwórz Zod schema dla request body:
```typescript
const bodySchema = z.object({
  description: z.string().min(1, 'Opis jest wymagany')
});
```
3. Waliduj oba schematy
4. Return 400 jeśli walidacja failed

### Etap 3: Autoryzacja i weryfikacja roli
1. Pobierz user z `context.locals.user`
2. Jeśli brak user → return 401
3. Pobierz user role z database:
```typescript
const { data: userData } = await supabase
  .from('users')
  .select('role')
  .eq('id', user.id)
  .single();

if (userData?.role !== 'owner') {
  return 403; // Tylko właściciele
}
```
4. **Note:** RLS również zweryfikuje ownership, ale explicit check daje lepszy error message

### Etap 4: Weryfikacja aktywnego najmu
1. W serwisie implementuj `getActiveLeaseForApartment`:
```typescript
const { data: lease, error } = await supabase
  .from('leases')
  .select('id')
  .eq('apartment_id', apartmentId)
  .eq('status', 'active')
  .single();

if (error || !lease) {
  return null; // No active lease
}
```
2. Jeśli brak lease → return 404

### Etap 5: Service - Upsert protokołu
1. Rozszerz `src/lib/services/protocolService.ts`
2. Implementuj funkcję `upsertProtocol`:
```typescript
export async function upsertProtocol(
  supabase: SupabaseClient,
  leaseId: string,
  type: 'move_in' | 'move_out',
  description: string,
  userId: string
): Promise<{ protocol: any; isNew: boolean }> {
  // Check if protocol exists
  const { data: existing } = await supabase
    .from('protocols')
    .select('id')
    .eq('lease_id', leaseId)
    .eq('type', type)
    .single();

  if (existing) {
    // UPDATE existing
    const { data: updated, error } = await supabase
      .from('protocols')
      .update({ description })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return { protocol: updated, isNew: false };
  } else {
    // INSERT new
    const { data: created, error } = await supabase
      .from('protocols')
      .insert({
        lease_id: leaseId,
        type,
        description,
        created_by: userId
      })
      .select()
      .single();

    if (error) throw error;
    return { protocol: created, isNew: true };
  }
}
```

**Alternative (recommended): Use Supabase upsert**
```typescript
export async function upsertProtocol(
  supabase: SupabaseClient,
  leaseId: string,
  type: 'move_in' | 'move_out',
  description: string,
  userId: string
): Promise<any> {
  // Note: Upsert doesn't tell us if it was insert or update
  // We need to check before to determine status code
  const { data: existing } = await supabase
    .from('protocols')
    .select('id')
    .eq('lease_id', leaseId)
    .eq('type', type)
    .maybeSingle();

  const isNew = !existing;

  const { data: protocol, error } = await supabase
    .from('protocols')
    .upsert({
      lease_id: leaseId,
      type,
      description,
      created_by: userId
    }, {
      onConflict: 'lease_id,type',
      ignoreDuplicates: false
    })
    .select()
    .single();

  if (error) throw error;
  return { protocol, isNew };
}
```

### Etap 6: Pobranie zdjęć (reuse z GET endpoint)
1. Wywołaj `getProtocolPhotos` z serwisu
2. Wygeneruj signed URLs
3. Mapuj do ProtocolPhotoDTO[]

### Etap 7: Mapowanie do DTO
1. Pomiń `created_by` z protokołu
2. Dodaj tablicę zdjęć
3. Return ProtocolDTO

### Etap 8: Określenie status code
1. Jeśli `isNew === true` → return 201 (Created)
2. Jeśli `isNew === false` → return 200 (OK)

### Etap 9: Obsługa błędów
1. Wrap logikę w try-catch
2. Handle ZodError → 400
3. Handle no active lease → 404
4. Handle RLS violation → 403 (detect by error code/message)
5. Handle database errors → 500
6. Loguj wszystkie błędy

### Etap 10: Response
1. Return odpowiedni status (200/201) z ProtocolDTO:
```typescript
return new Response(JSON.stringify(protocolDTO), {
  status: isNew ? 201 : 200,
  headers: { 'Content-Type': 'application/json' }
});
```

### Etap 11: Testy
1. **Unit tests** dla serwisu:
   - Test upsert creates new protocol
   - Test upsert updates existing protocol
   - Test no active lease handling
2. **Integration tests** dla endpoint:
   - Test owner can create protocol (201)
   - Test owner can update protocol (200)
   - Test tenant cannot create/update (403)
   - Test unauthorized (401)
   - Test no active lease (404)
   - Test validation errors (400)

### Etap 12: Dokumentacja
1. JSDoc dla funkcji serwisu
2. Komentarze w kodzie
3. Update API documentation

## 10. Przykładowy kod implementacji

### API Route Handler
```typescript
// src/pages/api/apartments/[id]/protocols/[type].ts
import type { APIContext } from 'astro';
import { z } from 'zod';
import {
  getActiveLeaseForApartment,
  upsertProtocol,
  getProtocolPhotosWithUrls
} from '@/lib/services/protocolService';
import type { ProtocolDTO } from '@/types';

export const prerender = false;

const paramsSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['move_in', 'move_out'])
});

const bodySchema = z.object({
  description: z.string().min(1, 'Opis jest wymagany')
});

export async function PUT(context: APIContext): Promise<Response> {
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
    const paramsValidation = paramsSchema.safeParse(context.params);
    if (!paramsValidation.success) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Nieprawidłowe parametry',
          details: paramsValidation.error.flatten()
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Validate body
    const body = await context.request.json();
    const bodyValidation = bodySchema.safeParse(body);
    if (!bodyValidation.success) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Nieprawidłowe dane',
          details: bodyValidation.error.flatten()
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { id: apartmentId, type } = paramsValidation.data;
    const { description } = bodyValidation.data;
    const supabase = context.locals.supabase;

    // 4. Verify user is owner
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'owner') {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: 'Tylko właściciele mogą zarządzać protokołami'
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Get active lease
    const lease = await getActiveLeaseForApartment(supabase, apartmentId);
    if (!lease) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Brak aktywnego najmu dla tego mieszkania'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. Upsert protocol
    const { protocol, isNew } = await upsertProtocol(
      supabase,
      lease.id,
      type,
      description,
      user.id
    );

    // 7. Get photos
    const photos = await getProtocolPhotosWithUrls(supabase, protocol.id);

    // 8. Map to DTO
    const protocolDTO: ProtocolDTO = {
      id: protocol.id,
      lease_id: protocol.lease_id,
      type: protocol.type,
      description: protocol.description,
      created_at: protocol.created_at,
      updated_at: protocol.updated_at,
      photos
    };

    // 9. Return with appropriate status
    return new Response(JSON.stringify(protocolDTO), {
      status: isNew ? 201 : 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('PUT /api/apartments/:id/protocols/:type error:', error);

    // Check for RLS violation
    if (error instanceof Error && error.message.includes('row-level security')) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: 'Nie masz uprawnień do edycji tego protokołu'
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

export async function getActiveLeaseForApartment(
  supabase: SupabaseClient,
  apartmentId: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('leases')
    .select('id')
    .eq('apartment_id', apartmentId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('Error fetching active lease:', error);
    return null;
  }

  return data;
}

export async function upsertProtocol(
  supabase: SupabaseClient,
  leaseId: string,
  type: 'move_in' | 'move_out',
  description: string,
  userId: string
): Promise<{ protocol: any; isNew: boolean }> {
  // Check if protocol exists first (to determine status code)
  const { data: existing } = await supabase
    .from('protocols')
    .select('id')
    .eq('lease_id', leaseId)
    .eq('type', type)
    .maybeSingle();

  const isNew = !existing;

  // Perform upsert
  const { data: protocol, error } = await supabase
    .from('protocols')
    .upsert(
      {
        lease_id: leaseId,
        type,
        description,
        created_by: userId
      },
      {
        onConflict: 'lease_id,type',
        ignoreDuplicates: false
      }
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return { protocol, isNew };
}

export async function getProtocolPhotosWithUrls(
  supabase: SupabaseClient,
  protocolId: string
): Promise<ProtocolPhotoDTO[]> {
  const { data: photos, error } = await supabase
    .from('protocol_photos')
    .select('*')
    .eq('protocol_id', protocolId)
    .order('uploaded_at', { ascending: true });

  if (error) {
    console.error('Error fetching protocol photos:', error);
    return [];
  }

  if (!photos || photos.length === 0) {
    return [];
  }

  // Generate signed URLs
  const photosWithUrls = await Promise.all(
    photos.map(async (photo) => {
      try {
        const { data: signedUrlData } = await supabase.storage
          .from('protocol-photos')
          .createSignedUrl(photo.file_path, 3600);

        return {
          id: photo.id,
          protocol_id: photo.protocol_id,
          file_path: photo.file_path,
          file_url: signedUrlData?.signedUrl || '',
          uploaded_at: photo.uploaded_at
        };
      } catch (error) {
        console.error('Failed to generate signed URL:', error);
        return {
          id: photo.id,
          protocol_id: photo.protocol_id,
          file_path: photo.file_path,
          file_url: '',
          uploaded_at: photo.uploaded_at
        };
      }
    })
  );

  return photosWithUrls;
}
```

## 11. Checklisty

### Pre-Implementation Checklist
- [ ] Zapoznanie z API plan (sekcja 4.7)
- [ ] Zapoznanie z DB plan (protocols table, unique constraint)
- [ ] Zapoznanie z types.ts (CreateUpdateProtocolCommand, ProtocolDTO)
- [ ] Weryfikacja RLS policies dla protocols
- [ ] Potwierdzenie unique constraint (lease_id, type)

### Implementation Checklist
- [ ] Dodanie handler PUT do istniejącego pliku route
- [ ] Implementacja walidacji parametrów (Zod)
- [ ] Implementacja walidacji body (Zod)
- [ ] Implementacja autoryzacji (user + role check)
- [ ] Implementacja weryfikacji aktywnego najmu
- [ ] Implementacja upsert logic w serwisie
- [ ] Reuse logic pobierania zdjęć z GET endpoint
- [ ] Implementacja mapowania do DTO
- [ ] Implementacja odpowiedniego status code (200 vs 201)
- [ ] Implementacja obsługi błędów
- [ ] Testy jednostkowe
- [ ] Testy integracyjne

### Testing Checklist
- [ ] Test: Owner może utworzyć nowy protokół (201)
- [ ] Test: Owner może zaktualizować istniejący protokół (200)
- [ ] Test: Tenant nie może edytować protokołu (403)
- [ ] Test: Unauthorized user (401)
- [ ] Test: Brak aktywnego najmu (404)
- [ ] Test: Invalid apartment ID (400)
- [ ] Test: Invalid protocol type (400)
- [ ] Test: Missing description (400)
- [ ] Test: Protokół jest poprawnie tworzony w bazie
- [ ] Test: Protokół jest poprawnie aktualizowany
- [ ] Test: Unique constraint działa (1 protokół per type per lease)

### Post-Implementation Checklist
- [ ] Code review
- [ ] JSDoc documentation
- [ ] Update API docs
- [ ] Deployment staging
- [ ] Manual testing
- [ ] Performance test (<500ms response)
- [ ] Security audit
- [ ] Production deployment
