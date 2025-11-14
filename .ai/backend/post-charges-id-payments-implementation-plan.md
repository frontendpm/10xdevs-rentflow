# API Endpoint Implementation Plan: POST /api/charges/:chargeId/payments

## 1. Przegląd punktu końcowego

Endpoint służy do dodawania nowej płatności (wpłaty) do istniejącej opłaty. Tylko właściciel mieszkania ma uprawnienia do rejestrowania wpłat. Endpoint wymusza reguły biznesowe, w tym ograniczenie, że suma wszystkich wpłat nie może przekroczyć kwoty opłaty.

**Cel biznesowy:** Umożliwienie właścicielowi rejestrowania wpłat dokonanych przez lokatora, z automatyczną walidacją, że suma wpłat nie przekracza kwoty opłaty.

## 2. Szczegóły żądania

- **Metoda HTTP:** POST
- **Struktura URL:** `/api/charges/:chargeId/payments`
- **Parametry:**
  - **Wymagane:**
    - `chargeId` (path parameter) - UUID identyfikujący opłatę
    - Request body:
      - `amount` - kwota wpłaty (number > 0)
      - `payment_date` - data wpłaty (ISO 8601 date string)
  - **Opcjonalne:** brak
- **Request Body:**
  ```json
  {
    "amount": 1000.00,
    "payment_date": "2025-01-05"
  }
  ```
- **Headers:**
  - `Authorization: Bearer <token>` (wymagane)
  - `Content-Type: application/json` (wymagane)

## 3. Wykorzystywane typy

### Typy z `src/types.ts`:

```typescript
// Request body
export type AddPaymentCommand = Pick<TablesInsert<'payments'>, 'amount' | 'payment_date'>;

// Response DTO
export type PaymentDTO = Tables<'payments'>;
```

### Typy z `src/db/database.types.ts`:

```typescript
TablesInsert<'payments'> zawiera:
- charge_id: string (UUID) - będzie ustawione z path param
- amount: number
- payment_date: string (date)
- created_by: string (UUID) - będzie ustawione z auth.uid()

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
const chargeIdParamSchema = z.object({
  chargeId: z.string().uuid({ message: 'Nieprawidłowy identyfikator opłaty' })
});

// Walidacja request body
const addPaymentSchema = z.object({
  amount: z
    .number({ required_error: 'Kwota jest wymagana' })
    .positive({ message: 'Kwota musi być większa od 0' })
    .multipleOf(0.01, { message: 'Kwota może mieć maksymalnie 2 miejsca po przecinku' }),
  payment_date: z
    .string({ required_error: 'Data wpłaty jest wymagana' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data wpłaty musi być w formacie YYYY-MM-DD' })
    .refine((date) => !isNaN(Date.parse(date)), {
      message: 'Nieprawidłowa data wpłaty'
    })
});
```

## 4. Szczegóły odpowiedzi

