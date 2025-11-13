# API Endpoint Implementation Plan: POST /api/apartments

## 1. Przegląd punktu końcowego

Endpoint służy do tworzenia nowego mieszkania przez właściciela. Tylko użytkownicy z rolą 'owner' mogą tworzyć mieszkania. Mieszkanie jest automatycznie przypisywane do zalogowanego użytkownika jako właściciela.

**Kluczowe cechy:**
- Dostępny tylko dla właścicieli (role = 'owner')
- Automatyczne ustawienie owner_id na podstawie zalogowanego użytkownika
- Walidacja danych wejściowych (nazwa min 3 znaki, adres min 5 znaków)
- Zwraca pełne dane utworzonego mieszkania

## 2. Szczegóły żądania

- **Metoda HTTP:** POST
- **Struktura URL:** `/api/apartments`
- **Parametry:**
  - **Wymagane:** brak (dane w body)
  - **Opcjonalne:** brak
- **Request Body:**
  ```json
  {
    "name": "Kawalerka na Woli",
    "address": "ul. Złota 44, Warszawa"
  }
  ```
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagany)
  - `Content-Type: application/json`

## 3. Wykorzystywane typy

**Command Model (Request):**
```typescript
export type CreateApartmentCommand = Pick<
  TablesInsert<'apartments'>,
  'name' | 'address'
>;
```

**DTO (Response):**
```typescript
// Zwracamy pełny rekord z tabeli apartments
type CreateApartmentResponseDTO = Tables<'apartments'>;
```

**Validation Schema (Zod):**
```typescript
const CreateApartmentSchema = z.object({
  name: z
    .string()
    .min(3, 'Nazwa musi mieć co najmniej 3 znaki')
    .trim(),
  address: z
    .string()
    .min(5, 'Adres musi mieć co najmniej 5 znaków')
    .trim()
});
```

## 4. Szczegóły odpowiedzi

### Success Response (201 Created):
```json
{
  "id": "uuid",
  "name": "Kawalerka na Woli",
  "address": "ul. Złota 44, Warszawa",
  "owner_id": "uuid",
  "created_at": "2025-01-12T10:00:00Z",
  "updated_at": "2025-01-12T10:00:00Z",
  "created_by": "uuid"
}
```

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
  "message": "Tylko właściciele mogą dodawać mieszkania"
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

2. **Parsowanie request body**
   - Odczytanie JSON z `context.request.json()`
   - Jeśli błąd parsowania → 400 Bad Request

3. **Walidacja danych wejściowych**
   - Walidacja przez Zod schema
   - Jeśli błąd walidacji → 400 Bad Request z details

4. **Sprawdzenie roli użytkownika**
   - Query do tabeli `users` po `role`
   - Jeśli role !== 'owner' → 403 Forbidden

5. **Utworzenie mieszkania**
   - INSERT do tabeli `apartments`:
   ```sql
   INSERT INTO apartments (name, address, owner_id, created_by)
   VALUES ($1, $2, auth.uid(), auth.uid())
   RETURNING *
   ```
   - RLS policy automatycznie zapewnia, że owner_id = auth.uid()

6. **Zwrócenie odpowiedzi**
   - Status 201 Created
   - Body: utworzony rekord mieszkania
   - Header: `Location: /api/apartments/{id}`

## 6. Względy bezpieczeństwa

### Autoryzacja:
- **JWT token wymagany** - sprawdzenie przez middleware
- **Role check** - explicit sprawdzenie role='owner' przed INSERT
- **RLS Policy** - dodatkowa warstwa zabezpieczeń na poziomie bazy:
  ```sql
  CREATE POLICY "Owners can insert their apartments"
    ON apartments FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = auth.uid());
  ```

### Walidacja:
- **Input sanitization:**
  - `.trim()` dla name i address
  - Minimalna długość (3 dla name, 5 dla address)
  - Brak maksymalnej długości w MVP (można dodać np. 100 znaków)

- **SQL Injection protection:**
  - Supabase używa prepared statements
  - Brak bezpośredniego wstrzykiwania wartości do SQL

### Data integrity:
- `owner_id` i `created_by` **automatycznie** ustawiane na `auth.uid()`
- Użytkownik **nie może** podać własnego owner_id (zabezpieczenie przed privilege escalation)

### Rate limiting:
- Supabase built-in: 100 req/s per IP
- Post-MVP: rozważyć custom rate limiting per user (np. max 10 mieszkań w ciągu godziny)

## 7. Obsługa błędów

### Scenariusze błędów:

| Kod | Scenariusz | Response | Logging |
|-----|-----------|----------|---------|
| 400 | Nieprawidłowy JSON w body | `{ "error": "Bad Request", "message": "Nieprawidłowy format danych" }` | Warning |
| 400 | Walidacja name/address failed | `{ "error": "Validation Error", "message": "Nieprawidłowe dane", "details": {...} }` | Info |
| 401 | Brak JWT tokenu | `{ "error": "Unauthorized", "message": "Brak autoryzacji" }` | Warning |
| 403 | User role !== 'owner' | `{ "error": "Forbidden", "message": "Tylko właściciele mogą dodawać mieszkania" }` | Warning |
| 500 | Błąd bazy danych (connection) | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` | Error |
| 500 | RLS policy violation | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` | Error |

