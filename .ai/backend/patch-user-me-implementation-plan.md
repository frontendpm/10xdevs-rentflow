# API Endpoint Implementation Plan: PATCH /api/users/me

## 1. Przegląd punktu końcowego

Endpoint umożliwia zaktualizowanie profilu bieżącego zalogowanego użytkownika. W wersji MVP użytkownik może edytować tylko jedno pole: `full_name` (imię i nazwisko).

**Kluczowe informacje:**
- Dostępny dla wszystkich zalogowanych użytkowników (Owner i Tenant)
- Aktualizuje tylko pole `full_name`
- Zwraca pełny profil użytkownika po aktualizacji
- Chroniony przez Row Level Security (RLS) - użytkownik może aktualizować tylko swój profil

## 2. Szczegóły żądania

### Metoda HTTP
`PATCH`

### Struktura URL
```
/api/users/me
```

### Headers
```
Authorization: Bearer <supabase-jwt-token>
Content-Type: application/json
```

### Parametry
**Wymagane:**
- Brak parametrów w URL lub query string

**Request Body:**
```typescript
{
  full_name: string; // min 2 znaki
}
```

**Przykładowe żądanie:**
```json
{
  "full_name": "Jan Nowak"
}
```

## 3. Wykorzystywane typy

### Command Model (Input)
```typescript
// src/types.ts
export type UpdateUserProfileCommand = {
  full_name: string;
};
```

### Response DTO (Output)
```typescript
// src/types.ts
export type UserProfileDTO = Tables<'users'>;

// Struktura (z database.types.ts):
{
  id: string;              // UUID
  email: string;
  full_name: string;
  role: 'owner' | 'tenant';
  created_at: string;      // ISO 8601 timestamp
  updated_at: string;      // ISO 8601 timestamp
}
```

### Zod Validation Schema
Utworzyć w API route:
```typescript
import { z } from 'zod';

const updateUserProfileSchema = z.object({
  full_name: z.string()
    .trim()
    .min(2, 'Imię musi mieć co najmniej 2 znaki')
});
```

## 4. Szczegóły odpowiedzi

### Sukces (200 OK)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "full_name": "Jan Nowak",
  "role": "owner",
  "created_at": "2025-01-12T10:00:00Z",
  "updated_at": "2025-01-12T11:00:00Z"
}
```

### Error Responses

#### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

#### 400 Bad Request (Validation Error)
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowe dane",
  "details": {
    "full_name": "Imię musi mieć co najmniej 2 znaki"
  }
}
```

#### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Użytkownik nie został znaleziony"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "Wystąpił błąd serwera"
}
```

## 5. Przepływ danych

### High-level Flow
```
Client Request
    ↓
API Route (/api/users/me.ts - PATCH handler)
    ↓
1. Weryfikacja autoryzacji (context.locals.user)
    ↓
2. Walidacja request body (Zod schema)
    ↓
3. Wywołanie user.service.updateCurrentUserProfile()
    ↓
User Service
    ↓
4. Supabase UPDATE query na tabeli 'users'
    ↓
5. RLS policy sprawdza: id = auth.uid()
    ↓
6. Database trigger: update_updated_at_column()
    ↓
7. Zwrócenie zaktualizowanego profilu
    ↓
API Route
    ↓
8. Response 200 z UserProfileDTO
    ↓