### Odpowiedź 201 (Created):

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "charge_id": "123e4567-e89b-12d3-a456-426614174000",
  "amount": 1000.00,
  "payment_date": "2025-01-05",
  "created_at": "2025-01-05T15:00:00Z",
  "updated_at": "2025-01-05T15:00:00Z",
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
  "message": "Nie masz uprawnień do dodawania wpłat do tej opłaty"
}
```

### Odpowiedź 404 (Not Found):

```json
{
  "error": "Not Found",
  "message": "Opłata nie została znaleziona"
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
1. Request arrives at POST /api/charges/:chargeId/payments
   ↓
2. Middleware weryfikuje JWT token (context.locals.user)
   ↓
3. Endpoint handler waliduje:
   - chargeId (UUID)
   - Request body (amount, payment_date)
   ↓
4. Sprawdzenie, czy charge istnieje i pobranie charge.amount
   ↓
5. Opcjonalnie: Sprawdzenie, czy suma wpłat + nowa kwota <= charge.amount
   (lub polegać na DB trigger)
   ↓
6. Service: createPayment(chargeId, data, userId)
   ↓
7. Supabase INSERT:
   - INSERT INTO payments (charge_id, amount, payment_date, created_by)
   - RLS sprawdza uprawnienia:
     * Owner: EXISTS (charge -> lease -> apartment.owner_id = auth.uid())
   - DB trigger check_payment_sum weryfikuje, że suma <= charge.amount
   ↓
8. Zwrócenie utworzonej płatności (PaymentDTO)
```

### Interakcje z bazą danych:

**Query 1: Sprawdzenie istnienia charge i pobranie amount**
```sql
SELECT id, amount FROM charges
WHERE id = $1;
```

**Query 2: Opcjonalnie - pobranie sumy wpłat (dla walidacji przed INSERT)**
```sql
SELECT COALESCE(SUM(amount), 0) as total_paid
FROM payments
WHERE charge_id = $1;
```

**Query 3: INSERT nowej płatności**
```sql
INSERT INTO payments (charge_id, amount, payment_date, created_by)
VALUES ($1, $2, $3, $4)
RETURNING *;
```

### Database Trigger (automatyczny):

Z `db-plan.md`, trigger `check_payment_sum`:

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

  -- Oblicz aktualną sumę wpłat (bez tej nowej)
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

CREATE TRIGGER validate_payment_sum_insert
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION check_payment_sum();
```

### RLS Policies (automatyczne):

```sql
-- INSERT: Właściciele mogą dodawać wpłaty dla swoich mieszkań
CREATE POLICY "Owners can insert payments for their apartments"
  ON payments FOR INSERT
  TO authenticated
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
- **Owner only:** Tylko właściciel mieszkania może dodawać wpłaty
- **RLS policy:** Automatycznie blokuje INSERT jeśli user nie jest ownerem
- **Tenant nie może:** Lokatorzy NIE mogą dodawać wpłat (read-only)

### Walidacja danych wejściowych:
- **chargeId:** UUID validation przez Zod
- **amount:** Liczba dodatnia, max 2 miejsca po przecinku
- **payment_date:** ISO 8601 date string (YYYY-MM-DD), musi być prawidłową datą
- **SQL Injection:** Zapobiegane przez Supabase prepared statements

### Business Rules Validation:
- **Suma wpłat <= charge.amount:** Wymuszane przez DB trigger `check_payment_sum`
- **Charge musi istnieć:** Sprawdzane przed INSERT
- **created_by:** Automatycznie ustawiane na auth.uid() w bazie

### Ochrona przed nadużyciami:
- Rate limiting (Supabase built-in)
- Nie można dodać wpłaty przekraczającej remaining amount
- Nie można dodać wpłaty do nieistniejącej charge

## 7. Obsługa błędów

### Potencjalne błędy i obsługa:

| Scenariusz | Kod HTTP | Error Type | Message | Obsługa |
|------------|----------|------------|---------|---------|
| Brak tokenu JWT | 401 | Unauthorized | "Brak autoryzacji" | Early return |
| Nieprawidłowy chargeId | 400 | Validation Error | "Nieprawidłowy identyfikator opłaty" | Zod validation |
| Brak amount | 400 | Validation Error | "Kwota jest wymagana" | Zod validation |
| amount <= 0 | 400 | Validation Error | "Kwota musi być większa od 0" | Zod validation |
| Nieprawidłowa payment_date | 400 | Validation Error | "Nieprawidłowa data wpłaty" | Zod validation |
| Charge nie istnieje | 404 | Not Found | "Opłata nie została znaleziona" | Query charge przed INSERT |
| Suma wpłat > charge.amount | 400 | Bad Request | "Suma wpłat (X zł) nie może przekroczyć kwoty opłaty (Y zł)" | DB trigger exception |
| User nie jest ownerem | 403 | Forbidden | "Nie masz uprawnień do dodawania wpłat do tej opłaty" | RLS policy |
| Błąd bazy danych | 500 | Internal Server Error | "Wystąpił błąd serwera" | Catch all |

### Strategia obsługi błędów:

```typescript
try {
  // 1. Walidacja parametrów
  const { chargeId } = chargeIdParamSchema.parse(context.params);
  const paymentData = addPaymentSchema.parse(await context.request.json());

  // 2. Sprawdzenie, czy charge istnieje
  const { data: charge, error: chargeError } = await supabase
    .from('charges')
    .select('id, amount')
    .eq('id', chargeId)
    .single();

  if (chargeError || !charge) {
    return new Response(
      JSON.stringify({
        error: 'Not Found',
        message: 'Opłata nie została znaleziona'
      }),
      { status: 404 }
    );
  }

  // 3. Wywołanie service
  const payment = await createPayment(supabase, chargeId, paymentData, user.id);

  // 4. Zwrócenie utworzonej płatności
  return new Response(JSON.stringify(payment), { status: 201 });

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
    // Parse error message z triggera
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
  }

  // RLS policy violation
  if (error instanceof Error && error.message.includes('policy')) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Nie masz uprawnień do dodawania wpłat do tej opłaty'
      }),
      { status: 403 }
    );
  }

  // Logowanie błędu
  console.error('Error in POST /api/charges/:chargeId/payments:', error);

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

1. **Dodatkowe query dla sprawdzenia charge:**
   - Potrzebne, aby zwrócić 404 zamiast 500
   - Można zoptymalizować przez sprawdzenie charge w tym samym query co INSERT

