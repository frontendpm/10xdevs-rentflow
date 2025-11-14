# API Endpoint Implementation Plan: DELETE /api/apartments/:id

## 1. Przegląd punktu końcowego

Endpoint służy do usuwania mieszkania. Tylko właściciel może usunąć swoje mieszkanie. Usunięcie jest możliwe **tylko wtedy**, gdy mieszkanie nie ma żadnych najmów (ani aktywnych, ani archiwalnych). To ograniczenie jest wymuszane przez database trigger.

**Kluczowe cechy:**
- Dostępny tylko dla właściciela mieszkania
- **Blokada usunięcia** jeśli istnieją jakiekolwiek leases (active lub archived)
- Database trigger `prevent_apartment_deletion_with_leases` wymusza tę regułę
- RLS automatycznie zapewnia że user może usunąć tylko swoje mieszkania
- 204 No Content przy sukcesie (brak body w response)
- Cascade delete dla powiązanych invitation_links

## 2. Szczegóły żądania

- **Metoda HTTP:** DELETE
- **Struktura URL:** `/api/apartments/:id`
- **Parametry:**
  - **Wymagane:**
    - `id` (UUID) - path parameter, identyfikator mieszkania
  - **Opcjonalne:** brak
- **Request Body:** nie dotyczy (DELETE)
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagany)

## 3. Wykorzystywane typy

**Path Param Validation:**
```typescript
const ApartmentIdParamSchema = z.object({
  id: z.string().uuid('Nieprawidłowy identyfikator mieszkania')
});
```

**Response:**
- **Success:** 204 No Content (brak body)
- **Error:** Standard error DTO

## 4. Szczegóły odpowiedzi

### Success Response (204 No Content):
- **Status:** 204
- **Body:** Brak (empty response)
- **Headers:** Standard headers

### Error Responses:

**400 Bad Request (Has leases):**
```json
{
  "error": "Bad Request",
  "message": "Nie można usunąć mieszkania z istniejącymi najmami. Najpierw usuń wszystkie najmy."
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
  "message": "Nie masz uprawnień do usunięcia tego mieszkania"
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

3. **DELETE z bazy danych**
   ```sql
   DELETE FROM apartments
   WHERE id = $1
     AND owner_id = auth.uid()
   ```

   **Triggery wykonywane BEFORE DELETE:**
   ```sql
   -- Sprawdza czy mieszkanie ma jakiekolwiek leases
   CREATE TRIGGER prevent_apartment_deletion_with_leases
     BEFORE DELETE ON apartments
     FOR EACH ROW
     EXECUTE FUNCTION check_apartment_deletion();
   ```

   **Funkcja check_apartment_deletion():**
   ```sql
   -- Policz leases dla mieszkania
   SELECT COUNT(*) INTO lease_count
   FROM leases
   WHERE apartment_id = OLD.id;

   -- Jeśli > 0, rzuć wyjątek
   IF lease_count > 0 THEN
     RAISE EXCEPTION 'Cannot delete apartment with existing leases';
   END IF;
   ```

4. **Cascade deletes (automatyczne):**
   - `invitation_links` WHERE apartment_id = id (ON DELETE CASCADE)
   - Nie dotyczy `leases` - mają ON DELETE RESTRICT, ale trigger to obsługuje

5. **Sprawdzenie wyniku DELETE**
   - Supabase zwraca liczbę usuniętych rekordów
   - 0 rekordów → 404 Not Found (lub RLS blocked)
   - 1 rekord → 204 No Content

6. **Obsługa błędów triggera**
   - Jeśli trigger rzuci wyjątek → catch i return 400 Bad Request
   - Komunikat: "Nie można usunąć mieszkania z istniejącymi najmami..."

### RLS Security:

RLS policy zapewnia że:
```sql
CREATE POLICY "Owners can delete their apartments"
  ON apartments FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());
```

- User może DELETE tylko gdzie `owner_id = auth.uid()`
- Jeśli próbuje usunąć cudze mieszkanie → 0 rows affected → 404

### Business Logic Enforcement:

**Database Trigger (z db-plan.md):**
```sql
CREATE OR REPLACE FUNCTION check_apartment_deletion()
RETURNS TRIGGER AS $$
DECLARE
  lease_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO lease_count
  FROM leases
  WHERE apartment_id = OLD.id;

  IF lease_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete apartment with existing leases (active or archived). Please remove all leases first.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
