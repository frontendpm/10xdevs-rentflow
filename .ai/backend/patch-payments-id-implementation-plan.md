# API Endpoint Implementation Plan: PATCH /api/payments/:id

## 1. Przegląd punktu końcowego

Endpoint służy do aktualizacji istniejącej płatności. Tylko właściciel mieszkania ma uprawnienia do edycji wpłat. Umożliwia zmianę kwoty wpłaty i/lub daty wpłaty, z walidacją, że suma wszystkich wpłat (po aktualizacji) nie przekroczy kwoty opłaty.

**Cel biznesowy:** Umożliwienie właścicielowi korekty błędnie wprowadzonych wpłat (np. pomyłka w kwocie lub dacie).

## 2. Szczegóły żądania

- **Metoda HTTP:** PATCH
- **Struktura URL:** `/api/payments/:id`
- **Parametry:**
  - **Wymagane:**
    - `id` (path parameter) - UUID identyfikujący płatność
  - **Opcjonalne (body):**
    - `amount` - nowa kwota wpłaty (number > 0)
    - `payment_date` - nowa data wpłaty (ISO 8601 date string)
    - **Uwaga:** Przynajmniej jedno pole musi być podane
- **Request Body:**
  ```json
  {
    "amount": 1200.00,
    "payment_date": "2025-01-06"
  }
  ```
  lub tylko jedno pole:
  ```json
  {
    "amount": 1200.00
  }
  ```
- **Headers:**
  - `Authorization: Bearer <token>` (wymagane)
  - `Content-Type: application/json` (wymagane)

## 3. Wykorzystywane typy

### Typy z `src/types.ts`:

```typescript
// Request body
export type UpdatePaymentCommand = Partial<Pick<TablesUpdate<'payments'>, 'amount' | 'payment_date'>>;

// Response DTO
export type PaymentDTO = Tables<'payments'>;
```

### Typy z `src/db/database.types.ts`:

```typescript
TablesUpdate<'payments'> zawiera:
- amount?: number
- payment_date?: string (date)
- updated_at?: string (timestamptz) - automatycznie ustawiane przez trigger

Tables<'payments'> zawiera (response):
- id: string (UUID)
- charge_id: string (UUID)
- amount: number
- payment_date: string (date)
- created_at: string (timestamptz)
- updated_at: string (timestamptz)
- created_by: string (UUID)
```

### Dodatkowe typy walidacyjne (Zod):

```typescript
import { z } from 'zod';

// Walidacja path parameter
const paymentIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Nieprawidłowy identyfikator płatności' })
});

// Walidacja request body
const updatePaymentSchema = z
  .object({
    amount: z
      .number()
      .positive({ message: 'Kwota musi być większa od 0' })
      .multipleOf(0.01, { message: 'Kwota może mieć maksymalnie 2 miejsca po przecinku' })
      .optional(),
    payment_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data wpłaty musi być w formacie YYYY-MM-DD' })
      .refine((date) => !isNaN(Date.parse(date)), {
        message: 'Nieprawidłowa data wpłaty'
      })
      .optional()
  })
  .refine((data) => data.amount !== undefined || data.payment_date !== undefined, {
    message: 'Należy podać przynajmniej jedno pole do aktualizacji (amount lub payment_date)'
  });
```

## 4. Szczegóły odpowiedzi

