# API Endpoint Implementation Plan: GET /api/apartments/:id/protocols/:type

## 1. Przegląd punktu końcowego

Endpoint służy do pobierania protokołu (odbioru lub zwrotu) dla aktywnego najmu mieszkania. Zwraca szczegóły protokołu wraz ze zdjęciami dokumentującymi stan mieszkania. Dostęp mają właściciel mieszkania oraz lokator z aktywnym najmem.

## 2. Szczegóły żądania

- **Metoda HTTP:** GET
- **Struktura URL:** `/api/apartments/:id/protocols/:type`
- **Parametry:**
  - **Wymagane (path params):**
    - `id` (string, UUID) - ID mieszkania
    - `type` (string, enum: "move_in" | "move_out") - typ protokołu
  - **Opcjonalne:** Brak
- **Request Body:** Brak (GET request)
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagane)

## 3. Wykorzystywane typy

### DTOs (Response)
```typescript
// z src/types.ts
export type ProtocolDTO = Omit<Tables<'protocols'>, 'created_by'> & {
  photos: ProtocolPhotoDTO[];
};

export type ProtocolPhotoDTO = Omit<Tables<'protocol_photos'>, 'created_by'> & {
  file_url: string;
};
```

### Database Types
```typescript
// z src/db/database.types.ts
Tables<'protocols'> // protocol base data
Tables<'protocol_photos'> // photos data
Enums<'protocol_type'> // "move_in" | "move_out"
```

## 4. Szczegóły odpowiedzi

### Response 200 (Success)
```json
{
  "id": "uuid",
  "lease_id": "uuid",
  "type": "move_in",
  "description": "Stan liczników:\n- Prąd: 12345 kWh\n- Woda: 678 m³\n\nUsterki:\n- Brak",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-01T10:00:00Z",
  "photos": [
    {
      "id": "uuid",
      "protocol_id": "uuid",
      "file_path": "apartment-uuid/protocol-uuid/photo1.jpg",
      "file_url": "https://storage.supabase.co/...",
      "uploaded_at": "2025-01-01T10:00:00Z"
    }
  ]
}
```

