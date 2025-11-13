# API Endpoint Implementation Plan: PATCH /api/apartments/:id

## 1. Przegląd punktu końcowego

Endpoint służy do aktualizacji danych istniejącego mieszkania. Tylko właściciel mieszkania może je edytować. Umożliwia częściową aktualizację (partial update) - można zaktualizować tylko nazwę, tylko adres, lub oba pola.

**Kluczowe cechy:**
- Dostępny tylko dla właściciela mieszkania (owner_id = auth.uid())
- Partial update - wszystkie pola opcjonalne
- Automatyczna aktualizacja `updated_at` timestamp (via trigger)
- RLS automatycznie zapewnia że user może edytować tylko swoje mieszkania
- 404 jeśli mieszkanie nie istnieje lub user nie ma dostępu

## 2. Szczegóły żądania

- **Metoda HTTP:** PATCH
- **Struktura URL:** `/api/apartments/:id`
- **Parametry:**
  - **Wymagane:**
    - `id` (UUID) - path parameter, identyfikator mieszkania
  - **Opcjonalne:** brak
- **Request Body (wszystkie pola opcjonalne):**
  ```json
  {
    "name": "Mieszkanie na Woli",
    "address": "ul. Złota 44/10, Warszawa"
  }
  ```
  **Uwaga:** Przynajmniej jedno pole musi być podane.
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagany)
  - `Content-Type: application/json`

## 3. Wykorzystywane typy

**Command Model (Request):**
```typescript
export type UpdateApartmentCommand = Partial<
  Pick<TablesUpdate<'apartments'>, 'name' | 'address'>
>;
```

**DTO (Response):**
```typescript
// Zwracamy zaktualizowany rekord
type UpdateApartmentResponseDTO = Tables<'apartments'>;
```

**Validation Schema (Zod):**
```typescript
const UpdateApartmentSchema = z
  .object({
    name: z
      .string()
      .min(3, 'Nazwa musi mieć co najmniej 3 znaki')
      .max(100, 'Nazwa nie może przekraczać 100 znaków')
      .trim()
      .optional(),
    address: z
      .string()
      .min(5, 'Adres musi mieć co najmniej 5 znaków')
      .max(200, 'Adres nie może przekraczać 200 znaków')
      .trim()
      .optional()
  })
  .refine(
    (data) => data.name !== undefined || data.address !== undefined,
    {
      message: 'Należy podać przynajmniej jedno pole do aktualizacji'
    }
  );

const ApartmentIdParamSchema = z.object({
  id: z.string().uuid('Nieprawidłowy identyfikator mieszkania')
});
```

## 4. Szczegóły odpowiedzi

### Success Response (200 OK):
```json
{
  "id": "uuid",
  "name": "Mieszkanie na Woli",
  "address": "ul. Złota 44/10, Warszawa",
  "owner_id": "uuid",
  "created_at": "2025-01-12T10:00:00Z",
  "updated_at": "2025-01-12T11:00:00Z",
  "created_by": "uuid"
}
```

**Uwaga:** `updated_at` automatycznie aktualizowane przez database trigger.

### Error Responses:

**400 Bad Request (Validation Error):**
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowe dane",
  "details": {
    "name": "Nazwa musi mieć co najmniej 3 znaki"
  }
}
```

**400 Bad Request (No fields provided):**
```json
{
  "error": "Validation Error",
  "message": "Należy podać przynajmniej jedno pole do aktualizacji"
}
```

**400 Bad Request (Invalid UUID):**
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowy identyfikator mieszkania"
}
```

**401 Unauthorized:**
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

**403 Forbidden:**
```json
{
  "error": "Forbidden",
  "message": "Nie masz uprawnień do edycji tego mieszkania"
}
```

**404 Not Found:**
```json
{
  "error": "Not Found",
  "message": "Mieszkanie nie zostało znalezione"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal Server Error",
  "message": "Wystąpił błąd serwera"
}
```

## 5. Przepływ danych

### Szczegółowy flow:

1. **Pobranie użytkownika z context.locals**
   - Sprawdzenie czy `context.locals.user` istnieje
   - Jeśli nie → 401 Unauthorized

2. **Walidacja path parameter**
   - Parsowanie `context.params.id`
   - Walidacja UUID format
   - Jeśli błąd → 400 Bad Request

3. **Parsowanie request body**
   - Odczytanie JSON z `context.request.json()`
   - Jeśli błąd parsowania → 400 Bad Request

4. **Walidacja danych wejściowych**
   - Walidacja przez Zod schema
   - Sprawdzenie czy przynajmniej jedno pole podane
   - Jeśli błąd walidacji → 400 Bad Request