### Odpowiedź 200 (OK):

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "charge_id": "123e4567-e89b-12d3-a456-426614174000",
  "amount": 1200.00,
  "payment_date": "2025-01-06",
  "created_at": "2025-01-05T15:00:00Z",
  "updated_at": "2025-01-12T10:00:00Z",
  "created_by": "user-uuid"
}
```

### Odpowiedź 400 (Bad Request - Validation Error):

```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowe dane",
  "details": {
    "amount": "Kwota musi być większa od 0"
  }
}
```

### Odpowiedź 400 (Bad Request - No Fields):

```json
{
  "error": "Validation Error",
  "message": "Należy podać przynajmniej jedno pole do aktualizacji (amount lub payment_date)"
}
```

### Odpowiedź 400 (Bad Request - Business Rule Violation):

```json
{
  "error": "Bad Request",
  "message": "Suma wpłat (2500.00 zł) nie może przekroczyć kwoty opłaty (2000.00 zł)"
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
  "message": "Nie masz uprawnień do edycji tej wpłaty"
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
1. Request arrives at PATCH /api/payments/:id
   ↓
2. Middleware weryfikuje JWT token (context.locals.user)
   ↓
3. Endpoint handler waliduje:
   - id (UUID)
   - Request body (amount?, payment_date?)
   - Przynajmniej jedno pole musi być podane
   ↓
4. Service: updatePayment(id, data)
   ↓
5. Supabase UPDATE:
   - UPDATE payments SET ... WHERE id = $1
   - RLS sprawdza uprawnienia:
     * Owner: EXISTS (payment -> charge -> lease -> apartment.owner_id = auth.uid())
   - DB trigger check_payment_sum weryfikuje, że suma <= charge.amount
   - DB trigger update_updated_at_column ustawia updated_at
   ↓
6. Zwrócenie zaktualizowanej płatności (PaymentDTO)
```

### Interakcje z bazą danych:

**Query 1: UPDATE płatności**
```sql
UPDATE payments
SET
  amount = COALESCE($2, amount),
  payment_date = COALESCE($3, payment_date)
WHERE id = $1
RETURNING *;
```

### Database Trigger (automatyczny):

Z `db-plan.md`, trigger `check_payment_sum` (działa też dla UPDATE):

```sql
CREATE OR REPLACE FUNCTION check_payment_sum()
RETURNS TRIGGER AS $$
DECLARE
  charge_amount NUMERIC(10, 2);
  current_payments NUMERIC(10, 2);
  new_total NUMERIC(10, 2);
BEGIN
  -- Pobierz kwotę opłaty
  SELECT amount INTO charge_amount
  FROM charges
  WHERE id = NEW.charge_id;

  -- Oblicz aktualną sumę wpłat (bez tej edytowanej)
  SELECT COALESCE(SUM(amount), 0)
  INTO current_payments
  FROM payments
  WHERE charge_id = NEW.charge_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

  -- Oblicz nową sumę
  new_total := current_payments + NEW.amount;

  -- Sprawdź czy suma nie przekracza kwoty opłaty
  IF new_total > charge_amount THEN
    RAISE EXCEPTION 'Total payments (%) cannot exceed charge amount (%)',
      new_total, charge_amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_payment_sum_update
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION check_payment_sum();
```

Oraz trigger `update_updated_at_column`:

```sql
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### RLS Policies (automatyczne):

```sql
-- UPDATE: Właściciele mogą edytować wpłaty dla swoich mieszkań
CREATE POLICY "Owners can update payments for their apartments"
  ON payments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM charges
      JOIN leases ON leases.id = charges.lease_id
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE charges.id = payments.charge_id
        AND apartments.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM charges
      JOIN leases ON leases.id = charges.lease_id
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE charges.id = payments.charge_id
        AND apartments.owner_id = auth.uid()
    )
  );
```

## 6. Względy bezpieczeństwa

### Uwierzytelnianie:
- **JWT Token:** Wymagany w header `Authorization: Bearer <token>`
- **Middleware:** Astro middleware weryfikuje token i ustawia `context.locals.user`
- **Brak tokenu:** 401 Unauthorized

### Autoryzacja (RLS):
- **Owner only:** Tylko właściciel mieszkania może edytować wpłaty
- **RLS policy:** Automatycznie blokuje UPDATE jeśli user nie jest ownerem
- **Tenant nie może:** Lokatorzy NIE mogą edytować wpłat (read-only)

### Walidacja danych wejściowych:
- **id:** UUID validation przez Zod
- **amount:** Jeśli podane, musi być liczba dodatnia, max 2 miejsca po przecinku
- **payment_date:** Jeśli podane, ISO 8601 date string (YYYY-MM-DD)
- **Przynajmniej jedno pole:** Zod refine sprawdza, że podano amount lub payment_date
- **SQL Injection:** Zapobiegane przez Supabase prepared statements

### Business Rules Validation:
- **Suma wpłat <= charge.amount:** Wymuszane przez DB trigger `check_payment_sum`
- **Payment musi istnieć:** RLS zwróci 0 rows jeśli payment nie istnieje lub user nie ma dostępu
- **updated_at:** Automatycznie ustawiane przez trigger

### Ochrona przed nadużyciami:
- Rate limiting (Supabase built-in)
- Nie można edytować wpłaty tak, aby suma przekroczyła remaining amount
- Nie można edytować cudzych wpłat (RLS)

## 7. Obsługa błędów

### Potencjalne błędy i obsługa:

| Scenariusz | Kod HTTP | Error Type | Message | Obsługa |
|------------|----------|------------|---------|---------|
| Brak tokenu JWT | 401 | Unauthorized | "Brak autoryzacji" | Early return |
| Nieprawidłowy id | 400 | Validation Error | "Nieprawidłowy identyfikator płatności" | Zod validation |
| Brak pól do update | 400 | Validation Error | "Należy podać przynajmniej jedno pole..." | Zod refine |
| amount <= 0 | 400 | Validation Error | "Kwota musi być większa od 0" | Zod validation |
| Nieprawidłowa payment_date | 400 | Validation Error | "Nieprawidłowa data wpłaty" | Zod validation |
| Payment nie istnieje | 404 | Not Found | "Płatność nie została znaleziona" | Sprawdzenie rowCount po UPDATE |
| Suma wpłat > charge.amount | 400 | Bad Request | "Suma wpłat (X zł) nie może przekroczyć kwoty opłaty (Y zł)" | DB trigger exception |
| User nie jest ownerem | 403 | Forbidden | "Nie masz uprawnień do edycji tej wpłaty" | RLS policy (0 rows updated) |
| Błąd bazy danych | 500 | Internal Server Error | "Wystąpił błąd serwera" | Catch all |

### Strategia obsługi błędów:

```typescript
try {
  // 1. Walidacja parametrów
  const { id } = paymentIdParamSchema.parse(context.params);
  const updateData = updatePaymentSchema.parse(await context.request.json());

  // 2. Wywołanie service
  const payment = await updatePayment(supabase, id, updateData);

  // 3. Sprawdzenie, czy payment został znaleziony i zaktualizowany
  if (!payment) {
    return new Response(
      JSON.stringify({
        error: 'Not Found',
        message: 'Płatność nie została znaleziona'
      }),
      { status: 404 }
    );
  }

  // 4. Zwrócenie zaktualizowanej płatności
  return new Response(JSON.stringify(payment), { status: 200 });

} catch (error) {
  // Zod validation errors
  if (error instanceof z.ZodError) {
    return new Response(
      JSON.stringify({
        error: 'Validation Error',
        message: 'Nieprawidłowe dane',
        details: error.flatten().fieldErrors
      }),
      { status: 400 }
    );
  }

  // Database trigger error (suma wpłat przekracza kwotę)
  if (error instanceof Error && error.message.includes('Total payments')) {
    const match = error.message.match(/Total payments \(([\d.]+)\) cannot exceed charge amount \(([\d.]+)\)/);
    if (match) {
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: `Suma wpłat (${match[1]} zł) nie może przekroczyć kwoty opłaty (${match[2]} zł)`
        }),
        { status: 400 }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        message: 'Suma wpłat nie może przekroczyć kwoty opłaty'
      }),
      { status: 400 }
    );
  }

  // RLS policy violation
  if (error instanceof Error && (
    error.message.includes('policy') ||
    error.message.includes('permission denied')
  )) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Nie masz uprawnień do edycji tej wpłaty'
      }),
      { status: 403 }
    );
  }

  // Logowanie błędu
  console.error('Error in PATCH /api/payments/:id:', error);

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
- Wszystkie błędy 500 logowane do console.error
- Błędy DB trigger (business rules) logowane jako warning
- W production: Sentry lub podobne narzędzie

## 8. Rozważania dotyczące wydajności

### Potencjalne wąskie gardła:

1. **DB trigger `check_payment_sum`:**
   - Wykonuje query SUM przy każdym UPDATE
   - Prawdopodobieństwo: Niskie obciążenie (rzadka operacja)

2. **RLS policy z JOINami:**
   - RLS używa EXISTS z payments -> charges -> leases -> apartments
   - Mitigation: Indeksy FK już istnieją

### Strategie optymalizacji:

1. **Nie implementować dodatkowej walidacji w aplikacji:**
   - Polegać na DB trigger (single source of truth)
   - Oszczędza dodatkowe query

2. **Database indexes:**
   - Index na `payments.id` (PK) - domyślny
   - Index na `payments.charge_id` (FK) - już istnieje

### Monitoring:

- Monitorować frequency i latency UPDATE operations
- Sprawdzać, czy DB trigger nie powoduje performance issues
- Alert jeśli error rate > threshold

## 9. Etapy wdrożenia

### Krok 1: Rozszerzenie service `payment.service.ts`

**Lokalizacja:** `src/lib/services/payment.service.ts`

```typescript
import type { SupabaseClient } from '@/db/supabase.client';
import type { PaymentDTO, UpdatePaymentCommand } from '@/types';

/**
 * Aktualizuje istniejącą płatność
 *
 * @returns Zaktualizowana płatność lub null jeśli nie znaleziono
 * @throws Error jeśli suma wpłat przekroczy kwotę opłaty (DB trigger)
 * @throws Error jeśli user nie ma uprawnień (RLS policy)
 */
export async function updatePayment(
  supabase: SupabaseClient,
  id: string,
  data: UpdatePaymentCommand
): Promise<PaymentDTO | null> {
  const { data: payment, error } = await supabase
    .from('payments')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    // Jeśli payment nie istnieje lub user nie ma dostępu (RLS)
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }

    console.error('Error updating payment:', error);
    throw error;
  }

  return payment;
}
```

### Krok 2: Rozszerzenie Zod schemas

**Lokalizacja:** `src/lib/validations/payment.validation.ts`

```typescript
import { z } from 'zod';

