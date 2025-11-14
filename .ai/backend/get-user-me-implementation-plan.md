# API Endpoint Implementation Plan: GET /api/users/me

## 1. Przegląd punktu końcowego

Endpoint `GET /api/users/me` zwraca profil zalogowanego użytkownika wraz z jego rolą (owner lub tenant) i danymi profilowymi. Jest to podstawowy endpoint wykorzystywany do:
- Identyfikacji zalogowanego użytkownika
- Weryfikacji roli użytkownika (owner/tenant) dla warunkowego renderowania UI
- Pobierania danych profilowych do wyświetlenia w aplikacji

Endpoint jest dostępny dla wszystkich zalogowanych użytkowników (owner i tenant) i wymaga ważnego JWT tokenu w nagłówku Authorization.

## 2. Szczegóły żądania

- **Metoda HTTP:** GET
- **Struktura URL:** `/api/users/me`
- **Parametry:**
  - Wymagane: Brak parametrów query/path
  - Opcjonalne: Brak
- **Request Headers:**
  - `Authorization: Bearer <supabase-jwt-token>` (wymagany)
- **Request Body:** Brak (metoda GET)

## 3. Wykorzystywane typy

### DTOs (Data Transfer Objects)

```typescript
// Typ odpowiedzi - zdefiniowany w src/types.ts:77
export type UserProfileDTO = Tables<'users'>;

// Struktura (z database.types.ts):
{
  id: string;              // UUID użytkownika z auth.users
  email: string;           // Adres email
  full_name: string;       // Pełna nazwa użytkownika
  role: 'owner' | 'tenant'; // Rola w systemie
  created_at: string;      // Timestamp utworzenia konta
  updated_at: string;      // Timestamp ostatniej aktualizacji
}
```

### Command Models

Brak - endpoint GET nie przyjmuje danych wejściowych.

### Typy wewnętrzne

```typescript
// Typ dla Supabase client (z context.locals)
import type { SupabaseClient } from '@/db/supabase.client';

// Typ dla autoryzowanego użytkownika
type AuthUser = {
  id: string;
  email?: string;
  // ... inne pola z Supabase Auth
};
```

## 4. Szczegóły odpowiedzi

### Sukces (200 OK)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "jan.kowalski@example.com",
  "full_name": "Jan Kowalski",
  "role": "owner",
  "created_at": "2025-01-12T10:00:00.000Z",
  "updated_at": "2025-01-12T10:00:00.000Z"
}
```

**Content-Type:** `application/json`

### Błąd 401 (Unauthorized)

```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

Zwracany gdy:
- Brak nagłówka Authorization
- Nieprawidłowy lub wygasły JWT token
- Token nie zawiera prawidłowego user ID

### Błąd 404 (Not Found)

```json
{
  "error": "Not Found",
  "message": "Profil użytkownika nie został znaleziony"
}
```

Zwracany gdy:
- Użytkownik jest zalogowany (ma ważny token), ale nie ma wpisu w tabeli `users`
- Edge case: trigger `handle_new_user()` nie utworzył profilu podczas rejestracji

### Błąd 500 (Internal Server Error)

```json
{
  "error": "Internal Server Error",
  "message": "Wystąpił błąd serwera"
}
```

Zwracany gdy wystąpi nieoczekiwany błąd bazy danych lub serwera.

## 5. Przepływ danych

### Diagram przepływu

```
[Client]
   |
   | HTTP GET /api/users/me
   | Authorization: Bearer <JWT>
   |
   v
[Astro Middleware]
   |
   | Weryfikacja JWT przez Supabase
   | Ustawienie context.locals.user
   | Ustawienie context.locals.supabase
   |
   v
[API Route: src/pages/api/users/me.ts]
   |
   | 1. Sprawdzenie context.locals.user (401 jeśli null)
   | 2. Pobranie user ID z context.locals.user.id
   |
   v
[UserService.getCurrentUser()]
   |
   | 3. Query do Supabase:
   |    SELECT * FROM users WHERE id = auth.uid()
   | 4. RLS Policy weryfikuje dostęp
   |
   v
[Supabase Database]
   |
   | 5. Zwrócenie danych użytkownika
   |
   v
[UserService]
   |
   | 6. Walidacja wyniku (404 jeśli null)
   | 7. Mapowanie na UserProfileDTO
   |
   v
[API Route]
   |
   | 8. Zwrócenie Response 200 z JSON
   |
   v
[Client]
```