### Error handling pattern:
```typescript
try {
  // Validation
  const validated = CreateApartmentSchema.parse(requestBody);

  // Business logic
  const apartment = await apartmentService.createApartment(user.id, validated);

  return new Response(JSON.stringify(apartment), {
    status: 201,
    headers: {
      'Content-Type': 'application/json',
      'Location': `/api/apartments/${apartment.id}`
    }
  });
} catch (error) {
  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({
      error: 'Validation Error',
      message: 'Nieprawidłowe dane',
      details: error.flatten().fieldErrors
    }), { status: 400 });
  }

  if (error instanceof ForbiddenError) {
    return new Response(JSON.stringify({
      error: 'Forbidden',
      message: error.message
    }), { status: 403 });
  }

  console.error('POST /api/apartments error:', error);
  return new Response(JSON.stringify({
    error: 'Internal Server Error',
    message: 'Wystąpił błąd serwera'
  }), { status: 500 });
}
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje:

1. **Single INSERT:**
   - Jedna operacja INSERT zwracająca utworzony rekord (`RETURNING *`)
   - Unikamy dodatkowego SELECT po INSERT

2. **Indeksy:**
   - `idx_apartments_owner_id` - dla przyszłych zapytań filtrujących po owner_id
   - Automatyczny index na PRIMARY KEY (id)

3. **Automatic timestamps:**
   - `created_at` i `updated_at` ustawiane automatycznie przez DEFAULT NOW()
   - Brak dodatkowej logiki aplikacyjnej

### Potencjalne problemy:

- **Brak limitu mieszkań per owner:**
  - MVP: brak limitu
  - Post-MVP: rozważyć soft limit (np. 100 mieszkań) lub plan premium

- **Duplikaty:**
  - MVP: możliwe utworzenie mieszkań o tej samej nazwie/adresie
  - Post-MVP: rozważyć unique constraint na (owner_id, address) lub deduplikację

## 9. Etapy wdrożenia

### Krok 1: Utworzenie validation schema
```typescript
// src/lib/validation/apartments.validation.ts
import { z } from 'zod';

export const CreateApartmentSchema = z.object({
  name: z
    .string()
    .min(3, 'Nazwa musi mieć co najmniej 3 znaki')
    .max(100, 'Nazwa nie może przekraczać 100 znaków')
    .trim(),
  address: z
    .string()
    .min(5, 'Adres musi mieć co najmniej 5 znaków')
    .max(200, 'Adres nie może przekraczać 200 znaków')
    .trim()
});
```

### Krok 2: Utworzenie custom error types
```typescript
// src/lib/errors/index.ts
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}
```

### Krok 3: Rozszerzenie apartment service
```typescript
// src/lib/services/apartment.service.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type { CreateApartmentCommand } from '@/types';
import type { Tables } from '@/db/database.types';

export class ApartmentService {
  constructor(private supabase: SupabaseClient) {}

  async createApartment(
    userId: string,
    command: CreateApartmentCommand
  ): Promise<Tables<'apartments'>> {
    // 1. Sprawdzenie roli
    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new Error('Nie znaleziono użytkownika');
    }

    if (user.role !== 'owner') {
      throw new ForbiddenError('Tylko właściciele mogą dodawać mieszkania');
    }

    // 2. Utworzenie mieszkania
    const { data: apartment, error: insertError } = await this.supabase
      .from('apartments')
      .insert({
        name: command.name,
        address: command.address,
        owner_id: userId,
        created_by: userId
      })
      .select()
      .single();

    if (insertError || !apartment) {
      throw new Error('Nie udało się utworzyć mieszkania');
    }

    return apartment;
  }
}
```

### Krok 4: Implementacja API route
```typescript
// src/pages/api/apartments/index.ts
import type { APIContext } from 'astro';
import { z } from 'zod';
import { ApartmentService } from '@/lib/services/apartment.service';
import { CreateApartmentSchema } from '@/lib/validation/apartments.validation';
import { ForbiddenError } from '@/lib/errors';

export const prerender = false;

export async function POST(context: APIContext) {
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
    // 2. Parse request body
    const body = await context.request.json();

    // 3. Validate input
    const validated = CreateApartmentSchema.parse(body);

    // 4. Create apartment
    const apartmentService = new ApartmentService(context.locals.supabase);
    const apartment = await apartmentService.createApartment(user.id, validated);

    // 5. Return response
    return new Response(JSON.stringify(apartment), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Location': `/api/apartments/${apartment.id}`
      }
    });
  } catch (error) {
    // Error handling
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

    if (error instanceof ForbiddenError) {
      return new Response(JSON.stringify({
        error: 'Forbidden',
        message: error.message
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.error('POST /api/apartments error:', {
      userId: user.id,
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

### Krok 5: Testy
1. **Test happy path:**
   - Owner tworzy mieszkanie z prawidłowymi danymi
   - Weryfikacja response 201 + pełne dane mieszkania

2. **Test walidacji:**
   - Nazwa < 3 znaki → 400
   - Adres < 5 znaków → 400
   - Puste pola → 400
   - Nieprawidłowy JSON → 400

3. **Test autoryzacji:**
   - Brak tokenu → 401
   - Tenant próbuje utworzyć mieszkanie → 403

4. **Test database:**
   - Weryfikacja że owner_id === user.id
   - Weryfikacja że created_by === user.id
   - Weryfikacja automatic timestamps

### Krok 6: Dokumentacja
1. JSDoc dla createApartment method
2. Komentarze w kodzie dla RLS policy check
3. Przykłady request/response w API docs

---

**Priorytet:** Wysoki (wymagane w onboarding flow)
**Szacowany czas:** 3-4 godziny
**Zależności:**
- Middleware autoryzacji
- Typy DTO
- Error handling utilities
