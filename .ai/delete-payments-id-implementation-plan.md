# API Endpoint Implementation Plan: DELETE /api/payments/:id

## 1. Przegląd punktu końcowego

Endpoint służy do usuwania istniejącej płatności. Tylko właściciel mieszkania ma uprawnienia do usuwania wpłat. Jest to najprostszy endpoint w grupie zarządzania płatnościami.

**Cel biznesowy:** Umożliwienie właścicielowi usunięcia błędnie wprowadzonej lub duplikowanej wpłaty.

## 2. Szczegóły żądania

- **Metoda HTTP:** DELETE
- **Struktura URL:** `/api/payments/:id`
- **Parametry:**
  - **Wymagane:**
    - `id` (path parameter) - UUID identyfikujący płatność
  - **Opcjonalne:** brak
- **Request Body:** brak (DELETE request nie powinien mieć body)
- **Headers:**
  - `Authorization: Bearer <token>` (wymagane)

## 3. Wykorzystywane typy

### Typy z `src/types.ts`:

```typescript
// Brak specjalnych typów - DELETE zwraca tylko 204 No Content
```

### Typy z `src/db/database.types.ts`:

```typescript
// Wykorzystujemy tylko payments.id dla DELETE operation
```

### Dodatkowe typy walidacyjne (Zod):

```typescript
import { z } from 'zod';

// Walidacja path parameter
const paymentIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Nieprawidłowy identyfikator płatności' })
});
```

## 4. Szczegóły odpowiedzi

### Odpowiedź 204 (No Content):

```
(Pusta odpowiedź - brak body)
```

**Status:** 204 No Content
**Headers:** Brak Content-Type (no body)

### Odpowiedź 400 (Bad Request - Validation Error):

```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowy identyfikator płatności"
}
```

### Odpowiedź 401 (Unauthorized):

```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

### Odpowiedź 403 (Forbidden):

```json
{
  "error": "Forbidden",
  "message": "Nie masz uprawnień do usunięcia tej wpłaty"
}
```

### Odpowiedź 404 (Not Found):

```json
{
  "error": "Not Found",
  "message": "Płatność nie została znaleziona"
}
```

### Odpowiedź 500 (Internal Server Error):

```json
{
  "error": "Internal Server Error",
  "message": "Wystąpił błąd serwera"
}
```

## 5. Przepływ danych

```
1. Request arrives at DELETE /api/payments/:id
   ↓
2. Middleware weryfikuje JWT token (context.locals.user)
   ↓
3. Endpoint handler waliduje:
   - id (UUID)
   ↓
4. Service: deletePayment(id)
   ↓
5. Supabase DELETE:
   - DELETE FROM payments WHERE id = $1
   - RLS sprawdza uprawnienia:
     * Owner: EXISTS (payment -> charge -> lease -> apartment.owner_id = auth.uid())
   ↓
6. Zwrócenie 204 No Content (sukces) lub 404 (nie znaleziono)
```

### Interakcje z bazą danych:

**Query: DELETE płatności**
```sql
DELETE FROM payments
WHERE id = $1;
```

**Sprawdzenie rowCount:**
- Jeśli rowCount = 0: płatność nie istnieje lub user nie ma dostępu (RLS)
- Jeśli rowCount = 1: sukces, zwróć 204

### RLS Policies (automatyczne):

```sql
-- DELETE: Właściciele mogą usuwać wpłaty dla swoich mieszkań
CREATE POLICY "Owners can delete payments for their apartments"
  ON payments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM charges
      JOIN leases ON leases.id = charges.lease_id
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE charges.id = payments.charge_id
        AND apartments.owner_id = auth.uid()
    )
  );
