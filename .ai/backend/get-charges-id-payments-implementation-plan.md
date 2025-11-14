# API Endpoint Implementation Plan: GET /api/charges/:chargeId/payments

## 1. Przegląd punktu końcowego

Endpoint służy do pobierania listy wszystkich płatności przypisanych do konkretnej opłaty. Zwraca listę płatności wraz z sumą wszystkich wpłat. Dostęp mają zarówno właściciele (owner) jak i lokatorzy (tenant) z aktywnym najmem dla danego mieszkania.

**Cel biznesowy:** Umożliwienie przeglądania historii wpłat dla danej opłaty, zarówno właścicielowi (do weryfikacji wpłat) jak i lokatorowi (do sprawdzenia stanu rozliczeń).

## 2. Szczegóły żądania

- **Metoda HTTP:** GET
- **Struktura URL:** `/api/charges/:chargeId/payments`
- **Parametry:**
  - **Wymagane:**
    - `chargeId` (path parameter) - UUID identyfikujący opłatę
  - **Opcjonalne:** brak
- **Request Body:** brak (GET request)
- **Headers:**
  - `Authorization: Bearer <token>` (wymagane)

## 3. Wykorzystywane typy

### Typy z `src/types.ts`:

```typescript
// Response DTO
export type PaymentDTO = Tables<'payments'>;

export type PaymentsListDTO = {
  payments: PaymentDTO[];
  total: number;
};
```

### Typy z `src/db/database.types.ts`:

```typescript
Tables<'payments'> zawiera:
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
// Walidacja chargeId
const chargeIdParamSchema = z.object({
  chargeId: z.string().uuid({ message: 'Nieprawidłowy identyfikator opłaty' })
});
```

## 4. Szczegóły odpowiedzi

### Odpowiedź 200 (Success):

```json
{
  "payments": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "charge_id": "123e4567-e89b-12d3-a456-426614174000",
      "amount": 500.00,
      "payment_date": "2025-01-05",
      "created_at": "2025-01-05T15:00:00Z",
      "updated_at": "2025-01-05T15:00:00Z",
      "created_by": "user-uuid"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "charge_id": "123e4567-e89b-12d3-a456-426614174000",
      "amount": 500.00,
      "payment_date": "2025-01-10",
      "created_at": "2025-01-10T12:00:00Z",
      "updated_at": "2025-01-10T12:00:00Z",
      "created_by": "user-uuid"
    }
  ],
  "total": 1000.00
}
```

### Odpowiedź 400 (Bad Request):

```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowy identyfikator opłaty"
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
  "message": "Nie masz uprawnień do przeglądania wpłat tej opłaty"
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
1. Request arrives at /api/charges/:chargeId/payments
   ↓
2. Middleware weryfikuje JWT token (context.locals.user)
   ↓
3. Endpoint handler waliduje chargeId (Zod)
   ↓
4. Service: getPaymentsByChargeId(chargeId)
   ↓
5. Supabase query:
   - SELECT * FROM payments WHERE charge_id = chargeId
   - RLS automatycznie sprawdza uprawnienia:
     * Owner: EXISTS (charge -> lease -> apartment.owner_id = auth.uid())
     * Tenant: EXISTS (charge -> lease.tenant_id = auth.uid() AND status = 'active')
   ↓
6. Obliczenie total: SUM(amount) wszystkich payments
   ↓
7. Zwrócenie PaymentsListDTO
```

### Interakcje z bazą danych:

**Query 1: Pobierz płatności**
```sql
SELECT * FROM payments
WHERE charge_id = $1
ORDER BY payment_date DESC, created_at DESC;
```

**Query 2: Oblicz sumę (można zrobić w jednym query)**
```sql
SELECT
  *,
  (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE charge_id = $1) as total
FROM payments
WHERE charge_id = $1
ORDER BY payment_date DESC, created_at DESC;
```

Lub użyć agregacji w TypeScript po pobraniu danych.

### RLS Policies (automatyczne):

Z `db-plan.md`, policies dla `payments`:

```sql
-- SELECT: Właściciele widzą wpłaty dla swoich mieszkań
CREATE POLICY "Owners can view payments for their apartments"
  ON payments FOR SELECT
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

-- SELECT: Lokatorzy widzą wpłaty dla swojego aktywnego najmu
CREATE POLICY "Tenants can view payments for their active lease"
  ON payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM charges
      JOIN leases ON leases.id = charges.lease_id
      WHERE charges.id = payments.charge_id
        AND leases.tenant_id = auth.uid()
        AND leases.status = 'active'
    )
  );
```

## 6. Względy bezpieczeństwa

### Uwierzytelnianie:
- **JWT Token:** Wymagany w header `Authorization: Bearer <token>`
- **Middleware:** Astro middleware weryfikuje token i ustawia `context.locals.user`
- **Brak tokenu:** 401 Unauthorized