### Szczegóły interakcji

1. **Middleware (src/middleware/index.ts):**
   - Weryfikuje JWT token z nagłówka Authorization
   - Tworzy Supabase client z tokenem
   - Pobiera user z `supabase.auth.getUser()`
   - Ustawia `context.locals.user` i `context.locals.supabase`

2. **API Route (src/pages/api/users/me.ts):**
   - Sprawdza czy `context.locals.user` istnieje
   - Wywołuje `UserService.getCurrentUser()`
   - Formatuje i zwraca odpowiedź

3. **UserService (src/lib/services/user.service.ts):**
   - Wykonuje query do tabeli `users`
   - RLS policy automatycznie filtruje wyniki (tylko własny profil)
   - Obsługuje błędy bazy danych
   - Zwraca UserProfileDTO lub rzuca błąd

4. **Supabase Database:**
   - Wykonuje query z filtrem RLS
   - Polityka: `id = auth.uid()`
   - Zwraca dane użytkownika

## 6. Względy bezpieczeństwa

### Autentykacja

- **JWT Token:** Wymagany w nagłówku `Authorization: Bearer <token>`
- **Weryfikacja:** Automatyczna przez Supabase Auth w middleware
- **Session Management:** Obsługiwany przez Supabase (expiration, refresh tokens)

### Autoryzacja

- **Row Level Security (RLS):**
  ```sql
  -- Policy: Users can view own profile
  CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    TO authenticated
    USING (id = auth.uid());
  ```
  - Zapewnia, że użytkownik widzi tylko swój profil
  - Nawet jeśli ktoś podmieni user ID w kodzie, RLS zablokuje dostęp

### Walidacja danych wejściowych

- **Brak parametrów:** Endpoint nie przyjmuje parametrów, więc minimalne ryzyko injection
- **User ID:** Pochodzi z zaufanego źródła (JWT token zweryfikowany przez Supabase)

### Ochrona przed atakami

- **SQL Injection:** Chronione przez Supabase prepared statements
- **XSS:** Chronione przez React escaping (dane używane w UI)
- **CSRF:** Nieistotne dla GET endpointu bez side effects
- **Rate Limiting:** Built-in przez Supabase (100 req/s per IP)

### Wrażliwe dane

- Email użytkownika jest zwracany, ale tylko dla właściciela konta
- Hasło NIE jest przechowywane ani zwracane (zarządzane przez Supabase Auth)
- Brak danych finansowych w tym endpoincie

## 7. Obsługa błędów

### Scenariusze błędów i kody statusu

| Scenariusz | Kod | Komunikat | Przyczyna |
|------------|-----|-----------|-----------|
| Brak tokenu autoryzacyjnego | 401 | "Brak autoryzacji" | Middleware nie ustawił `context.locals.user` |
| Nieprawidłowy JWT token | 401 | "Brak autoryzacji" | Token wygasł lub jest nieprawidłowy |
| Profil nie istnieje | 404 | "Profil użytkownika nie został znaleziony" | User jest w auth.users, ale nie w public.users |
| Błąd bazy danych | 500 | "Wystąpił błąd serwera" | Problem z połączeniem lub query |
| Nieoczekiwany błąd | 500 | "Wystąpił błąd serwera" | Inny błąd w trakcie przetwarzania |

### Strategia obsługi błędów

```typescript
// W API Route
try {
  // 1. Guard clause - sprawdź autentykację
  if (!context.locals.user) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      message: 'Brak autoryzacji'
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // 2. Wywołaj service
  const userProfile = await userService.getCurrentUser(
    context.locals.supabase,
    context.locals.user.id
  );

  // 3. Guard clause - sprawdź czy profil istnieje
  if (!userProfile) {
    return new Response(JSON.stringify({
      error: 'Not Found',
      message: 'Profil użytkownika nie został znaleziony'
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  // 4. Happy path - zwróć dane
  return new Response(JSON.stringify(userProfile), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

} catch (error) {
  // 5. Logowanie błędu
  console.error('Error in GET /api/users/me:', error);

  // 6. Zwróć generyczny błąd 500
  return new Response(JSON.stringify({
    error: 'Internal Server Error',
    message: 'Wystąpił błąd serwera'
  }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}
```