```

### Uwagi implementacyjne:

1. **Nie ma CASCADE DELETE:** Płatności nie mają zależności (foreign keys), więc usunięcie jest proste
2. **Soft delete:** W MVP implementujemy hard delete (fizyczne usunięcie z bazy)
3. **Audyt:** Jeśli potrzebny audyt trail, rozważyć soft delete (kolumna deleted_at) w przyszłości

## 6. Względy bezpieczeństwa

### Uwierzytelnianie:
- **JWT Token:** Wymagany w header `Authorization: Bearer <token>`
- **Middleware:** Astro middleware weryfikuje token i ustawia `context.locals.user`
- **Brak tokenu:** 401 Unauthorized

### Autoryzacja (RLS):
- **Owner only:** Tylko właściciel mieszkania może usuwać wpłaty
- **RLS policy:** Automatycznie blokuje DELETE jeśli user nie jest ownerem
- **Tenant nie może:** Lokatorzy NIE mogą usuwać wpłat (read-only)

### Walidacja danych wejściowych:
- **id:** UUID validation przez Zod
- **SQL Injection:** Zapobiegane przez Supabase prepared statements

### Ochrona przed nadużyciami:
- Rate limiting (Supabase built-in)
- Nie można usunąć cudzych wpłat (RLS)
- Brak możliwości bulk delete w MVP (tylko pojedyncze)

### Brak rollback:
- DELETE jest operacją nieodwracalną
- W production: rozważyć soft delete dla możliwości przywrócenia
- Ewentualnie: confirmation prompt w UI

## 7. Obsługa błędów

### Potencjalne błędy i obsługa:

| Scenariusz | Kod HTTP | Error Type | Message | Obsługa |
|------------|----------|------------|---------|---------|
| Brak tokenu JWT | 401 | Unauthorized | "Brak autoryzacji" | Early return |
| Nieprawidłowy id | 400 | Validation Error | "Nieprawidłowy identyfikator płatności" | Zod validation |
| Payment nie istnieje | 404 | Not Found | "Płatność nie została znaleziona" | Sprawdzenie rowCount = 0 |
| User nie jest ownerem | 403 | Forbidden | "Nie masz uprawnień do usunięcia tej wpłaty" | RLS policy (rowCount = 0) |
| Błąd bazy danych | 500 | Internal Server Error | "Wystąpił błąd serwera" | Catch all |

### Rozróżnienie 404 vs 403:

W praktyce, RLS powoduje, że zarówno nieistniejący payment jak i payment bez dostępu zwracają rowCount = 0. Możemy:

**Opcja 1 (Prostsza):** Zawsze zwracać 404 jeśli rowCount = 0
```typescript
if (rowCount === 0) {
  return 404 // "Płatność nie została znaleziona"
}
```

**Opcja 2 (Bardziej szczegółowa):** Najpierw sprawdzić, czy payment istnieje (bez RLS), potem pozwolić RLS zablokować
```typescript
// Query 1: Sprawdź istnienie (service role)
const exists = await checkPaymentExists(id);
if (!exists) return 404;

// Query 2: Usuń (z RLS)
const result = await deletePayment(id);
if (result.rowCount === 0) return 403;
```

**Rekomendacja dla MVP:** Opcja 1 (prostsza), nie ujawniamy informacji o istnieniu zasobów bez dostępu.

### Strategia obsługi błędów:

```typescript
try {
  // 1. Walidacja parametrów
  const { id } = paymentIdParamSchema.parse(context.params);

  // 2. Wywołanie service
  const deleted = await deletePayment(supabase, id);

  // 3. Sprawdzenie, czy payment został usunięty
  if (!deleted) {
    return new Response(
      JSON.stringify({
        error: 'Not Found',
        message: 'Płatność nie została znaleziona'
      }),
      { status: 404 }
    );
  }

  // 4. Zwrócenie 204 No Content
  return new Response(null, { status: 204 });

} catch (error) {
  // Zod validation errors
  if (error instanceof z.ZodError) {
    return new Response(
      JSON.stringify({
        error: 'Validation Error',
        message: error.errors[0].message
      }),
      { status: 400 }
    );
  }

  // RLS policy violation (rzadkie, bo zwykle rowCount = 0)
  if (error instanceof Error && (
    error.message.includes('policy') ||
    error.message.includes('permission denied')
  )) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Nie masz uprawnień do usunięcia tej wpłaty'
      }),
      { status: 403 }
    );
  }

  // Logowanie błędu
  console.error('Error in DELETE /api/payments/:id:', error);

  // Zwrócenie błędu 500
  return new Response(
    JSON.stringify({
      error: 'Internal Server Error',
      message: 'Wystąpił błąd serwera'
    }),
    { status: 500 }
  );
}
```

### Logowanie:
- Wszystkie DELETE operations logowane do info (audit trail)
- Błędy 500 logowane do console.error
- W production: structured logging z user_id, payment_id, timestamp

## 8. Rozważania dotyczące wydajności

### Potencjalne wąskie gardła:

1. **RLS policy z JOINami:**
   - RLS używa EXISTS z payments -> charges -> leases -> apartments
   - Mitigation: Indeksy FK już istnieją

2. **CASCADE effects:**
   - Payments nie mają dependent records, więc brak cascade
   - DELETE jest prostą operacją single-row

### Strategie optymalizacji:

1. **Single query DELETE:**
   - Nie potrzeba dodatkowych queries (check existence)
   - Polegać na rowCount dla określenia sukcesu

2. **Database indexes:**
   - Index na `payments.id` (PK) - domyślny, bardzo szybki

3. **Brak soft delete w MVP:**
   - Hard delete jest szybszy niż UPDATE (soft delete)
   - W przyszłości: rozważyć soft delete dla audytu

### Monitoring:

- Monitorować frequency DELETE operations
- Alert jeśli zbyt wiele DELETE w krótkim czasie (możliwe nadużycie)
- W production: audit log dla compliance

## 9. Etapy wdrożenia

### Krok 1: Rozszerzenie service `payment.service.ts`

**Lokalizacja:** `src/lib/services/payment.service.ts`

```typescript
import type { SupabaseClient } from '@/db/supabase.client';