Client
```

### Szczegółowy przepływ

#### Krok 1: Weryfikacja autoryzacji
```typescript
const user = context.locals.user;
if (!user) {
  return new Response(JSON.stringify({
    error: 'Unauthorized',
    message: 'Brak autoryzacji'
  }), { status: 401 });
}
```

#### Krok 2: Walidacja input
```typescript
const body = await request.json();
const validated = updateUserProfileSchema.parse(body);
// Jeśli walidacja się nie powiedzie, Zod rzuci ZodError
```

#### Krok 3: Wywołanie serwisu
```typescript
const supabase = context.locals.supabase;
const updatedProfile = await updateCurrentUserProfile(
  supabase,
  user.id,
  validated
);
```

#### Krok 4-7: Service Layer
```typescript
// src/lib/services/user.service.ts
export async function updateCurrentUserProfile(
  supabase: SupabaseClient,
  userId: string,
  data: UpdateUserProfileCommand
): Promise<UserProfileDTO> {
  const { data: profile, error } = await supabase
    .from('users')
    .update({
      full_name: data.full_name
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  if (!profile) throw new Error('User not found');

  return profile;
}
```

**Uwaga:** RLS policy automatycznie sprawdza czy `id = auth.uid()`, więc nawet jeśli ktoś próbowałby manipulować `userId`, RLS to zablokuje.

#### Krok 8: Response
```typescript
return new Response(JSON.stringify(updatedProfile), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
});
```

## 6. Względy bezpieczeństwa

### Autoryzacja
- **JWT Authentication:** Weryfikowana automatycznie przez Supabase middleware
- **Context.locals.user:** Zawiera authenticated user lub null
- **Early return:** Jeśli `context.locals.user` jest null, zwróć 401

### Row Level Security (RLS)
Tabela `users` ma następującą policy:
```sql
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
```

**Implikacje:**
- Użytkownik może aktualizować TYLKO swój profil
- Nawet jeśli API route miałaby lukę, RLS zapobiegnie aktualizacji cudzego profilu
- Nie trzeba dodawać dodatkowych sprawdzeń w kodzie aplikacji

### Input Validation
- **Zod schema:** Waliduje typ i format danych
- **Trim whitespace:** Usuwa spacje na początku i końcu `full_name`
- **Minimum length:** 2 znaki dla `full_name`
- **Maksimum:** Brak limitu w MVP (może być dodany post-MVP)

### Ograniczenie pól
- API akceptuje TYLKO pole `full_name`
- Inne pola (email, role, id, timestamps) są ignorowane lub niemożliwe do zmiany
- `email` jest read-only (zarządzane przez Supabase Auth)
- `role` jest read-only (ustawiane przy rejestracji)
- `created_at`, `updated_at` są zarządzane przez bazę danych

### HTTPS/SSL
- Produkcja: Wymuszony HTTPS (DigitalOcean + Let's Encrypt)
- Development: HTTP localhost

### Rate Limiting
- Supabase zapewnia built-in rate limiting (100 req/s per IP)

## 7. Obsługa błędów

### 401 Unauthorized
**Scenariusz:**
- Brak tokenu JWT w headerze Authorization
- Token wygasły lub nieprawidłowy
- Użytkownik nie jest zalogowany

**Obsługa:**
```typescript
if (!context.locals.user) {
  return new Response(JSON.stringify({
    error: 'Unauthorized',
    message: 'Brak autoryzacji'
  }), { status: 401 });
}
```

### 400 Bad Request (Validation Error)
**Scenariusz:**
- `full_name` ma mniej niż 2 znaki
- `full_name` nie jest stringiem
- Brak pola `full_name` w request body
- Request body jest nieprawidłowym JSON

**Obsługa:**
```typescript
try {
  const body = await request.json();
  const validated = updateUserProfileSchema.parse(body);
} catch (error) {
  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({
      error: 'Validation Error',
      message: 'Nieprawidłowe dane',
      details: error.flatten().fieldErrors
    }), { status: 400 });
  }
  // Błąd parsowania JSON
  return new Response(JSON.stringify({
    error: 'Bad Request',
    message: 'Nieprawidłowy format żądania'
  }), { status: 400 });
}
```

### 404 Not Found
**Scenariusz:**
- Użytkownik nie istnieje w tabeli `users` (teoretycznie niemożliwe)
- UPDATE nie zwrócił żadnego rekordu

**Obsługa:**
```typescript
// W service layer:
if (!profile) {
  throw new Error('User not found');
}