2. **DB trigger `check_payment_sum`:**
   - Wykonuje query SUM przy każdym INSERT
   - Prawdopodobieństwo: Niskie obciążenie (niewiele równoczesnych wpłat)

3. **RLS policy z JOINami:**
   - RLS używa EXISTS z charges -> leases -> apartments
   - Mitigation: Indeksy FK już istnieją

### Strategie optymalizacji:

1. **Single query dla charge validation:**
   ```typescript
   // Zamiast osobnego query, pozwól DB zwrócić błąd FK constraint
   // Wtedy check charge tylko dla lepszego error message
   ```

2. **Nie implementować dodatkowej walidacji sumy w aplikacji:**
   - Polegać na DB trigger (single source of truth)
   - Oszczędza dodatkowe query

3. **Database indexes:**
   - Index na `payments.charge_id` (FK) - już istnieje
   - Index na `charges.id` (PK) - domyślny

### Monitoring:

- Monitorować frequency i latency tego endpointu
- Sprawdzać, czy DB trigger nie powoduje performance issues
- W razie potrzeby: denormalizacja (kolumna total_paid w charges) - ale to poza MVP

## 9. Etapy wdrożenia

### Krok 1: Rozszerzenie service `payment.service.ts`

**Lokalizacja:** `src/lib/services/payment.service.ts`

```typescript
import type { SupabaseClient } from '@/db/supabase.client';
import type { PaymentDTO, AddPaymentCommand } from '@/types';

/**
 * Tworzy nową płatność dla danej opłaty
 *
 * @throws Error jeśli suma wpłat przekroczy kwotę opłaty (DB trigger)
 * @throws Error jeśli user nie ma uprawnień (RLS policy)
 */
export async function createPayment(
  supabase: SupabaseClient,
  chargeId: string,
  data: AddPaymentCommand,
  userId: string
): Promise<PaymentDTO> {
  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      charge_id: chargeId,
      amount: data.amount,
      payment_date: data.payment_date,
      created_by: userId
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating payment:', error);
    throw error; // Rzuć błąd, aby endpoint mógł go obsłużyć
  }

  return payment;
}
```

### Krok 2: Utworzenie Zod schemas

**Lokalizacja:** `src/lib/validations/payment.validation.ts`

```typescript
import { z } from 'zod';

export const chargeIdParamSchema = z.object({
  chargeId: z.string().uuid({ message: 'Nieprawidłowy identyfikator opłaty' })
});

export const addPaymentSchema = z.object({
  amount: z
    .number({ required_error: 'Kwota jest wymagana' })
    .positive({ message: 'Kwota musi być większa od 0' })
    .multipleOf(0.01, { message: 'Kwota może mieć maksymalnie 2 miejsca po przecinku' }),
  payment_date: z
    .string({ required_error: 'Data wpłaty jest wymagana' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data wpłaty musi być w formacie YYYY-MM-DD' })
    .refine((date) => !isNaN(Date.parse(date)), {
      message: 'Nieprawidłowa data wpłaty'
    })
});

export type AddPaymentInput = z.infer<typeof addPaymentSchema>;
```

### Krok 3: Rozszerzenie endpoint handler

**Lokalizacja:** `src/pages/api/charges/[chargeId]/payments.ts`