### Error 400 (Bad Request)
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowy typ protokołu"
}
```

### Error 401 (Unauthorized)
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

### Error 404 (Not Found)
```json
{
  "error": "Not Found",
  "message": "Protokół nie został jeszcze utworzony"
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
3. Sprawdzenie autoryzacji użytkownika (JWT z `context.locals`)

### Krok 2: Pobranie danych mieszkania i najmu
1. Sprawdzenie czy mieszkanie istnieje
2. Pobranie aktywnego najmu dla mieszkania
3. RLS automatycznie weryfikuje dostęp (właściciel lub lokator)

### Krok 3: Pobranie protokołu
```sql
SELECT * FROM protocols
WHERE lease_id = :lease_id
  AND type = :type
```
- Jeśli brak wyników → 404 Not Found
- RLS zapewnia dostęp tylko dla właściciela/lokatora

### Krok 4: Pobranie zdjęć protokołu
```sql
SELECT * FROM protocol_photos
WHERE protocol_id = :protocol_id
ORDER BY uploaded_at ASC
```

### Krok 5: Generowanie signed URLs
- Dla każdego zdjęcia wygeneruj signed URL z Supabase Storage
- Bucket: `protocol-photos`
- Path: `{apartment_id}/{protocol_id}/{filename}`
- Expiry: 1 godzina

### Krok 6: Mapowanie do DTO
- Pomiń `created_by` z response
- Dodaj `file_url` do każdego zdjęcia
- Zwróć pełny obiekt ProtocolDTO

## 6. Względy bezpieczeństwa

### Autoryzacja (RLS)
- **Owner access:** Właściciel mieszkania ma dostęp do protokołów dla swoich mieszkań
- **Tenant access:** Lokator z aktywnym najmem ma dostęp read-only do protokołów
- RLS policies automatycznie filtrują dane na poziomie bazy danych

### Walidacja danych
- **UUID validation:** Sprawdzenie poprawności formatu apartment ID
- **Enum validation:** Typ protokołu musi być `move_in` lub `move_out`
- **SQL Injection:** Prepared statements (Supabase automatically handles)

### Storage Security
- **Signed URLs:** Ograniczony czas dostępu do plików (1h)
- **Path validation:** Weryfikacja struktury ścieżki pliku
- **RLS na storage:** Bucket `protocol-photos` ma policies zapewniające dostęp tylko dla authorized users

### Logging
- Loguj nieautoryzowane próby dostępu (401)
- Loguj błędy generowania signed URLs
- Nie loguj sensitive data (user IDs, file paths)

## 7. Obsługa błędów

### Błędy walidacji (400)
- **Invalid apartment ID:** Nieprawidłowy format UUID
- **Invalid protocol type:** Typ nie jest `move_in` ani `move_out`
- **Handling:** Zwróć 400 z opisowym komunikatem

### Błędy autoryzacji (401)
- **Missing JWT:** Brak tokena w Authorization header
- **Invalid JWT:** Token wygasł lub jest nieprawidłowy
- **RLS violation:** User nie ma dostępu do tego protokołu
- **Handling:** Zwróć 401 z komunikatem "Brak autoryzacji"

### Błędy nie znalezienia zasobu (404)
- **Protocol not found:** Protokół nie istnieje dla danego najmu i typu
- **No active lease:** Mieszkanie nie ma aktywnego najmu
- **Handling:** Zwróć 404 z komunikatem "Protokół nie został jeszcze utworzony"

### Błędy Storage (500)
- **Signed URL generation failed:** Błąd generowania signed URL
- **Storage connection error:** Błąd połączenia z Supabase Storage
- **Handling:**
  - Log full error to console/monitoring
  - Zwróć 500 z generic message "Wystąpił błąd serwera"

### Błędy bazy danych (500)
- **Database connection error**
- **Query timeout**
- **Handling:** Log error, return 500

## 8. Rozważania dotyczące wydajności

### Query optimization
- **Single query dla protokołu:** `SELECT * FROM protocols WHERE ...`
- **Single query dla zdjęć:** `SELECT * FROM protocol_photos WHERE protocol_id = :id`
- **Avoid N+1:** Pobierz wszystkie zdjęcia jednym zapytaniem

### Caching
- **MVP:** Brak cachingu (fresh data)
- **Future:** Cache signed URLs (1h expiry) w memory/Redis

### Signed URLs generation
- **Batch generation:** Generuj wszystkie signed URLs równolegle (Promise.all)
- **Timeout:** Max 5s dla całej operacji
- **Fallback:** Jeśli generowanie URL failed, pomiń to zdjęcie (nie blokuj całego response)

### Database indexes
- Już istnieją w db-plan.md:
  - `idx_protocols_lease_id` - szybkie wyszukiwanie protokołu po lease_id
  - `idx_protocols_lease_type` - unique index (lease_id, type)
  - `idx_protocol_photos_protocol_id` - szybkie pobieranie zdjęć

## 9. Etapy wdrożenia

### Etap 1: Struktura pliku API route
1. Utwórz plik: `src/pages/api/apartments/[id]/protocols/[type].ts`
2. Dodaj `export const prerender = false`
3. Zaimplementuj handler `GET`
4. Pobierz `supabase` z `context.locals` (NIE importuj supabaseClient bezpośrednio)

### Etap 2: Walidacja parametrów
1. Utwórz Zod schema dla path params:
```typescript
const paramsSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['move_in', 'move_out'])
});
```
2. Waliduj parametry z `context.params`
3. Return 400 jeśli walidacja failed

### Etap 3: Autoryzacja
1. Pobierz user z `context.locals.user`
2. Jeśli brak user → return 401
3. RLS automatycznie zweryfikuje dostęp w kolejnych zapytaniach

### Etap 4: Service - Pobranie protokołu
1. Utwórz serwis: `src/lib/services/protocolService.ts` (jeśli nie istnieje)
2. Implementuj funkcję `getProtocolByApartmentAndType`:
   - Pobierz aktywny lease dla apartment
   - Jeśli brak active lease → return null
   - Pobierz protokół dla lease_id i type
   - Jeśli brak protokołu → return null
3. Query:
```typescript
// Get active lease
const { data: lease } = await supabase
  .from('leases')
  .select('id')
  .eq('apartment_id', apartmentId)
  .eq('status', 'active')
  .single();

if (!lease) return null;

// Get protocol
const { data: protocol } = await supabase
  .from('protocols')
  .select('*')
  .eq('lease_id', lease.id)
  .eq('type', type)
  .single();

return protocol;
```

### Etap 5: Pobranie zdjęć protokołu
1. W tym samym serwisie implementuj `getProtocolPhotos`:
```typescript
const { data: photos } = await supabase
  .from('protocol_photos')
  .select('*')
  .eq('protocol_id', protocolId)
  .order('uploaded_at', { ascending: true });
```

### Etap 6: Generowanie signed URLs
1. Implementuj funkcję `generateSignedUrls` w serwisie:
```typescript
const signedUrls = await Promise.all(
  photos.map(async (photo) => {
    const { data } = await supabase.storage
      .from('protocol-photos')
      .createSignedUrl(photo.file_path, 3600); // 1h expiry

    return {
      ...photo,
      file_url: data?.signedUrl || ''
    };
  })
);
```
2. Obsłuż błędy (try-catch), nie blokuj całego response

### Etap 7: Mapowanie do DTO
1. Pomiń `created_by` z protokołu
2. Dodaj tablicę zdjęć z signed URLs
3. Return jako ProtocolDTO

### Etap 8: Obsługa błędów
1. Wrap całą logikę w try-catch
2. Handle validation errors (ZodError) → 400
3. Handle not found (protocol === null) → 404
4. Handle unauthorized (RLS rejection) → 401
5. Handle database errors → 500
6. Loguj błędy do console (production: use proper logging service)

### Etap 9: Response
1. Return 200 z ProtocolDTO:
```typescript
return new Response(JSON.stringify(protocolDTO), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
});
```

### Etap 10: Testy
1. **Unit tests** dla serwisu:
   - Test successful protocol retrieval
   - Test protocol not found
   - Test no active lease
2. **Integration tests** dla API endpoint:
   - Test as owner
   - Test as tenant
   - Test unauthorized access
   - Test invalid parameters
   - Test protocol not found

### Etap 11: Dokumentacja
1. Dodaj JSDoc comments do funkcji serwisu
2. Dodaj komentarze w kodzie endpoint handler
3. Update API documentation jeśli potrzebne

## 10. Przykładowy kod implementacji

### API Route Handler
```typescript
// src/pages/api/apartments/[id]/protocols/[type].ts
import type { APIContext } from 'astro';
import { z } from 'zod';
import { getProtocolByApartmentAndType } from '@/lib/services/protocolService';
import type { ProtocolDTO } from '@/types';

export const prerender = false;

const paramsSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['move_in', 'move_out'])
});

export async function GET(context: APIContext): Promise<Response> {
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

    const { id: apartmentId, type } = validation.data;
    const supabase = context.locals.supabase;

    // 3. Get protocol with photos
    const protocol = await getProtocolByApartmentAndType(
      supabase,
      apartmentId,
      type
    );

    if (!protocol) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Protokół nie został jeszcze utworzony'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Return success
    return new Response(JSON.stringify(protocol), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('GET /api/apartments/:id/protocols/:type error:', error);

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

### Service Implementation
```typescript
// src/lib/services/protocolService.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type { ProtocolDTO, ProtocolPhotoDTO } from '@/types';

export async function getProtocolByApartmentAndType(
  supabase: SupabaseClient,
  apartmentId: string,
  type: 'move_in' | 'move_out'
): Promise<ProtocolDTO | null> {
  // Get active lease for apartment
  const { data: lease, error: leaseError } = await supabase
    .from('leases')
    .select('id')
    .eq('apartment_id', apartmentId)
    .eq('status', 'active')
    .single();

  if (leaseError || !lease) {
    return null;
  }

  // Get protocol
  const { data: protocol, error: protocolError } = await supabase
    .from('protocols')
    .select('*')
    .eq('lease_id', lease.id)
    .eq('type', type)
    .single();

  if (protocolError || !protocol) {
    return null;
  }

  // Get photos
  const { data: photos, error: photosError } = await supabase
    .from('protocol_photos')
    .select('*')
    .eq('protocol_id', protocol.id)
    .order('uploaded_at', { ascending: true });

  if (photosError) {
    throw photosError;
  }

  // Generate signed URLs
  const photosWithUrls: ProtocolPhotoDTO[] = await Promise.all(
    (photos || []).map(async (photo) => {
      try {
        const { data: signedUrlData } = await supabase.storage
          .from('protocol-photos')
          .createSignedUrl(photo.file_path, 3600); // 1 hour

        return {
          id: photo.id,
          protocol_id: photo.protocol_id,
          file_path: photo.file_path,
          file_url: signedUrlData?.signedUrl || '',
          uploaded_at: photo.uploaded_at
        };
      } catch (error) {
        console.error('Failed to generate signed URL for photo:', photo.id, error);
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

  // Map to DTO (omit created_by)
  const protocolDTO: ProtocolDTO = {
    id: protocol.id,
    lease_id: protocol.lease_id,
    type: protocol.type,
    description: protocol.description,
    created_at: protocol.created_at,
    updated_at: protocol.updated_at,
    photos: photosWithUrls
  };

  return protocolDTO;
}
```

## 11. Checklisty

### Pre-Implementation Checklist
- [ ] Zapoznanie z API plan (sekcja 4.7 Protocol Management)
- [ ] Zapoznanie z DB plan (tabele protocols, protocol_photos)
- [ ] Zapoznanie z types.ts (ProtocolDTO, ProtocolPhotoDTO)
- [ ] Weryfikacja RLS policies dla protocols i protocol_photos
- [ ] Weryfikacja Storage RLS policies dla bucket protocol-photos

### Implementation Checklist
- [ ] Utworzenie pliku API route
- [ ] Implementacja walidacji parametrów (Zod)
- [ ] Implementacja autoryzacji (user check)
- [ ] Utworzenie/aktualizacja protocol service
- [ ] Implementacja pobierania protokołu
- [ ] Implementacja pobierania zdjęć
- [ ] Implementacja generowania signed URLs
- [ ] Implementacja mapowania do DTO
- [ ] Implementacja obsługi błędów
- [ ] Dodanie logowania błędów
- [ ] Testy jednostkowe serwisu
- [ ] Testy integracyjne endpointu

### Testing Checklist
- [ ] Test: Owner może pobrać protokół swojego mieszkania
- [ ] Test: Tenant może pobrać protokół swojego aktywnego najmu
- [ ] Test: Unauthorized user otrzymuje 401
- [ ] Test: Invalid apartment ID → 400
- [ ] Test: Invalid protocol type → 400
- [ ] Test: Protocol not found → 404
- [ ] Test: No active lease → 404
- [ ] Test: Signed URLs są generowane poprawnie
- [ ] Test: Zdjęcia są sortowane po uploaded_at
- [ ] Test: created_by jest pomijane w response

### Post-Implementation Checklist
- [ ] Code review
- [ ] Dokumentacja JSDoc
- [ ] Update API documentation
- [ ] Deployment do staging
- [ ] Manual testing na staging
- [ ] Performance testing (response time < 500ms)
- [ ] Security audit (RLS, validation)
- [ ] Deployment do production