### Autoryzacja (RLS):
- **Owner:** Może przeglądać wpłaty dla opłat swoich mieszkań
- **Tenant:** Może przeglądać wpłaty tylko dla swojego aktywnego najmu
- **RLS automatycznie filtruje:** Jeśli user nie ma dostępu do charge, zwróci pustą listę lub błąd 403

### Walidacja danych wejściowych:
- **chargeId:** Walidacja UUID przez Zod
- **SQL Injection:** Zapobiegane przez Supabase prepared statements

### Ochrona przed wyciekiem danych:
- RLS policies zapewniają, że users widzą tylko swoje dane
- Nie ujawniamy szczegółów błędów w production (np. stack traces)

## 7. Obsługa błędów

### Potencjalne błędy i obsługa:

| Scenariusz | Kod HTTP | Error Type | Message |
|------------|----------|------------|---------|
| Brak tokenu JWT | 401 | Unauthorized | "Brak autoryzacji" |
| Nieprawidłowy format chargeId | 400 | Validation Error | "Nieprawidłowy identyfikator opłaty" |
| Charge nie istnieje | 404 | Not Found | "Opłata nie została znaleziona" |
| User nie ma dostępu do charge | 403 | Forbidden | "Nie masz uprawnień do przeglądania wpłat tej opłaty" |
| Błąd bazy danych | 500 | Internal Server Error | "Wystąpił błąd serwera" |
| Supabase timeout | 500 | Internal Server Error | "Wystąpił błąd serwera" |

### Strategia obsługi błędów:

```typescript
try {
  // 1. Walidacja chargeId
  const { chargeId } = chargeIdParamSchema.parse(params);

  // 2. Wywołanie service
  const result = await getPaymentsByChargeId(supabase, chargeId);

  // 3. Sprawdzenie, czy charge istnieje (opcjonalnie osobne query)
  if (!result) {
    return new Response(JSON.stringify({
      error: 'Not Found',
      message: 'Opłata nie została znaleziona'
    }), { status: 404 });
  }

  // 4. Zwrócenie wyniku
  return new Response(JSON.stringify(result), { status: 200 });

} catch (error) {
  // Obsługa błędów walidacji Zod
  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({
      error: 'Validation Error',
      message: error.errors[0].message
    }), { status: 400 });
  }

  // Logowanie błędu do console (w production: service logowania)
  console.error('Error in GET /api/charges/:chargeId/payments:', error);

  // Zwrócenie ogólnego błędu 500
  return new Response(JSON.stringify({
    error: 'Internal Server Error',
    message: 'Wystąpił błąd serwera'
  }), { status: 500 });
}
```

### Logowanie:
- Wszystkie błędy 500 logowane do console.error
- W production: rozważyć integrację z Sentry lub podobnym narzędziem
- Nie logować wrażliwych danych (tokeny, hasła)

## 8. Rozważania dotyczące wydajności

### Potencjalne wąskie gardła:

1. **Duża liczba płatności dla jednej opłaty:**
   - Prawdopodobieństwo: Niskie (zwykle kilka wpłat na opłatę)
   - Mitigation: Brak paginacji potrzebnej w MVP

2. **Złożone RLS queries:**
   - RLS policies używają EXISTS z JOINami przez charges -> leases -> apartments
   - Mitigation: Indeksy na FK (charge_id, lease_id, apartment_id) już istnieją w db-plan.md

3. **Redundantne query dla total:**
   - Jeśli robimy osobne query dla SUM
   - Mitigation: Obliczać total w TypeScript po pobraniu payments

### Strategie optymalizacji:

1. **Single query dla payments + total:**
   ```typescript
   // Pobierz wszystkie payments, oblicz total w aplikacji
   const payments = await supabase
     .from('payments')
     .select('*')
     .eq('charge_id', chargeId)
     .order('payment_date', { ascending: false });

   const total = payments.data?.reduce((sum, p) => sum + p.amount, 0) || 0;
   ```

2. **Caching:**
   - Nie implementować w MVP
   - W przyszłości: cache przez 1-5 minut dla często przeglądanych charges

3. **Database indexes:**
   - Index na `payments.charge_id` już istnieje (FK index)
   - Index na `payments.payment_date DESC` już istnieje w db-plan.md

### Monitoring:

- Monitorować czas odpowiedzi endpoint w production
- Supabase Dashboard pokazuje slow queries
- Docelowo: Application Performance Monitoring (APM) tool

## 9. Etapy wdrożenia

### Krok 1: Utworzenie service `payment.service.ts`

**Lokalizacja:** `src/lib/services/payment.service.ts`