5. **Aktualizacja mieszkania**
   ```sql
   UPDATE apartments
   SET
     name = COALESCE($1, name),
     address = COALESCE($2, address)
   WHERE id = $3
     AND owner_id = auth.uid()
   RETURNING *
   ```

   **Ważne:**
   - RLS policy `USING (owner_id = auth.uid())` automatycznie filtruje
   - Używamy `COALESCE` aby zaktualizować tylko podane pola
   - Trigger automatycznie ustawia `updated_at = NOW()`

6. **Sprawdzenie czy zaktualizowano**
   - Jeśli brak wyników → 404 Not Found
   - RLS może zwrócić 0 wyników jeśli user nie jest ownerem

7. **Zwrócenie odpowiedzi**
   - Status 200 OK
   - Body: zaktualizowany rekord mieszkania

### RLS Security:

RLS policy zapewnia że:
```sql
CREATE POLICY "Owners can update their apartments"
  ON apartments FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
```

- `USING` - sprawdza czy user może SELECTować rekord (jest ownerem)
- `WITH CHECK` - sprawdza czy po UPDATE warunek nadal spełniony (owner_id nie zmienione)

## 6. Względy bezpieczeństwa

### Autoryzacja:
- **JWT token wymagany** - sprawdzenie przez middleware
- **RLS Policy** - automatyczne filtrowanie UPDATE:
  - User może UPDATE tylko gdzie `owner_id = auth.uid()`
  - Zapobiega edycji cudzych mieszkań

### Walidacja:
- **Input sanitization:**
  - `.trim()` dla name i address
  - Minimalna długość (3 dla name, 5 dla address)
  - Maksymalna długość (100 dla name, 200 dla address)

- **Partial update validation:**
  - Przynajmniej jedno pole musi być podane
  - Puste obiekty `{}` są odrzucane

### Prevented attacks:
- **SQL Injection** - Supabase prepared statements
- **Owner_id tampering** - owner_id NIE może być zmienione przez user (nie ma w UpdateApartmentCommand)
- **Privilege escalation** - RLS zapobiega edycji cudzych mieszkań

### 404 vs 403:
- **Wybór:** Zwracamy **404** zamiast **403** gdy mieszkanie nie istnieje lub user nie ma dostępu
- **Uzasadnienie:** Nie ujawniamy istnienia zasobu (security by obscurity)

## 7. Obsługa błędów

### Scenariusze błędów:

| Kod | Scenariusz | Response | Logging |
|-----|-----------|----------|---------|
| 400 | Invalid JSON body | `{ "error": "Bad Request", "message": "Nieprawidłowy format danych" }` | Warning |
| 400 | Invalid UUID | `{ "error": "Validation Error", "message": "Nieprawidłowy identyfikator mieszkania" }` | Info |
| 400 | Walidacja failed | `{ "error": "Validation Error", "message": "Nieprawidłowe dane", "details": {...} }` | Info |
| 400 | No fields provided | `{ "error": "Validation Error", "message": "Należy podać przynajmniej jedno pole do aktualizacji" }` | Info |
| 401 | Brak JWT | `{ "error": "Unauthorized", "message": "Brak autoryzacji" }` | Warning |
| 403 | Not owner (opcjonalne) | `{ "error": "Forbidden", "message": "Nie masz uprawnień do edycji tego mieszkania" }` | Warning |
| 404 | Apartment not found | `{ "error": "Not Found", "message": "Mieszkanie nie zostało znalezione" }` | Info |
| 404 | Not owner (via RLS) | `{ "error": "Not Found", "message": "Mieszkanie nie zostało znalezione" }` | Warning |
| 500 | Database error | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` | Error |

### Error handling pattern:
```typescript
try {
  // Validate path param
  const { id } = ApartmentIdParamSchema.parse(context.params);

  // Parse body
  const body = await context.request.json();

  // Validate body
  const validated = UpdateApartmentSchema.parse(body);

  // Update apartment
  const apartment = await apartmentService.updateApartment(id, validated);

  if (!apartment) {
    return new Response(JSON.stringify({
      error: 'Not Found',
      message: 'Mieszkanie nie zostało znalezione'
    }), { status: 404 });
  }

  return new Response(JSON.stringify(apartment), { status: 200 });
} catch (error) {
  // Handle validation, authorization, and database errors
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje:

1. **Single UPDATE z RETURNING:**
   - Jedna query zamiast SELECT + UPDATE
   - `RETURNING *` zwraca zaktualizowany rekord

2. **Partial update:**
   - Aktualizujemy tylko podane pola (COALESCE)
   - Unikamy nadpisywania wartości NULL

3. **Automatic timestamp:**
   - Trigger automatycznie ustawia `updated_at`
   - Brak dodatkowej logiki aplikacyjnej

4. **Indeksy:**
   - Primary key index na `id`
   - `idx_apartments_owner_id` dla RLS check

### Potencjalne problemy:

- **Concurrent updates:**
  - MVP: brak optimistic locking
  - Post-MVP: rozważyć `version` field lub `updated_at` check

- **Brak audit trail:**
  - MVP: brak historii zmian
  - Post-MVP: rozważyć audit log table

## 9. Etapy wdrożenia

### Krok 1: Utworzenie validation schema
```typescript
// src/lib/validation/apartments.validation.ts
import { z } from 'zod';

export const UpdateApartmentSchema = z
  .object({
    name: z
      .string()
      .min(3, 'Nazwa musi mieć co najmniej 3 znaki')
      .max(100, 'Nazwa nie może przekraczać 100 znaków')
      .trim()
      .optional(),
    address: z
      .string()
      .min(5, 'Adres musi mieć co najmniej 5 znaków')
      .max(200, 'Adres nie może przekraczać 200 znaków')
      .trim()
      .optional()
  })
  .refine(
    (data) => data.name !== undefined || data.address !== undefined,
    {
      message: 'Należy podać przynajmniej jedno pole do aktualizacji'
    }
  );

export const ApartmentIdParamSchema = z.object({
  id: z.string().uuid('Nieprawidłowy identyfikator mieszkania')
});
```

### Krok 2: Rozszerzenie apartment service
```typescript
// src/lib/services/apartment.service.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type { UpdateApartmentCommand } from '@/types';
import type { Tables } from '@/db/database.types';

export class ApartmentService {
  constructor(private supabase: SupabaseClient) {}

  async updateApartment(
    apartmentId: string,
    command: UpdateApartmentCommand
  ): Promise<Tables<'apartments'> | null> {
    // Budowanie update object (tylko podane pola)
    const updateData: Partial<Tables<'apartments'>> = {};
    if (command.name !== undefined) {
      updateData.name = command.name;
    }
    if (command.address !== undefined) {
      updateData.address = command.address;
    }

    // UPDATE z RETURNING
    const { data, error } = await this.supabase
      .from('apartments')
      .update(updateData)
      .eq('id', apartmentId)
      .select()
      .maybeSingle();

    if (error) {
      throw error;
    }

    // null jeśli nie znaleziono (404) lub brak dostępu (RLS)
    return data;
  }
}
```

### Krok 3: Implementacja API route
```typescript
// src/pages/api/apartments/[id]/index.ts
import type { APIContext } from 'astro';
import { z } from 'zod';
import { ApartmentService } from '@/lib/services/apartment.service';
import {
  UpdateApartmentSchema,
  ApartmentIdParamSchema
} from '@/lib/validation/apartments.validation';

export const prerender = false;

export async function PATCH(context: APIContext) {
  // 1. Check authorization
  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      message: 'Brak autoryzacji'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // 2. Validate path parameter
    const { id } = ApartmentIdParamSchema.parse(context.params);

    // 3. Parse request body
    const body = await context.request.json();

    // 4. Validate input
    const validated = UpdateApartmentSchema.parse(body);

    // 5. Update apartment
    const apartmentService = new ApartmentService(context.locals.supabase);
    const apartment = await apartmentService.updateApartment(id, validated);

    // 6. Check if found
    if (!apartment) {
      return new Response(JSON.stringify({
        error: 'Not Found',
        message: 'Mieszkanie nie zostało znalezione'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 7. Return response
    return new Response(JSON.stringify(apartment), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({
        error: 'Validation Error',
        message: 'Nieprawidłowe dane',
        details: error.flatten().fieldErrors
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.error('PATCH /api/apartments/:id error:', {
      userId: user.id,
      apartmentId: context.params.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Wystąpił błąd serwera'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

### Krok 4: Testy
1. **Test happy path:**
   - Update tylko name
   - Update tylko address
   - Update name + address
   - Weryfikacja że updated_at został zaktualizowany

2. **Test walidacji:**
   - Name < 3 znaki → 400
   - Address < 5 znaków → 400
   - Puste body `{}` → 400
   - Invalid UUID → 400
   - Invalid JSON → 400

3. **Test autoryzacji:**
   - Brak tokenu → 401
   - Owner edytuje swoje mieszkanie → 200
   - Owner próbuje edytować cudze mieszkanie → 404
   - Tenant próbuje edytować mieszkanie → 404

4. **Test RLS:**
   - Weryfikacja że RLS blokuje UPDATE cudzych mieszkań
   - Weryfikacja że owner_id nie może być zmienione

5. **Test 404:**
   - Nieistniejący UUID → 404
   - Cudze mieszkanie → 404 (nie 403)

### Krok 5: Dokumentacja
1. JSDoc dla updateApartment method
2. Komentarze w kodzie dla partial update logic
3. Przykłady request/response

---

**Priorytet:** Średni (opcjonalna funkcja, rzadko używana)
**Szacowany czas:** 3-4 godziny
**Zależności:**
- Middleware autoryzacji
- GET /api/apartments/:id (podobna logika)
- Typy DTO
- Validation schemas