```

## 6. Względy bezpieczeństwa

### Autoryzacja:
- **JWT token wymagany** - sprawdzenie przez middleware
- **RLS Policy** - automatyczne filtrowanie DELETE:
  - User może DELETE tylko gdzie `owner_id = auth.uid()`

### Business Rules:
- **Trigger-enforced constraint:**
  - Nie można usunąć mieszkania z najmami
  - Zapobiega utracie danych finansowych i historycznych

### Data Integrity:
- **Cascade deletes:**
  - `invitation_links` są automatycznie usuwane (ON DELETE CASCADE)
  - Bezpieczne - nieużyte zaproszenia mogą być usunięte

- **Restrict deletes:**
  - `leases` mają ON DELETE RESTRICT (zabezpieczenie backup)
  - Trigger dodatkowo sprawdza i blokuje

### 404 vs 403:
- **Wybór:** 404 zamiast 403 gdy user nie jest ownerem
- **Uzasadnienie:** Security by obscurity

## 7. Obsługa błędów

### Scenariusze błędów:

| Kod | Scenariusz | Response | Logging |
|-----|-----------|----------|---------|
| 400 | Invalid UUID | `{ "error": "Validation Error", "message": "Nieprawidłowy identyfikator mieszkania" }` | Info |
| 400 | Apartment has leases (trigger) | `{ "error": "Bad Request", "message": "Nie można usunąć mieszkania z istniejącymi najmami..." }` | Warning |
| 401 | Brak JWT | `{ "error": "Unauthorized", "message": "Brak autoryzacji" }` | Warning |
| 403 | Not owner (opcjonalne) | `{ "error": "Forbidden", "message": "Nie masz uprawnień do usunięcia tego mieszkania" }` | Warning |
| 404 | Apartment not found | `{ "error": "Not Found", "message": "Mieszkanie nie zostało znalezione" }` | Info |
| 404 | Not owner (RLS) | `{ "error": "Not Found", "message": "Mieszkanie nie zostało znalezione" }` | Warning |
| 500 | Database error | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` | Error |

### Rozpoznawanie błędu triggera:

Supabase zwraca PostgreSQL error z triggera. Musimy parsować error message:

```typescript
// Check if error is from trigger
if (
  error?.code === 'P0001' || // RAISE EXCEPTION code
  error?.message?.includes('Cannot delete apartment with existing leases')
) {
  return new Response(JSON.stringify({
    error: 'Bad Request',
    message: 'Nie można usunąć mieszkania z istniejącymi najmami. Najpierw usuń wszystkie najmy.'
  }), { status: 400 });
}
```

### Error handling pattern:
```typescript
try {
  const { id } = ApartmentIdParamSchema.parse(context.params);

  const { count, error } = await supabase
    .from('apartments')
    .delete()
    .eq('id', id)
    .select('*', { count: 'exact', head: true });

  if (error) {
    // Check for trigger error
    if (
      error.code === 'P0001' ||
      error.message?.includes('existing leases')
    ) {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'Nie można usunąć mieszkania z istniejącymi najmami. Najpierw usuń wszystkie najmy.'
      }), { status: 400 });
    }
    throw error;
  }

  if (count === 0) {
    return new Response(JSON.stringify({
      error: 'Not Found',
      message: 'Mieszkanie nie zostało znalezione'
    }), { status: 404 });
  }

  return new Response(null, { status: 204 });
} catch (error) {
  // Handle other errors
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje:

1. **Single DELETE query:**
   - Jedna operacja DELETE
   - Trigger wykonywany BEFORE DELETE

2. **Cascade deletes:**
   - Automatyczne usuwanie invitation_links
   - Brak dodatkowych queries

3. **Indeksy:**
   - Primary key index na `apartments.id`
   - `idx_apartments_owner_id` dla RLS
   - `idx_leases_apartment_id` dla trigger check

### Potencjalne problemy:

- **Trigger performance:**
  - COUNT(*) w triggerze może być wolne dla dużej liczby leases
  - MVP: akceptowalne (max kilka leases per apartment)
  - Post-MVP: rozważyć EXISTS zamiast COUNT

- **Cascade delete performance:**
  - Usuwanie invitation_links może być wolne jeśli dużo rekordów
  - MVP: akceptowalne (max kilka zaproszeń per apartment)

## 9. Etapy wdrożenia

### Krok 1: Reuse validation schema
```typescript
// src/lib/validation/apartments.validation.ts
// Używamy tego samego schema co GET/PATCH
export const ApartmentIdParamSchema = z.object({
  id: z.string().uuid('Nieprawidłowy identyfikator mieszkania')
});
```

### Krok 2: Rozszerzenie apartment service
```typescript
// src/lib/services/apartment.service.ts
import type { SupabaseClient } from '@/db/supabase.client';