// W API route (catch):
if (error.message === 'User not found') {
  return new Response(JSON.stringify({
    error: 'Not Found',
    message: 'Użytkownik nie został znaleziony'
  }), { status: 404 });
}
```

### 500 Internal Server Error
**Scenariusz:**
- Błąd połączenia z bazą danych
- Nieoczekiwany błąd w kodzie
- Supabase API error

**Obsługa:**
```typescript
try {
  // ... logika
} catch (error) {
  console.error('Error updating user profile:', error);
  return new Response(JSON.stringify({
    error: 'Internal Server Error',
    message: 'Wystąpił błąd serwera'
  }), { status: 500 });
}
```

**Logowanie błędów:**
- `console.error()` dla błędów serwera (widoczne w logach DigitalOcean)
- Nie ujawniaj szczegółów błędów użytkownikowi (bezpieczeństwo)

## 8. Rozważania dotyczące wydajności

### Optymalizacje
1. **Single query:** Jedna operacja UPDATE + SELECT w jednym zapytaniu (`.update().select().single()`)
2. **Indexed fields:** Pole `id` jest PRIMARY KEY (automatyczny index)
3. **No N+1 queries:** Endpoint nie wymaga dodatkowych zapytań

### Potencjalne wąskie gardła
- **Brak:** Endpoint jest prosty i wydajny
- **RLS overhead:** Minimalny (prosty warunek `id = auth.uid()`)

### Caching
- **Nie wymagany:** Profil użytkownika jest aktualizowany rzadko
- **Post-MVP:** Rozważyć cache w przeglądarce (ETags, Cache-Control headers)

### Database Triggers
- **update_updated_at_column():** Automatycznie aktualizuje `updated_at` przy UPDATE
- **Overhead:** Minimalny

## 9. Etapy wdrożenia

### Krok 1: Utworzenie User Service
**Plik:** `src/lib/services/user.service.ts`

```typescript
import type { SupabaseClient } from '@/db/supabase.client';
import type { UpdateUserProfileCommand, UserProfileDTO } from '@/types';

/**
 * Update current user's profile (full_name only)
 * @param supabase - Supabase client from context.locals
 * @param userId - Current user's ID (from context.locals.user.id)
 * @param data - Update data (full_name)
 * @returns Updated user profile
 * @throws Error if update fails or user not found
 */
export async function updateCurrentUserProfile(
  supabase: SupabaseClient,
  userId: string,
  data: UpdateUserProfileCommand
): Promise<UserProfileDTO> {
  const { data: profile, error } = await supabase
    .from('users')
    .update({
      full_name: data.full_name
    })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Supabase error updating user profile:', error);
    throw error;
  }

  if (!profile) {
    throw new Error('User not found');
  }

  return profile as UserProfileDTO;
}
```

### Krok 2: Utworzenie API Route
**Plik:** `src/pages/api/users/me.ts`

```typescript
import type { APIContext } from 'astro';
import { z } from 'zod';
import { updateCurrentUserProfile } from '@/lib/services/user.service';
import type { UpdateUserProfileCommand } from '@/types';

export const prerender = false;

// Zod validation schema
const updateUserProfileSchema = z.object({
  full_name: z.string()
    .trim()
    .min(2, 'Imię musi mieć co najmniej 2 znaki')
});

/**
 * PATCH /api/users/me
 * Update current user's profile
 */