### Logowanie błędów

- **Console.error:** Dla wszystkich błędów (development i production)
- **Struktura logu:** `[Timestamp] [Endpoint] [Error Type] [Message] [Stack trace]`
- **Brak logowania:** Danych wrażliwych (hasła, tokeny)
- **Future:** Integracja z Sentry/LogRocket dla production monitoring

## 8. Rozważania dotyczące wydajności

### Potencjalne wąskie gardła

1. **Database Query:**
   - Query do tabeli `users` przez primary key (id)
   - **Optymalizacja:** Primary key index zapewnia O(1) lookup
   - **Brak problemu:** Single row fetch jest bardzo szybki

2. **RLS Policy Evaluation:**
   - Każde zapytanie musi przejść przez RLS policy
   - **Koszt:** Minimalny - prosta warunek `id = auth.uid()`
   - **Brak problemu:** Supabase optymalizuje RLS queries

3. **Network Latency:**
   - Roundtrip do Supabase cloud database
   - **Mitigation:** Supabase używa connection pooling
   - **Future:** Rozważyć caching dla często używanych profili

### Strategie optymalizacji

1. **Caching (future enhancement):**
   ```typescript
   // Redis cache dla user profiles
   // TTL: 5 minut
   // Invalidacja: przy PATCH /api/users/me
   const cachedProfile = await redis.get(`user:${userId}`);
   if (cachedProfile) return JSON.parse(cachedProfile);
   ```

2. **Response Compression:**
   - Włączyć gzip/brotli compression na poziomie reverse proxy (Nginx)
   - Zmniejsza payload z ~200B do ~120B

3. **CDN Caching:**
   - NIE cachować na CDN (dane specyficzne dla użytkownika)
   - `Cache-Control: private, no-cache`

4. **Database Connection Pooling:**
   - Supabase automatycznie zarządza pool connectionsami
   - Brak dodatkowej konfiguracji wymaganej

### Oczekiwana wydajność

- **Response time:** < 100ms (p95)
- **Throughput:** > 100 req/s per user
- **Database load:** Minimalny (indexed lookup)

### Monitoring

- **Metryki do śledzenia:**
  - Response time (p50, p95, p99)
  - Error rate (4xx, 5xx)
  - Request count per minute
  - Database query time

- **Alerty:**
  - Error rate > 1% (5xx errors)
  - Response time p95 > 500ms
  - Database connection pool exhausted

## 9. Etapy wdrożenia

### Faza 1: Przygotowanie (Setup)

1. **Utworzenie struktury plików:**
   ```bash
   # API Route
   src/pages/api/users/me.ts

   # Service
   src/lib/services/user.service.ts

   # Tests (opcjonalnie)
   src/pages/api/users/me.test.ts
   src/lib/services/user.service.test.ts
   ```

2. **Zaimportowanie wymaganych typów:**
   ```typescript
   // W me.ts
   import type { APIContext } from 'astro';
   import type { UserProfileDTO } from '@/types';
   import type { SupabaseClient } from '@/db/supabase.client';

   // W user.service.ts
   import type { SupabaseClient } from '@/db/supabase.client';
   import type { UserProfileDTO } from '@/types';
   ```

### Faza 2: Implementacja Service Layer

3. **Utworzenie UserService:**
   ```typescript
   // src/lib/services/user.service.ts
   export class UserService {
     /**
      * Pobiera profil aktualnie zalogowanego użytkownika
      * @param supabase - Klient Supabase z context.locals
      * @param userId - ID użytkownika z JWT token
      * @returns UserProfileDTO lub null jeśli nie znaleziono
      * @throws Error jeśli wystąpi błąd bazy danych
      */
     static async getCurrentUser(
       supabase: SupabaseClient,
       userId: string
     ): Promise<UserProfileDTO | null> {
       const { data, error } = await supabase
         .from('users')
         .select('*')
         .eq('id', userId)
         .single();

       if (error) {
         // PostgresError - nie znaleziono (PGRST116)
         if (error.code === 'PGRST116') {
           return null;
         }
         // Inny błąd bazy danych
         throw error;
       }

       return data as UserProfileDTO;
     }
   }
   ```