export const paymentIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Nieprawidłowy identyfikator płatności' })
});

export const updatePaymentSchema = z
  .object({
    amount: z
      .number()
      .positive({ message: 'Kwota musi być większa od 0' })
      .multipleOf(0.01, { message: 'Kwota może mieć maksymalnie 2 miejsca po przecinku' })
      .optional(),
    payment_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data wpłaty musi być w formacie YYYY-MM-DD' })
      .refine((date) => !isNaN(Date.parse(date)), {
        message: 'Nieprawidłowa data wpłaty'
      })
      .optional()
  })
  .refine((data) => data.amount !== undefined || data.payment_date !== undefined, {
    message: 'Należy podać przynajmniej jedno pole do aktualizacji (amount lub payment_date)'
  });

export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
```

### Krok 3: Utworzenie endpoint handler

**Lokalizacja:** `src/pages/api/payments/[id].ts`

```typescript
import type { APIContext } from 'astro';
import { z } from 'zod';
import { updatePayment, deletePayment } from '@/lib/services/payment.service';
import { paymentIdParamSchema, updatePaymentSchema } from '@/lib/validations/payment.validation';

export const prerender = false;

export async function PATCH(context: APIContext): Promise<Response> {
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

    // 3. Parsowanie i walidacja request body
    const requestBody = await context.request.json();
    const updateData = updatePaymentSchema.parse(requestBody);

    // 4. Aktualizacja płatności (RLS i DB trigger sprawdzą reguły)
    const payment = await updatePayment(supabase, id, updateData);

    // 5. Sprawdzenie, czy payment został znaleziony
    if (!payment) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Płatność nie została znaleziona'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. Zwrócenie zaktualizowanej płatności
    return new Response(JSON.stringify(payment), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Obsługa błędów walidacji Zod
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Nieprawidłowe dane',
          details: error.flatten().fieldErrors
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Obsługa błędu DB trigger (suma wpłat przekracza kwotę)
    if (error instanceof Error && error.message.includes('Total payments')) {
      const match = error.message.match(/Total payments \(([\d.]+)\) cannot exceed charge amount \(([\d.]+)\)/);
      if (match) {
        return new Response(
          JSON.stringify({
            error: 'Bad Request',
            message: `Suma wpłat (${match[1]} zł) nie może przekroczyć kwoty opłaty (${match[2]} zł)`
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'Suma wpłat nie może przekroczyć kwoty opłaty'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Obsługa RLS policy violation
    if (error instanceof Error && (
      error.message.includes('policy') ||
      error.message.includes('permission denied')
    )) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: 'Nie masz uprawnień do edycji tej wpłaty'
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Logowanie błędu
    console.error('Error in PATCH /api/payments/:id:', error);

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

// DELETE handler będzie dodany w osobnym planie
```

### Krok 4: Testowanie

**Testy manualne:**

1. **Test pozytywny (Owner aktualizuje kwotę):**
   ```bash
   curl -X PATCH http://localhost:4321/api/payments/{id} \
     -H "Authorization: Bearer {owner-token}" \
     -H "Content-Type: application/json" \
     -d '{"amount": 1200.00}'
   ```
   Oczekiwany rezultat: 200 OK + updated payment object

2. **Test pozytywny (Owner aktualizuje datę):**
   ```bash
   curl -X PATCH http://localhost:4321/api/payments/{id} \
     -H "Authorization: Bearer {owner-token}" \
     -H "Content-Type: application/json" \
     -d '{"payment_date": "2025-01-06"}'
   ```
   Oczekiwany rezultat: 200 OK + updated payment object

3. **Test pozytywny (Owner aktualizuje oba pola):**
   ```bash
   curl -X PATCH http://localhost:4321/api/payments/{id} \
     -H "Authorization: Bearer {owner-token}" \
     -H "Content-Type: application/json" \
     -d '{"amount": 1200.00, "payment_date": "2025-01-06"}'
   ```
   Oczekiwany rezultat: 200 OK + updated payment object

4. **Test: Brak autoryzacji**
   ```bash
   curl -X PATCH http://localhost:4321/api/payments/{id} \
     -H "Content-Type: application/json" \
     -d '{"amount": 1200}'
   ```
   Oczekiwany rezultat: 401 Unauthorized

5. **Test: Tenant próbuje edytować wpłatę (Forbidden)**
   ```bash
   curl -X PATCH http://localhost:4321/api/payments/{id} \
     -H "Authorization: Bearer {tenant-token}" \
     -H "Content-Type: application/json" \
     -d '{"amount": 1200}'
   ```
   Oczekiwany rezultat: 403 Forbidden lub 404 Not Found (RLS)

6. **Test: Brak pól do aktualizacji**
   ```bash
   curl -X PATCH http://localhost:4321/api/payments/{id} \
     -H "Authorization: Bearer {owner-token}" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   Oczekiwany rezultat: 400 Bad Request (Należy podać przynajmniej jedno pole...)

7. **Test: Nieprawidłowa kwota**
   ```bash
   curl -X PATCH http://localhost:4321/api/payments/{id} \
     -H "Authorization: Bearer {owner-token}" \
     -H "Content-Type: application/json" \
     -d '{"amount": -100}'
   ```
   Oczekiwany rezultat: 400 Bad Request (Kwota musi być większa od 0)

8. **Test: Suma wpłat przekracza kwotę opłaty**
   ```bash
   # Założenie: charge.amount = 2000, inne payments = 1500, próba update na 600
   curl -X PATCH http://localhost:4321/api/payments/{id} \
     -H "Authorization: Bearer {owner-token}" \
     -H "Content-Type: application/json" \
     -d '{"amount": 600}'
   ```
   Oczekiwany rezultat: 400 Bad Request (Suma wpłat ... nie może przekroczyć...)

9. **Test: Payment nie istnieje**
   ```bash
   curl -X PATCH http://localhost:4321/api/payments/00000000-0000-0000-0000-000000000000 \
     -H "Authorization: Bearer {owner-token}" \
     -H "Content-Type: application/json" \
     -d '{"amount": 1200}'
   ```
   Oczekiwany rezultat: 404 Not Found

**Testy automatyczne (opcjonalnie):**

```typescript
// tests/api/payments-update.test.ts
describe('PATCH /api/payments/:id', () => {
  it('should update payment amount for owner', async () => {
    // ...
  });

  it('should update payment date for owner', async () => {
    // ...
  });

  it('should reject tenant', async () => {
    // ...
  });

  it('should reject if sum exceeds charge amount', async () => {
    // ...
  });

  it('should reject if no fields provided', async () => {
    // ...
  });
});
```

### Krok 5: Dokumentacja

- Zaktualizować API documentation
- Dodać komentarze JSDoc do funkcji updatePayment
- Udokumentować validation rules (przynajmniej jedno pole)
- Przykłady request/response w README

### Krok 6: Code review

- Zgodność z zasadami z `claude.md`
- Weryfikacja walidacji (Zod refine)
- Sprawdzenie obsługi błędów DB trigger
- Weryfikacja bezpieczeństwa (RLS)
- Test edge cases (empty body, invalid values)

### Krok 7: Deployment

- Merge do main
- CI/CD pipeline
- Deploy do staging
- Testy smoke
- Deploy do production
- Monitor error rates

---

## Podsumowanie

Ten endpoint umożliwia właścicielom korektę błędnie wprowadzonych wpłat. Kluczowe aspekty:

1. **Partial update:** Można aktualizować tylko amount, tylko payment_date, lub oba
2. **Walidacja:** Przynajmniej jedno pole musi być podane (Zod refine)
3. **Business rules:** DB trigger wymusza, że suma wpłat nie przekracza kwoty opłaty
4. **Autoryzacja:** Tylko owner może edytować (RLS policy)
5. **Auto update:** Trigger automatycznie ustawia updated_at

Endpoint wymaga starannej obsługi partial updates i walidacji business rules przez DB trigger.