/**
 * Usuwa płatność
 *
 * @returns true jeśli usunięto, false jeśli nie znaleziono lub brak dostępu
 * @throws Error jeśli wystąpił błąd bazy danych
 */
export async function deletePayment(
  supabase: SupabaseClient,
  id: string
): Promise<boolean> {
  const { error, count } = await supabase
    .from('payments')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) {
    console.error('Error deleting payment:', error);
    throw error;
  }

  // count === 0 oznacza, że payment nie istnieje lub RLS zablokował dostęp
  return count !== null && count > 0;
}
```

### Krok 2: Rozszerzenie Zod schemas

**Lokalizacja:** `src/lib/validations/payment.validation.ts`

```typescript
import { z } from 'zod';

// Ten sam schema co dla PATCH
export const paymentIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Nieprawidłowy identyfikator płatności' })
});
```

### Krok 3: Rozszerzenie endpoint handler

**Lokalizacja:** `src/pages/api/payments/[id].ts`

```typescript
import type { APIContext } from 'astro';
import { z } from 'zod';
import { updatePayment, deletePayment } from '@/lib/services/payment.service';
import { paymentIdParamSchema, updatePaymentSchema } from '@/lib/validations/payment.validation';

export const prerender = false;

// ... PATCH handler z poprzedniego planu ...