export async function PATCH(context: APIContext): Promise<Response> {
  try {
    // 1. Weryfikacja autoryzacji
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

    // 2. Parsowanie i walidacja request body
    let body: unknown;
    try {
      body = await context.request.json();
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'Nieprawidłowy format żądania'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Walidacja za pomocą Zod
    const validationResult = updateUserProfileSchema.safeParse(body);
    if (!validationResult.success) {
      return new Response(JSON.stringify({
        error: 'Validation Error',
        message: 'Nieprawidłowe dane',
        details: validationResult.error.flatten().fieldErrors
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const validated = validationResult.data as UpdateUserProfileCommand;

    // 4. Wywołanie serwisu
    const supabase = context.locals.supabase;
    const updatedProfile = await updateCurrentUserProfile(
      supabase,
      user.id,
      validated
    );

    // 5. Zwrócenie zaktualizowanego profilu
    return new Response(JSON.stringify(updatedProfile), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Obsługa błędu "User not found"
    if (error instanceof Error && error.message === 'User not found') {
      return new Response(JSON.stringify({
        error: 'Not Found',
        message: 'Użytkownik nie został znaleziony'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Ogólny błąd serwera
    console.error('Error in PATCH /api/users/me:', error);
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

### Krok 3: Testowanie

#### Testy manualne (Postman/Thunder Client)

**Test 1: Sukces (200 OK)**
```http
PATCH http://localhost:4321/api/users/me
Authorization: Bearer <valid-jwt-token>
Content-Type: application/json

{
  "full_name": "Jan Nowak"
}
```

Oczekiwany rezultat:
- Status: 200
- Body: UserProfileDTO z zaktualizowanym `full_name`

**Test 2: Brak autoryzacji (401)**
```http
PATCH http://localhost:4321/api/users/me
Content-Type: application/json

{
  "full_name": "Jan Nowak"
}
```

Oczekiwany rezultat:
- Status: 401
- Body: `{ "error": "Unauthorized", "message": "Brak autoryzacji" }`

**Test 3: Validation error (400)**
```http
PATCH http://localhost:4321/api/users/me
Authorization: Bearer <valid-jwt-token>
Content-Type: application/json

{
  "full_name": "X"
}
```

Oczekiwany rezultat:
- Status: 400
- Body: `{ "error": "Validation Error", "message": "Nieprawidłowe dane", "details": {...} }`

**Test 4: Brak pola full_name (400)**
```http
PATCH http://localhost:4321/api/users/me
Authorization: Bearer <valid-jwt-token>
Content-Type: application/json

{}
```

Oczekiwany rezultat:
- Status: 400
- Body: Validation Error

**Test 5: Whitespace trimming**
```http
PATCH http://localhost:4321/api/users/me
Authorization: Bearer <valid-jwt-token>
Content-Type: application/json

{
  "full_name": "  Jan Nowak  "
}
```

Oczekiwany rezultat:
- Status: 200
- Body: `full_name` powinno być "Jan Nowak" (bez spacji)

#### Testy automatyczne (opcjonalne dla MVP)
- Unit testy dla `user.service.ts` (mockowanie Supabase client)
- Integration testy dla API route (testowanie całego flow)

### Krok 4: Weryfikacja RLS
Sprawdzić w Supabase Dashboard → Authentication → Policies:
- Policy "Users can update own profile" powinna być enabled
- Test: Próba aktualizacji cudzego profilu przez manipulację tokenu powinna być zablokowana

### Krok 5: Dokumentacja
- [x] Plan implementacji utworzony
- [ ] API documentation (Swagger/OpenAPI) - opcjonalnie post-MVP
- [ ] Code comments w service i API route
- [ ] README update (jeśli dotyczy)

### Krok 6: Code Review Checklist
- [ ] Czy używam `context.locals.supabase` zamiast globalnego klienta?
- [ ] Czy używam `context.locals.user` do autoryzacji?
- [ ] Czy wszystkie komunikaty błędów są po polsku?
- [ ] Czy używam early returns dla błędów?
- [ ] Czy walidacja Zod jest prawidłowa?
- [ ] Czy obsługa błędów jest kompletna?
- [ ] Czy logowanie błędów jest implementowane?
- [ ] Czy RLS policy jest aktywna?
- [ ] Czy endpoint zwraca odpowiednie kody statusu?
- [ ] Czy TypeScript types są poprawne?

### Krok 7: Deployment
1. Commit kodu do repozytorium
2. Push do branch (np. `feature/patch-user-me`)
3. Utworzenie Pull Request
4. Code review
5. Merge do `main`
6. GitHub Actions → Deploy to DigitalOcean
7. Smoke testing na produkcji

## 10. Dodatkowe uwagi

### Przyszłe rozszerzenia (post-MVP)
- Walidacja `full_name` regex (tylko litery i spacje)
- Maksymalna długość `full_name` (np. 100 znaków)
- Edycja email (wymaga weryfikacji przez Supabase Auth)
- Zmiana hasła (dedykowany endpoint)
- Upload avatar (integracja z Supabase Storage)
- Soft delete konta użytkownika

### Znane ograniczenia
- Pole `email` nie może być edytowane przez ten endpoint (zarządzane przez Supabase Auth)
- Pole `role` nie może być edytowane (security concern)
- Brak walidacji regex dla `full_name` (MVP)
- Brak limitu długości `full_name` (MVP)

### Bezpieczeństwo długoterminowe
- **Post-MVP:** Audit log dla zmian profilu użytkownika
- **Post-MVP:** Rate limiting per user (nie tylko per IP)
- **Post-MVP:** Email notification o zmianie profilu

---

**Status dokumentu:** Gotowy do implementacji
**Data utworzenia:** 2025-01-13
**Ostatnia aktualizacja:** 2025-01-13
**Autor:** AI Development Assistant