4. **Dodanie logowania błędów w service:**
   ```typescript
   if (error) {
     console.error('[UserService.getCurrentUser] Database error:', {
       code: error.code,
       message: error.message,
       userId
     });

     if (error.code === 'PGRST116') {
       return null;
     }
     throw error;
   }
   ```

### Faza 3: Implementacja API Route

5. **Utworzenie GET handler:**
   ```typescript
   // src/pages/api/users/me.ts
   import type { APIContext } from 'astro';
   import type { UserProfileDTO } from '@/types';
   import { UserService } from '@/lib/services/user.service';

   export const prerender = false;

   export async function GET(context: APIContext): Promise<Response> {
     try {
       // 1. Guard clause - weryfikacja autentykacji
       if (!context.locals.user) {
         return new Response(
           JSON.stringify({
             error: 'Unauthorized',
             message: 'Brak autoryzacji'
           }),
           {
             status: 401,
             headers: { 'Content-Type': 'application/json' }
           }
         );
       }

       // 2. Pobranie profilu użytkownika
       const userProfile = await UserService.getCurrentUser(
         context.locals.supabase,
         context.locals.user.id
       );

       // 3. Guard clause - sprawdzenie czy profil istnieje
       if (!userProfile) {
         return new Response(
           JSON.stringify({
             error: 'Not Found',
             message: 'Profil użytkownika nie został znaleziony'
           }),
           {
             status: 404,
             headers: { 'Content-Type': 'application/json' }
           }
         );
       }

       // 4. Happy path - zwrócenie profilu
       return new Response(JSON.stringify(userProfile), {
         status: 200,
         headers: {
           'Content-Type': 'application/json',
           'Cache-Control': 'private, no-cache'
         }
       });

     } catch (error) {
       // 5. Obsługa błędów
       console.error('[GET /api/users/me] Unexpected error:', error);

       return new Response(
         JSON.stringify({
           error: 'Internal Server Error',
           message: 'Wystąpił błąd serwera'
         }),
         {
           status: 500,
           headers: { 'Content-Type': 'application/json' }
         }
       );
     }
   }
   ```

### Faza 4: Weryfikacja RLS Policies

6. **Sprawdzenie istniejących RLS policies:**
   - Zweryfikować w Supabase Dashboard, że policy "Users can view own profile" istnieje
   - Policy z db-plan.md (linie 606-610):
     ```sql
     CREATE POLICY "Users can view own profile"
       ON users FOR SELECT
       TO authenticated
       USING (id = auth.uid());
     ```

7. **Jeśli brak policy, utworzyć migrację:**
   ```sql
   -- supabase/migrations/YYYYMMDDHHMMSS_add_users_rls_policies.sql

   -- Enable RLS
   ALTER TABLE users ENABLE ROW LEVEL SECURITY;

   -- Policy: Users can view own profile
   CREATE POLICY "Users can view own profile"
     ON users FOR SELECT
     TO authenticated
     USING (id = auth.uid());
   ```

### Faza 5: Testowanie (opcjonalne dla MVP)

8. **Testy jednostkowe UserService:**
   ```typescript
   // src/lib/services/user.service.test.ts
   import { describe, it, expect, vi } from 'vitest';
   import { UserService } from './user.service';

   describe('UserService.getCurrentUser', () => {
     it('should return user profile when found', async () => {
       const mockSupabase = {
         from: vi.fn().mockReturnValue({
           select: vi.fn().mockReturnValue({
             eq: vi.fn().mockReturnValue({
               single: vi.fn().mockResolvedValue({
                 data: { id: '123', email: 'test@example.com' },
                 error: null
               })
             })
           })
         })
       };

       const result = await UserService.getCurrentUser(
         mockSupabase as any,
         '123'
       );

       expect(result).toEqual({ id: '123', email: 'test@example.com' });
     });

     it('should return null when user not found', async () => {
       const mockSupabase = {
         from: vi.fn().mockReturnValue({
           select: vi.fn().mockReturnValue({
             eq: vi.fn().mockReturnValue({
               single: vi.fn().mockResolvedValue({
                 data: null,
                 error: { code: 'PGRST116' }
               })
             })
           })
         })
       };

       const result = await UserService.getCurrentUser(
         mockSupabase as any,
         '123'
       );

       expect(result).toBeNull();
     });
   });
   ```