```typescript
import type { SupabaseClient } from '@/db/supabase.client';
import type { PaymentsListDTO } from '@/types';

/**
 * Pobiera wszystkie płatności dla danej opłaty wraz z sumą
 */
export async function getPaymentsByChargeId(
  supabase: SupabaseClient,
  chargeId: string
): Promise<PaymentsListDTO> {
  // Query do pobrania płatności
  const { data: payments, error } = await supabase
    .from('payments')
    .select('*')
    .eq('charge_id', chargeId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching payments:', error);
    throw new Error('Nie udało się pobrać wpłat');
  }

  // Obliczenie total
  const total = payments?.reduce((sum, payment) => sum + payment.amount, 0) || 0;

  return {
    payments: payments || [],
    total
  };
}
```

### Krok 2: Utworzenie Zod schema dla walidacji

**Lokalizacja:** Można dodać do service lub osobnego pliku `src/lib/validations/payment.validation.ts`

```typescript
import { z } from 'zod';

export const chargeIdParamSchema = z.object({
  chargeId: z.string().uuid({ message: 'Nieprawidłowy identyfikator opłaty' })
});
```

### Krok 3: Utworzenie endpoint handler

**Lokalizacja:** `src/pages/api/charges/[chargeId]/payments.ts`

```typescript
import type { APIContext } from 'astro';
import { z } from 'zod';
import { getPaymentsByChargeId } from '@/lib/services/payment.service';

// Disable prerendering dla API routes
export const prerender = false;

// Zod schema
const chargeIdParamSchema = z.object({
  chargeId: z.string().uuid({ message: 'Nieprawidłowy identyfikator opłaty' })
});

export async function GET(context: APIContext): Promise<Response> {
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

  // 2. Pobranie supabase client
  const supabase = context.locals.supabase;

  try {
    // 3. Walidacja parametrów
    const { chargeId } = chargeIdParamSchema.parse(context.params);

    // 4. Sprawdzenie, czy charge istnieje (opcjonalne, ale recommended)
    const { data: charge, error: chargeError } = await supabase
      .from('charges')
      .select('id')
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

    // 5. Pobranie płatności (RLS automatycznie sprawdzi uprawnienia)
    const result = await getPaymentsByChargeId(supabase, chargeId);

    // 6. Zwrócenie wyniku
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Obsługa błędów walidacji
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: error.errors[0].message
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Logowanie błędu
    console.error('Error in GET /api/charges/:chargeId/payments:', error);

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

1. **Test pozytywny (Owner):**
   ```bash
   curl -X GET http://localhost:4321/api/charges/{chargeId}/payments \
     -H "Authorization: Bearer {owner-token}"
   ```
   Oczekiwany rezultat: 200 OK + lista payments

2. **Test pozytywny (Tenant):**
   ```bash
   curl -X GET http://localhost:4321/api/charges/{chargeId}/payments \
     -H "Authorization: Bearer {tenant-token}"
   ```
   Oczekiwany rezultat: 200 OK + lista payments

3. **Test: Brak autoryzacji**
   ```bash
   curl -X GET http://localhost:4321/api/charges/{chargeId}/payments
   ```
   Oczekiwany rezultat: 401 Unauthorized

4. **Test: Nieprawidłowy chargeId**
   ```bash
   curl -X GET http://localhost:4321/api/charges/invalid-uuid/payments \
     -H "Authorization: Bearer {token}"
   ```
   Oczekiwany rezultat: 400 Bad Request

5. **Test: Charge nie istnieje**
   ```bash
   curl -X GET http://localhost:4321/api/charges/00000000-0000-0000-0000-000000000000/payments \
     -H "Authorization: Bearer {token}"
   ```
   Oczekiwany rezultat: 404 Not Found

6. **Test: Forbidden (user bez dostępu)**
   - Użyj tokenu usera, który nie ma dostępu do danej charge
   Oczekiwany rezultat: 403 Forbidden (lub pusta lista, zależnie od implementacji RLS)

**Testy automatyczne (opcjonalnie):**

```typescript
// tests/api/charges/payments.test.ts
import { describe, it, expect } from 'vitest';
// ... implementacja testów
```

### Krok 5: Dokumentacja

- Zaktualizować API documentation (jeśli istnieje)
- Dodać komentarze JSDoc do funkcji service
- Udokumentować error codes w README

### Krok 6: Code review

- Sprawdzić zgodność z zasadami z `claude.md`
- Weryfikacja bezpieczeństwa (RLS, walidacja)
- Weryfikacja obsługi błędów
- Sprawdzenie wydajności queries

### Krok 7: Deployment

- Merge do main branch
- CI/CD pipeline (GitHub Actions)
- Deploy do staging
- Testy smoke na staging
- Deploy do production

---

## Podsumowanie

Ten endpoint jest stosunkowo prosty - główna logika to pobranie listy payments i obliczenie sumy. Bezpieczeństwo zapewniają RLS policies, które automatycznie filtrują dane na podstawie uprawnień użytkownika. Kluczowe jest odpowiednie logowanie błędów i walidacja UUID parametru chargeId.