export class ApartmentService {
  constructor(private supabase: SupabaseClient) {}

  async deleteApartment(apartmentId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from('apartments')
      .delete()
      .eq('id', apartmentId)
      .select('*', { count: 'exact', head: true });

    if (error) {
      // Check if error from trigger (has leases)
      if (
        error.code === 'P0001' ||
        error.message?.includes('existing leases')
      ) {
        throw new ApartmentHasLeasesError(
          'Nie można usunąć mieszkania z istniejącymi najmami. Najpierw usuń wszystkie najmy.'
        );
      }
      throw error;
    }

    // Return false if not found (404)
    return count !== null && count > 0;
  }
}
```

### Krok 3: Custom error type
```typescript
// src/lib/errors/index.ts
export class ApartmentHasLeasesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApartmentHasLeasesError';
  }
}
```

### Krok 4: Implementacja API route
```typescript
// src/pages/api/apartments/[id]/index.ts
import type { APIContext } from 'astro';
import { z } from 'zod';
import { ApartmentService } from '@/lib/services/apartment.service';
import { ApartmentIdParamSchema } from '@/lib/validation/apartments.validation';
import { ApartmentHasLeasesError } from '@/lib/errors';

export const prerender = false;

export async function DELETE(context: APIContext) {
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

    // 3. Delete apartment
    const apartmentService = new ApartmentService(context.locals.supabase);
    const deleted = await apartmentService.deleteApartment(id);

    // 4. Check if found and deleted
    if (!deleted) {
      return new Response(JSON.stringify({
        error: 'Not Found',
        message: 'Mieszkanie nie zostało znalezione'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 5. Return success (no content)
    return new Response(null, {
      status: 204
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({
        error: 'Validation Error',
        message: 'Nieprawidłowy identyfikator mieszkania'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (error instanceof ApartmentHasLeasesError) {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: error.message
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.error('DELETE /api/apartments/:id error:', {
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

### Krok 5: Weryfikacja database trigger

Upewnij się że trigger istnieje (powinien być w migration):

```sql
-- Function
CREATE OR REPLACE FUNCTION check_apartment_deletion()
RETURNS TRIGGER AS $$
DECLARE
  lease_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO lease_count
  FROM leases
  WHERE apartment_id = OLD.id;

  IF lease_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete apartment with existing leases (active or archived). Please remove all leases first.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger
CREATE TRIGGER prevent_apartment_deletion_with_leases
  BEFORE DELETE ON apartments
  FOR EACH ROW
  EXECUTE FUNCTION check_apartment_deletion();
```

### Krok 6: Testy
1. **Test happy path:**
   - Owner usuwa swoje mieszkanie bez leases → 204
   - Weryfikacja że rekord usunięty z bazy
   - Weryfikacja że invitation_links usunięte (cascade)

2. **Test business rules:**
   - Owner próbuje usunąć mieszkanie z active lease → 400
   - Owner próbuje usunąć mieszkanie z archived lease → 400
   - Weryfikacja komunikatu błędu

3. **Test autoryzacji:**
   - Brak tokenu → 401
   - Owner próbuje usunąć cudze mieszkanie → 404
   - Tenant próbuje usunąć mieszkanie → 404

4. **Test walidacji:**
   - Invalid UUID → 400
   - Nieistniejący UUID → 404

5. **Test cascade:**
   - Weryfikacja że invitation_links są usuwane
   - Weryfikacja że leases NIE są usuwane (trigger blokuje)

6. **Test RLS:**
   - Weryfikacja że RLS blokuje DELETE cudzych mieszkań

### Krok 7: Dokumentacja
1. JSDoc dla deleteApartment method
2. Komentarze w kodzie dla trigger error handling
3. Ostrzeżenie w API docs o business constraint

---

**Priorytet:** Niski (rzadko używana funkcja, opcjonalna)
**Szacowany czas:** 3-4 godziny
**Zależności:**
- Middleware autoryzacji
- Database trigger (migracja)
- Custom error types
- Validation schemas

**UWAGA:** Przed implementacją upewnij się że database trigger jest zaimplementowany w migracji!