export async function DELETE(context: APIContext): Promise<Response> {
  // 1. Sprawdzenie uwierzytelnienia
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

  const supabase = context.locals.supabase;

  try {
    // 2. Walidacja parametrów
    const { id } = paymentIdParamSchema.parse(context.params);

    // 3. Usunięcie płatności (RLS sprawdzi uprawnienia)
    const deleted = await deletePayment(supabase, id);

    // 4. Sprawdzenie, czy payment został usunięty
    if (!deleted) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Płatność nie została znaleziona'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Zwrócenie 204 No Content (sukces)
    return new Response(null, { status: 204 });

  } catch (error) {
    // Obsługa błędów walidacji Zod
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: error.errors[0].message
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Obsługa RLS policy violation (rzadkie)
    if (error instanceof Error && (
      error.message.includes('policy') ||
      error.message.includes('permission denied')
    )) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: 'Nie masz uprawnień do usunięcia tej wpłaty'
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Logowanie błędu
    console.error('Error in DELETE /api/payments/:id:', error);

    // Zwrócenie błędu 500
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

### Krok 4: Testowanie

**Testy manualne:**

1. **Test pozytywny (Owner usuwa wpłatę):**
   ```bash
   curl -X DELETE http://localhost:4321/api/payments/{id} \
     -H "Authorization: Bearer {owner-token}"
   ```
   Oczekiwany rezultat: 204 No Content (pusta odpowiedź)

2. **Test: Brak autoryzacji**
   ```bash
   curl -X DELETE http://localhost:4321/api/payments/{id}
   ```
   Oczekiwany rezultat: 401 Unauthorized

3. **Test: Tenant próbuje usunąć wpłatę (Forbidden/Not Found)**
   ```bash
   curl -X DELETE http://localhost:4321/api/payments/{id} \
     -H "Authorization: Bearer {tenant-token}"
   ```
   Oczekiwany rezultat: 404 Not Found (RLS zablokuje dostęp)

4. **Test: Nieprawidłowy UUID**
   ```bash
   curl -X DELETE http://localhost:4321/api/payments/invalid-uuid \
     -H "Authorization: Bearer {owner-token}"
   ```
   Oczekiwany rezultat: 400 Bad Request (Nieprawidłowy identyfikator płatności)

5. **Test: Payment nie istnieje**
   ```bash
   curl -X DELETE http://localhost:4321/api/payments/00000000-0000-0000-0000-000000000000 \
     -H "Authorization: Bearer {owner-token}"
   ```
   Oczekiwany rezultat: 404 Not Found

6. **Test: Owner innego mieszkania próbuje usunąć wpłatę**
   ```bash
   curl -X DELETE http://localhost:4321/api/payments/{id} \
     -H "Authorization: Bearer {other-owner-token}"
   ```
   Oczekiwany rezultat: 404 Not Found (RLS zablokuje)

7. **Test: Weryfikacja usunięcia (GET po DELETE)**
   ```bash
   # 1. DELETE
   curl -X DELETE http://localhost:4321/api/payments/{id} \
     -H "Authorization: Bearer {owner-token}"

   # 2. Próba GET
   curl -X GET http://localhost:4321/api/charges/{chargeId}/payments \
     -H "Authorization: Bearer {owner-token}"
   ```
   Oczekiwany rezultat: Payment nie powinien być na liście

**Testy automatyczne (opcjonalnie):**

```typescript
// tests/api/payments-delete.test.ts
describe('DELETE /api/payments/:id', () => {
  it('should delete payment for owner', async () => {
    // ...
  });

  it('should return 404 for non-existent payment', async () => {
    // ...
  });

  it('should reject tenant', async () => {
    // ...
  });

  it('should reject unauthorized request', async () => {
    // ...
  });
});
```

### Krok 5: Dokumentacja

- Zaktualizować API documentation
- Dodać komentarze JSDoc do funkcji deletePayment
- Udokumentować, że operacja jest nieodwracalna (hard delete)
- Ostrzeżenie w UI: "Czy na pewno chcesz usunąć tę wpłatę?"

### Krok 6: Code review

- Zgodność z zasadami z `claude.md`
- Weryfikacja, że zwracamy 204 No Content (nie 200)
- Sprawdzenie obsługi błędów
- Weryfikacja bezpieczeństwa (RLS)
- Test edge cases

### Krok 7: UI Considerations (opcjonalnie)

Chociaż to backend plan, warto zanotować dla frontend:

```typescript
// Przykład użycia w React
async function handleDeletePayment(paymentId: string) {
  // 1. Pokaż confirmation dialog
  const confirmed = window.confirm('Czy na pewno chcesz usunąć tę wpłatę?');
  if (!confirmed) return;

  // 2. DELETE request
  const response = await fetch(`/api/payments/${paymentId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  // 3. Obsługa odpowiedzi
  if (response.status === 204) {
    // Sukces - odśwież listę wpłat
    await refetchPayments();
    toast.success('Wpłata została usunięta');
  } else if (response.status === 404) {
    toast.error('Płatność nie została znaleziona');
  } else {
    toast.error('Wystąpił błąd podczas usuwania wpłaty');
  }
}
```

### Krok 8: Deployment

- Merge do main
- CI/CD pipeline
- Deploy do staging
- Testy smoke (DELETE + weryfikacja)
- Deploy do production
- Monitor DELETE operations frequency

---

## Podsumowanie

DELETE endpoint jest najprostszym z czterech endpointów zarządzania płatnościami. Kluczowe aspekty:

1. **Prostota:** Tylko walidacja UUID + DELETE query
2. **204 No Content:** Sukces zwraca pustą odpowiedź (nie 200)
3. **404 dla wszystkich:** Nie rozróżniamy "nie istnieje" vs "brak dostępu" (security)
4. **Hard delete:** Fizyczne usunięcie z bazy (nie soft delete w MVP)
5. **Autoryzacja:** Tylko owner może usuwać (RLS policy)
6. **Nieodwracalne:** Brak możliwości przywrócenia (confirmation w UI)

Endpoint jest prosty, ale wymaga starannej obsługi przypadku rowCount = 0 (404 vs 403) oraz zwracania prawidłowego status code 204.