```typescript
import type { APIContext } from 'astro';
import { z } from 'zod';
import { createPayment } from '@/lib/services/payment.service';
import { chargeIdParamSchema, addPaymentSchema } from '@/lib/validations/payment.validation';

export const prerender = false;

// ... GET handler z poprzedniego planu ...

export async function POST(context: APIContext): Promise<Response> {
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
    const { chargeId } = chargeIdParamSchema.parse(context.params);

    // 3. Parsowanie i walidacja request body
    const requestBody = await context.request.json();
    const paymentData = addPaymentSchema.parse(requestBody);

    // 4. Sprawdzenie, czy charge istnieje
    const { data: charge, error: chargeError } = await supabase
      .from('charges')
      .select('id, amount')
      .eq('id', chargeId)
      .single();

    if (chargeError || !charge) {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Opłata nie została znaleziona'
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Utworzenie płatności (RLS i DB trigger sprawdzą reguły)
    const payment = await createPayment(supabase, chargeId, paymentData, user.id);

    // 6. Zwrócenie utworzonej płatności
    return new Response(JSON.stringify(payment), {
      status: 201,
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

      // Fallback message
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
          message: 'Nie masz uprawnień do dodawania wpłat do tej opłaty'
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Logowanie błędu
    console.error('Error in POST /api/charges/:chargeId/payments:', error);

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

1. **Test pozytywny (Owner tworzy wpłatę):**
   ```bash
   curl -X POST http://localhost:4321/api/charges/{chargeId}/payments \
     -H "Authorization: Bearer {owner-token}" \
     -H "Content-Type: application/json" \
     -d '{
       "amount": 1000.00,
       "payment_date": "2025-01-05"
     }'
   ```
   Oczekiwany rezultat: 201 Created + payment object

2. **Test: Brak autoryzacji**
   ```bash
   curl -X POST http://localhost:4321/api/charges/{chargeId}/payments \
     -H "Content-Type: application/json" \
     -d '{"amount": 1000, "payment_date": "2025-01-05"}'
   ```
   Oczekiwany rezultat: 401 Unauthorized

3. **Test: Tenant próbuje utworzyć wpłatę (Forbidden)**
   ```bash
   curl -X POST http://localhost:4321/api/charges/{chargeId}/payments \
     -H "Authorization: Bearer {tenant-token}" \
     -H "Content-Type: application/json" \
     -d '{"amount": 1000, "payment_date": "2025-01-05"}'
   ```
   Oczekiwany rezultat: 403 Forbidden

4. **Test: Nieprawidłowa kwota (validation)**
   ```bash
   curl -X POST http://localhost:4321/api/charges/{chargeId}/payments \
     -H "Authorization: Bearer {owner-token}" \
     -H "Content-Type: application/json" \
     -d '{"amount": -100, "payment_date": "2025-01-05"}'
   ```
   Oczekiwany rezultat: 400 Bad Request (Kwota musi być większa od 0)

5. **Test: Nieprawidłowa data**
   ```bash
   curl -X POST http://localhost:4321/api/charges/{chargeId}/payments \
     -H "Authorization: Bearer {owner-token}" \
     -H "Content-Type: application/json" \
     -d '{"amount": 1000, "payment_date": "invalid-date"}'
   ```
   Oczekiwany rezultat: 400 Bad Request

6. **Test: Suma wpłat przekracza kwotę opłaty**
   ```bash
   # Założenie: charge.amount = 2000, już są wpłaty na sumę 1500
   curl -X POST http://localhost:4321/api/charges/{chargeId}/payments \
     -H "Authorization: Bearer {owner-token}" \
     -H "Content-Type: application/json" \
     -d '{"amount": 600, "payment_date": "2025-01-05"}'
   ```
   Oczekiwany rezultat: 400 Bad Request (Suma wpłat ... nie może przekroczyć...)

7. **Test: Charge nie istnieje**
   ```bash
   curl -X POST http://localhost:4321/api/charges/00000000-0000-0000-0000-000000000000/payments \
     -H "Authorization: Bearer {owner-token}" \
     -H "Content-Type: application/json" \
     -d '{"amount": 1000, "payment_date": "2025-01-05"}'
   ```
   Oczekiwany rezultat: 404 Not Found

**Testy automatyczne (opcjonalnie):**

```typescript
// tests/api/charges/payments-create.test.ts
describe('POST /api/charges/:chargeId/payments', () => {
  it('should create payment for owner', async () => {
    // ...
  });

  it('should reject tenant', async () => {
    // ...
  });

  it('should reject if sum exceeds charge amount', async () => {
    // ...
  });
});
```

### Krok 5: Dokumentacja

- Zaktualizować API documentation
- Dodać komentarze JSDoc do funkcji createPayment
- Udokumentować business rules (suma wpłat)
- Przykłady request/response w README

### Krok 6: Code review

- Zgodność z zasadami z `claude.md`
- Weryfikacja walidacji (Zod schemas)
- Sprawdzenie obsługi błędów DB trigger
- Weryfikacja bezpieczeństwa (RLS, tylko owner)
- Test edge cases

### Krok 7: Deployment

- Merge do main
- CI/CD pipeline
- Deploy do staging
- Testy smoke (happy path + error cases)
- Deploy do production
- Monitor error rates i performance

---

## Podsumowanie

Ten endpoint jest kluczowy dla funkcjonalności aplikacji - pozwala właścicielom rejestrować wpłaty lokatorów. Główne wyzwania to:

1. **Walidacja business rules:** DB trigger `check_payment_sum` wymusza, że suma wpłat nie przekracza kwoty opłaty
2. **Autoryzacja:** Tylko owner może dodawać wpłaty (RLS policy)
3. **Obsługa błędów:** Parsowanie błędów z DB triggera dla user-friendly messages
4. **Walidacja danych:** Zod schemas dla amount i payment_date

Endpoint jest stosunkowo prosty, ale wymaga starannej obsługi błędów, szczególnie dla DB trigger exceptions.