9. **Testy integracyjne API route:**
   ```typescript
   // src/pages/api/users/me.test.ts
   import { describe, it, expect, beforeEach } from 'vitest';
   import { GET } from './me';

   describe('GET /api/users/me', () => {
     it('should return 401 when user not authenticated', async () => {
       const context = {
         locals: { user: null }
       } as any;

       const response = await GET(context);
       expect(response.status).toBe(401);

       const body = await response.json();
       expect(body.error).toBe('Unauthorized');
     });

     it('should return 200 with user profile when authenticated', async () => {
       // Mock context with authenticated user
       // ... test implementation
     });
   });
   ```

### Faza 6: Testowanie manualne

10. **Testowanie z lokalnym Supabase:**
    ```bash
    # Uruchom lokalny Supabase
    npx supabase start

    # Uruchom dev server
    npm run dev
    ```

11. **Testowanie z cURL:**
    ```bash
    # 1. Zaloguj się i pobierz JWT token
    curl -X POST http://localhost:4321/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email": "test@example.com", "password": "password123"}'

    # 2. Test GET /api/users/me z tokenem
    curl -X GET http://localhost:4321/api/users/me \
      -H "Authorization: Bearer <JWT_TOKEN>"

    # 3. Test bez tokenu (oczekiwane 401)
    curl -X GET http://localhost:4321/api/users/me
    ```

12. **Testowanie w przeglądarce:**
    - Zaloguj się do aplikacji
    - Otwórz DevTools → Network
    - Wywołaj endpoint przez fetch:
      ```javascript
      fetch('/api/users/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).then(r => r.json()).then(console.log);
      ```

### Faza 7: Dokumentacja i Code Review

13. **Dodanie JSDoc komentarzy:**
    - W API route (me.ts)
    - W UserService
    - Opis parametrów, zwracanych wartości, możliwych błędów

14. **Aktualizacja dokumentacji API:**
    - Zweryfikować zgodność z api-plan.md
    - Dodać przykłady użycia w README (jeśli dotyczy)

15. **Code Review checklist:**
    - [ ] Kod zgodny z zasadami z claude.md
    - [ ] Używa context.locals.supabase (nie bezpośredni import)
    - [ ] Wszystkie błędy są obsługiwane (early returns)
    - [ ] Komunikaty błędów po polsku
    - [ ] RLS policies są włączone
    - [ ] Brak wrażliwych danych w logach
    - [ ] Response headers poprawnie ustawione
    - [ ] Cache-Control: private, no-cache

### Faza 8: Deployment

16. **Pre-deployment checklist:**
    - [ ] Wszystkie testy przechodzą
    - [ ] Linter nie zgłasza błędów
    - [ ] TypeScript kompiluje się bez błędów
    - [ ] Migracje bazy danych zastosowane
    - [ ] RLS policies zweryfikowane

17. **Deployment na staging:**
    ```bash
    git checkout -b feature/api-users-me
    git add .
    git commit -m "feat: implement GET /api/users/me endpoint"
    git push origin feature/api-users-me
    ```

18. **Testowanie na staging:**
    - Weryfikacja z prawdziwymi danymi Supabase
    - Test wszystkich scenariuszy (sukces, błędy)
    - Weryfikacja logów

19. **Merge do main i deployment na production:**
    ```bash
    # Po code review i zatwierdzeniu PR
    git checkout main
    git merge feature/api-users-me
    git push origin main
    ```

20. **Post-deployment verification:**
    - Sprawdzenie healthcheck endpointu
    - Monitoring błędów w pierwszych 24h
    - Weryfikacja metryk wydajności

## 10. Checklisty i dodatkowe zasoby

### Pre-implementation Checklist

- [ ] Przeczytane i zrozumiane: api-plan.md, db-plan.md, types.ts, claude.md
- [ ] Zweryfikowane: tabela `users` istnieje w bazie danych
- [ ] Zweryfikowane: RLS policies są włączone dla tabeli `users`
- [ ] Zweryfikowane: middleware ustawia context.locals.user i context.locals.supabase
- [ ] Utworzone: pliki user.service.ts i me.ts

### Implementation Checklist

- [ ] UserService.getCurrentUser() zaimplementowany
- [ ] GET handler w me.ts zaimplementowany
- [ ] Guard clauses dla autentykacji dodane
- [ ] Obsługa błędów zaimplementowana
- [ ] Response headers poprawnie ustawione
- [ ] Komunikaty błędów po polsku

### Testing Checklist

- [ ] Test: 401 gdy brak tokenu
- [ ] Test: 200 z danymi użytkownika gdy zalogowany
- [ ] Test: 404 gdy profil nie istnieje (edge case)
- [ ] Test: RLS policy blokuje dostęp do innych profili
- [ ] Test manualny z cURL/Postman
- [ ] Test integracyjny w przeglądarce

### Security Checklist

- [ ] JWT token weryfikowany przez middleware
- [ ] RLS policy zapewnia dostęp tylko do własnego profilu
- [ ] Brak wrażliwych danych w response (hasła, tokeny)
- [ ] Brak wrażliwych danych w logach
- [ ] Cache-Control: private, no-cache

### Performance Checklist

- [ ] Query używa primary key index (id)
- [ ] Brak N+1 query problem
- [ ] Response compression włączona (na reverse proxy)
- [ ] Monitoring wydajności skonfigurowany

## 11. Troubleshooting

### Problem: 401 Unauthorized mimo poprawnego tokenu

**Możliwe przyczyny:**
- Middleware nie jest poprawnie skonfigurowany
- Token wygasł
- context.locals.user nie jest ustawiany

**Rozwiązanie:**
1. Sprawdź middleware w src/middleware/index.ts
2. Zweryfikuj że middleware wywołuje `supabase.auth.getUser()`
3. Dodaj logging w middleware do debugowania
4. Sprawdź czy token jest świeży (nie wygasły)

### Problem: 404 Not Found dla istniejącego użytkownika

**Możliwe przyczyny:**
- Trigger `handle_new_user()` nie utworzył profilu podczas rejestracji
- User istnieje w auth.users, ale nie w public.users

**Rozwiązanie:**
1. Sprawdź czy trigger `on_auth_user_created` jest włączony
2. Ręcznie dodaj użytkownika do tabeli users:
   ```sql
   INSERT INTO public.users (id, email, full_name, role)
   VALUES ('user-uuid', 'email@example.com', 'Full Name', 'owner');
   ```

### Problem: 500 Internal Server Error

**Możliwe przyczyny:**
- Błąd połączenia z bazą danych
- RLS policy odrzuca query
- Błąd w kodzie service

**Rozwiązanie:**
1. Sprawdź logi serwera (console.error)
2. Zweryfikuj connection string do Supabase
3. Sprawdź Supabase Dashboard → Logs
4. Przetestuj query bezpośrednio w Supabase SQL Editor

### Problem: RLS policy blokuje wszystkie requesty

**Możliwe przyczyny:**
- Brak policy dla roli `authenticated`
- Policy używa złej funkcji (nie auth.uid())

**Rozwiązanie:**
1. Sprawdź policies w Supabase Dashboard → Authentication → Policies
2. Upewnij się że policy używa `auth.uid()` a nie `current_user`
3. Zweryfikuj że policy jest dla roli `authenticated`

## 12. Referencje

- [API Plan - User Management](../.ai/api-plan.md#L92-L165)
- [Database Plan - users table](../.ai/db-plan.md#L24-L46)
- [Database Plan - RLS Policies](../.ai/db-plan.md#L603-L621)
- [Types - UserProfileDTO](../src/types.ts#L77)
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Astro API Routes](https://docs.astro.build/en/core-concepts/endpoints/)

---

**Status:** Ready for Implementation
**Wersja:** 1.0
**Data utworzenia:** 2025-01-13
**Ostatnia aktualizacja:** 2025-01-13
