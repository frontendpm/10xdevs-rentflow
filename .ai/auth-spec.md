## Specyfikacja architektury modułu autentykacji (rejestracja, logowanie, reset hasła)

Dokument opisuje docelową architekturę modułu autentykacji Rentflow zgodnie z wymaganiami z PRD (US-001–US-006) oraz stackiem technologicznym (Astro + React + Supabase). Uwzględnia istniejące elementy aplikacji, tak aby nie naruszać aktualnego działania, oraz wskazuje różnice względem bieżącej implementacji logowania i rejestracji.

---

## 1. Architektura interfejsu użytkownika

### 1.1. Widoki i layouty w trybie auth vs non-auth

- **Layout auth**: `AuthLayout.astro`
  - Wspólny layout dla stron:
    - `/login`
    - `/register`
    - `/register/tenant`
    - `/reset-password` (inicjacja resetu)
    - `/reset-password/confirm` (ustawienie nowego hasła)
  - Odpowiada za:
    - ramę strony (logo/nazwa „Rentflow”, tytuł, podtytuł),
    - kontener „karty” z formularzem,
    - stopkę z linkami do `/regulamin`, `/polityka-prywatnosci` i `mailto:pomoc@rentflow.pl`.
  - Nie zawiera logiki domenowej ani walidacji – tylko layout i slot na formularz.

- **Layout aplikacyjny (non-auth)**: `DashboardLayout.astro` / inne layouty domenowe
  - Wykorzystany m.in. przez `/dashboard`, `/apartments/[id]`, `/onboarding`.
  - Widoki te wymagają zalogowanego użytkownika (guard po stronie SSR lub client-side, zgodny z PRD).

### 1.2. Strony Astro (routing) – tryb auth

#### `/login` – logowanie użytkownika (US-003)

- **Plik**: `src/pages/login.astro`
- **Typ renderowania**: statyczna strona Astro + wyspa React (`client:load`).
- **Layout**: `AuthLayout.astro` z:
  - `title="Zaloguj się"`,
  - `subtitle="Zarządzaj najmem w jednym miejscu."`.
- **Treść główna**:
  - Reactowa wyspa `LoginForm` (`src/components/features/auth/login-form.tsx`).
- **Odpowiedzialność strony**:
  - routing na `/login`,
  - wybór layoutu,
  - brak logiki walidacji i komunikacji z API (delegowane do `LoginForm`).

#### `/register` – rejestracja właściciela (US-001, US-010)

- **Plik**: `src/pages/register.astro`
- **Typ renderowania**: statyczna strona Astro + wyspa React (`client:load`).
- **Layout**: `AuthLayout.astro` z:
  - `title="Załóż konto właściciela"`,
  - `subtitle="Zarządzaj swoimi mieszkaniami w jednym miejscu."`.
- **Treść główna**:
  - Reactowa wyspa `RegisterOwnerForm` (`src/components/features/auth/register-owner-form.tsx`).
- **Odpowiedzialność strony**:
  - routing na `/register`,
  - brak logiki biznesowej – cała walidacja i integracja z Supabase w `RegisterOwnerForm`.

#### `/register/tenant` – rejestracja lokatora przez link zapraszający (US-002, US-043, US-050, US-051)

- **Plik**: `src/pages/register/tenant.astro`
- **Typ renderowania**: SSR (`export const prerender = false;`) – strona zależna od tokenu zaproszenia.
- **Wejście na widok**:
  - URL: `/register/tenant?token=<TOKEN>`.
  - Jeśli **brak** parametru `token` → redirect do `/login` (US-051).
- **Logika server-side (Astro)**:
  - wywołanie `GET /api/invitations/:token` (publiczny endpoint) w celu walidacji tokenu,
  - w przypadku statusu `400` lub innego błędu → redirect do `/invitation-expired` (US-050),
  - w przypadku sukcesu:
    - przekazanie danych o mieszkaniu i właścicielu (`ValidateInvitationDTO`) do widoku.
- **Layout**: `AuthLayout.astro` z:
  - `title="Rejestracja lokatora"`,
  - `subtitle="Utwórz konto, aby uzyskać dostęp do mieszkania"`.
- **Treść główna**:
  - sekcja informacyjna o mieszkaniu i właścicielu (read-only),
  - Reactowa wyspa `TenantRegisterForm` z propsem `token`.

#### `/reset-password` – inicjacja resetu hasła (US-005)

- **Plik (docelowy)**: `src/pages/reset-password.astro`
- **Typ renderowania**: statyczna strona Astro + wyspa React.
- **Cel**:
  - formularz z jednym polem `email`,
  - po wysłaniu – zainicjowanie wysyłki maila z linkiem resetującym (Supabase),
  - niezależnie od istnienia konta wyświetlany jest ten sam komunikat sukcesu.
- **Layout**: `AuthLayout.astro` z tytułem typu „Reset hasła”.
- **Treść główna**:
  - Reactowa wyspa `ForgotPasswordForm` (`src/components/features/auth/forgot-password-form.tsx`).

#### `/reset-password/confirm` – ustawienie nowego hasła (US-006)

- **Plik (docelowy)**: `src/pages/reset-password/confirm.astro`
- **Wejście na widok**:
  - użytkownik wchodzi z linku w mailu, wygenerowanego przez Supabase (`redirect_to=${PUBLIC_APP_URL}/reset-password/confirm`),
  - Supabase dodaje do URL fragment z `access_token` i innymi parametrami (hash).
- **Typ renderowania**:
  - strona Astro + Reactowa wyspa,
  - logika związana z tokenem odbywa się w React (odczyt `window.location.hash`).
- **Treść główna**:
  - Reactowa wyspa `ResetPasswordForm` (`src/components/features/auth/reset-password-form.tsx`),
  - pola: `password`, `passwordConfirm`.
- **Zachowanie**:
  - formularz waliduje hasło, a następnie wywołuje endpoint Supabase `auth/v1/user` z `Authorization: Bearer <access_token>` w celu ustawienia nowego hasła,
  - po sukcesie:
    - zapisuje nowy `access_token`/`refresh_token` (jeśli dostarczone),
    - ustawia cookies/localStorage jak przy logowaniu,
    - redirect na `/dashboard` lub `/login` z komunikatem (do decyzji UX).

### 1.3. Reactowe formularze i odpowiedzialności

#### `LoginForm` (`login-form.tsx`) – logowanie (US-003)

- **Odpowiedzialność**:
  - obsługa formularza logowania (pola `email`, `password`),
  - walidacja client-side przy użyciu Zod (`loginSchema`),
  - wywołanie Supabase Auth (`POST /auth/v1/token?grant_type=password`),
  - zapis `access_token` i `refresh_token` do:
    - `localStorage` (`rentflow_auth_token`, `rentflow_refresh_token`),
    - cookies (`rentflow_auth_token`, `rentflow_refresh_token`) – dla SSR/middleware,
  - wywołanie `GET /api/users/me` z nagłówkiem `Authorization: Bearer <access_token>` w celu pobrania profilu i roli,
  - ustalenie ścieżki docelowej:
    - właściciel:
      - jeśli brak mieszkań → redirect `/onboarding` (US-010),
      - w przeciwnym razie → `/dashboard`,
    - lokator: `/dashboard` (US-044).
- **Walidacja**:
  - `email`: wymagany, poprawny format (`z.string().trim().email`),
  - `password`: wymagane, min. 8 znaków (`z.string().min(8)`),
  - przycisk „Zaloguj się” `disabled`, gdy `!formState.isValid` lub trwa submit (US-007),
  - błędy Supabase mapowane na **ogólny** komunikat: „Nieprawidłowy e-mail lub hasło” (bez ujawniania istnienia konta).
- **Obsługa błędów**:
  - błąd walidacji backendu `/api/users/me` → czyszczenie tokenów + ogólny komunikat,
  - błędy sieciowe → komunikat „Nie udało się połączyć z serwerem…”.

#### `RegisterOwnerForm` (`register-owner-form.tsx`) – rejestracja właściciela (US-001)

- **Odpowiedzialność**:
  - obsługa formularza (pola: `full_name`, `email`, `password`, `confirmPassword`, `acceptTerms`),
  - walidacja client-side (schemat `registerOwnerSchema` zgodny z PRD),
  - integracja z Supabase Auth (`POST /auth/v1/signup`),
  - **docelowo**: automatyczne zalogowanie użytkownika i poprawne ustawienie sesji (brakujący element w aktualnej implementacji),
  - redirect do `/onboarding` po sukcesie (US-010).
- **Walidacja**:
  - `full_name`: wymagane, min. 2 znaki,
  - `email`: wymagany, poprawny format,
  - `password`: wymagane, min. 8 znaków,
  - `confirmPassword`: wymagane, identyczne jak `password`,
  - `acceptTerms`: musi być `true` (checkbox),
  - wszystkie błędy **inline** pod polami, przycisk `Załóż konto` zablokowany do czasu poprawności formularza (US-007).
- **Scenariusz sukcesu**:
  1. Wywołanie `POST /auth/v1/signup`.
  2. Po sukcesie:
     - albo użycie sesji Supabase (gdy korzystamy z klienta Supabase),
     - albo dodatkowe wywołanie `POST /auth/v1/token?grant_type=password` w celu pozyskania JWT (spójne z logowaniem).
  3. Zapis tokenów jak w `LoginForm`.
  4. Redirect na `/onboarding` (właściciel musi przejść kreator).
- **Scenariusze błędów**:
  - e-mail zajęty → komunikat globalny lub przy polu `email` („Ten adres e-mail jest już używany.”),
  - inne błędy Supabase → globalny komunikat („Wystąpił błąd podczas rejestracji…”),
  - błędy sieciowe → globalny komunikat o problemach z połączeniem.

#### `TenantRegisterForm` (`tenant-register-form.tsx`) – rejestracja lokatora (US-002, US-043)

- **Odpowiedzialność**:
  - obsługa formularza lokatora (pola: `full_name`, `email`, `password`, `passwordConfirm`, `acceptTerms`),
  - walidacja client-side (`registerTenantSchema`),
  - integracja z Supabase Auth (`signup` + `login`),
  - wywołanie `POST /api/invitations/:token/accept` z nagłówkiem `Authorization`,
  - zapis tokenów i redirect do `/dashboard`.
- **Docelowy flow (zachowany z aktualnej implementacji)**:
  1. `POST /auth/v1/signup` (lokator, role `tenant`).
  2. `POST /auth/v1/token?grant_type=password` – manualne logowanie po signupie (pozyskanie JWT).
  3. `POST /api/invitations/:token/accept` z `Authorization: Bearer <access_token>`.
  4. Zapis `access_token`/`refresh_token` w localStorage + cookies.
  5. Redirect do `/dashboard`.
- **Walidacja**:
  - identyczna jak w rejestracji właściciela (plus nazewnictwo pól zgodne z komponentem),
  - przycisk `Załóż konto` zablokowany, dopóki formularz jest niepoprawny.
- **Obsługa błędów biznesowych z `/api/invitations/:token/accept`**:
  - `INVALID_TOKEN` → komunikat + redirect `/invitation-expired`,
  - `USER_HAS_LEASE` → komunikat, brak redirectu (US-053),
  - `APARTMENT_HAS_LEASE` → komunikat + sugestia kontaktu z właścicielem,
  - `401` → komunikat o wygaśniętej sesji + redirect do `/login?redirect=/register/tenant?token=...`,
  - `500` → komunikat o błędzie serwera.

#### `ForgotPasswordForm` – inicjacja resetu hasła (US-005)

- **Nowy komponent**: `src/components/features/auth/forgot-password-form.tsx`.
- **Odpowiedzialność**:
  - pole `email` + walidacja formatu,
  - wywołanie endpointu backendowego (np. `POST /api/auth/password/reset-request`) lub bezpośrednio Supabase Auth (`recover/resetPasswordForEmail`) z podaniem `redirectTo=${PUBLIC_APP_URL}/reset-password/confirm`,
  - **nieujawnianie** czy konto istnieje:
    - zawsze po submitcie wyświetlany jest komunikat typu:
      - „Jeśli konto istnieje, wysłaliśmy instrukcję resetu hasła na podany adres e-mail”.
- **Walidacja**:
  - `email`: wymagany, poprawny format,
  - przycisk `Resetuj hasło` zablokowany, dopóki formularz jest niepoprawny.

#### `ResetPasswordForm` – ustawienie nowego hasła (US-006)

- **Nowy komponent**: `src/components/features/auth/reset-password-form.tsx`.
- **Odpowiedzialność**:
  - odczyt tokenu resetu (`access_token`) z `window.location.hash` (supabase recovery link),
  - formularz z polami:
    - `password`: nowe hasło,
    - `passwordConfirm`: powtórzenie hasła,
  - walidacja:
    - min. 8 znaków,
    - pola identyczne,
  - wywołanie Supabase REST:
    - `PUT ${PUBLIC_SUPABASE_URL}/auth/v1/user` z nagłówkiem `Authorization: Bearer <access_token>` i body `{ password: ... }`,
  - po sukcesie:
    - opcjonalne zapisanie tokenu (jeśli Supabase zwróci nową sesję),
    - redirect na `/login` lub `/dashboard` z komunikatem o sukcesie.
- **Obsługa błędów**:
  - token nieważny / wygasły → komunikat + redirect na `/login` lub dedykowaną stronę błędu,
  - błędy walidacji haseł – inline,
  - błędy sieciowe – globalny komunikat.

### 1.4. Walidacja i komunikaty błędów – przekrój

- **Poziom client-side (React + Zod)**:
  - wszystkie formularze auth używają schematów Zod:
    - zapewnia spójne komunikaty walidacyjne,
    - pozwala blokować submit, dopóki formularz jest poprawny (US-007).
  - błędy:
    - **inline** (przy polach),
    - **globalne** (alert nad formularzem) dla błędów serwera/ogólnych.
- **Poziom backend / Supabase**:
  - logowanie:
    - błędne dane → zawsze ogólny komunikat („Nieprawidłowy e-mail lub hasło”),
  - rejestracja:
    - `User already registered` → komunikat o zajętym e-mailu,
    - inne błędy → ogólny komunikat,
  - reset hasła:
    - błędny token → komunikat o wygaśnięciu/nieprawidłowości linku,
    - zbyt słabe hasło → komunikat przy polu `password`.

### 1.5. Najważniejsze scenariusze użytkownika

- **Logowanie (US-003)**:
  - poprawne dane → zapis tokenu, pobranie profilu, redirect do `/dashboard` lub `/onboarding`,
  - błędne dane → ogólny komunikat, pola zostają, możliwość poprawy,
  - błąd sieci → komunikat o problemie z połączeniem.

- **Rejestracja właściciela (US-001, US-010)**:
  - kompletne i poprawne dane + zaznaczone zgody:
    - signup → automatyczne zalogowanie → zapis tokenów → redirect `/onboarding`,
  - e-mail już istnieje → komunikat o zajętym adresie,
  - niezaakceptowane zgody → komunikat przy checkboxie, brak wywołania API.

- **Rejestracja lokatora (US-002, US-043)**:
  - ważny token + poprawne dane → signup + login + accept invitation → zapis tokenów → `/dashboard`,
  - token nieprawidłowy/zużyty → redirect `/invitation-expired` (US-050),
  - lokator już ma aktywny najem → komunikat biznesowy (US-053).

- **Reset hasła (US-005, US-006)**:
  - inicjacja:
    - użytkownik wpisuje e-mail → zawsze widzi komunikat, że jeśli konto istnieje, mail został wysłany,
  - ustawienie nowego hasła:
    - wejście z linku → formularz nowego hasła,
    - po sukcesie → komunikat + redirect (np. `/login`),
    - link zużyty/wygasły → komunikat + redirect do `/reset-password`.

---

## 2. Logika backendowa

### 2.1. Kontekst: middleware i integracja z Supabase

- **Middleware**: `src/middleware/index.ts`
  - na każde żądanie:
    - odczytuje token:
      - z nagłówka `Authorization: Bearer <JWT>`, lub
      - z cookie `rentflow_auth_token`,
    - tworzy klienta Supabase z nagłówkiem globalnym `Authorization: Bearer <JWT>`,
    - wywołuje `supabase.auth.getUser(token)` w celu pobrania użytkownika,
    - ustawia:
      - `context.locals.supabase` – instancja klienta dla danego requestu,
      - `context.locals.user` – bieżący użytkownik (lub `null`).
- **Konsekwencja architektoniczna**:
  - **wszystkie** endpointy i strony SSR, które wymagają autoryzacji, korzystają z `context.locals.user` i `context.locals.supabase` zamiast własnej logiki weryfikacji JWT,
  - token JWT musi być konsekwentnie zapisywany przez frontend (login/rejestracja) w localStorage + cookie.

### 2.2. Istniejące endpointy powiązane z auth

- **`GET /api/users/me` / `PATCH /api/users/me`** (`src/pages/api/users/me.ts`)
  - wykorzystują `context.locals.user` i `context.locals.supabase`,
  - są zabezpieczone:
    - brak `locals.user` → `401 Unauthorized`,
  - używają Zod do walidacji danych (np. `full_name`),
  - stanowią źródło prawdy o roli użytkownika (`role: 'owner' | 'tenant'`).

- **`GET /api/invitations/:token`** (`src/pages/api/invitations/[token].ts`)
  - endpoint publiczny (bez auth),
  - waliduje token zaproszenia (schema Zod + `InvitationService` + Supabase service role),
  - wykorzystywany przez stronę `/register/tenant`.

- **`POST /api/invitations/:token/accept`** (w innym pliku, powiązany z rejestracją lokatora)
  - endpoint wymagający autoryzacji (`locals.user` ustawione przez middleware),
  - łączy konto lokatora z mieszkaniem,
  - implementuje ograniczenia biznesowe RLS (US-019, US-020, US-021, US-053).

### 2.3. Nowe / uzupełnione endpointy dla resetu hasła

#### `POST /api/auth/password/reset-request`

- **Cel**: inicjacja resetu hasła (US-005).
- **Wejście**:
  - Body JSON:
    - `email: string`.
- **Walidacja (Zod)**:
  - `email` wymagany + poprawny format,
  - brak informacji, czy konto istnieje (nawet w przypadku błędów).
- **Implementacja**:
  - użycie `createServiceRoleClient()` z `SUPABASE_SERVICE_ROLE_KEY`,
  - wywołanie Supabase:
    - `auth.resetPasswordForEmail(email, { redirectTo: PUBLIC_APP_URL + '/reset-password/confirm' })`
      lub bezpośrednio REST `POST /auth/v1/recover`,
  - niezależnie od wyniku (o ile nie ma błędu technicznego):
    - zawsze zwraca `200 OK` z komunikatem:
      - `message: "Jeśli konto istnieje, wysłaliśmy instrukcje resetu hasła"`.
- **Błędy techniczne**:
  - np. brak połączenia z Supabase → `500 Internal Server Error` z ogólnym komunikatem.

#### (Opcjonalny) `POST /api/auth/password/update`

- **Cel**: alternatywnie, obsługa ustawienia nowego hasła po stronie backendu zamiast bezpośredniego wywołania REST z frontu.
- **Wejście**:
  - `password: string`,
  - `token: string` (access token z linku resetującego).
- **Walidacja**:
  - `password`: min. 8 znaków,
  - `token`: niepusty string.
- **Implementacja**:
  - użycie `createServiceRoleClient` lub dedykowanego klienta z `Authorization: Bearer <token>`,
  - wywołanie endpointu Supabase `auth.updateUser({ password })`,
  - w razie sukcesu → `200 OK`, w razie błędu → `400`/`500` z komunikatem.

> Uwaga: dla MVP można pozostać przy bezpośrednim wywołaniu REST z frontendu (`ResetPasswordForm`), trzymając powyższy endpoint jako opcję na przyszłość.

### 2.4. Walidacja danych wejściowych na backendzie

- **Zasada**: wszystkie nowe endpointy `api/auth/*` korzystają z Zod do walidacji:
  - parse/`safeParse` wejścia,
  - w razie błędów → `400 Bad Request` z:
    - `error: "Validation Error"`,
    - `details` zawierającym błędy pól (do debugowania – niekoniecznie renderowane w UI 1:1).
- **Ochrona informacji**:
  - szczególnie dla resetu hasła i logowania:
    - nie ujawniamy, czy dany e-mail istnieje w systemie,
    - komunikaty są ogólne.

### 2.5. Obsługa wyjątków i logowanie

- **Wspólne zasady**:
  - przy nieprzewidzianych błędach → `500 Internal Server Error` z ogólnym komunikatem,
  - logowanie błędów na serwerze z kontekstem (ścieżka, identyfikator użytkownika – jeśli dostępny, skrót tokenu).
- **Struktura odpowiedzi błędu**:
  - JSON:
    - `error: string` – kod błędu (np. `"Unauthorized"`, `"Validation Error"`, `"Internal Server Error"`),
    - `message: string` – komunikat użytkowy,
    - opcjonalnie `details` – szczegóły walidacji.

### 2.6. Renderowanie server-side a auth (Astro `output: "server"`)

- **Strony SSR wymagające auth**:
  - `/dashboard`:
    - guard na początku pliku: brak `Astro.locals.user` → redirect `/login?redirect=/dashboard`,
    - pobranie `role` z tabeli `users` i odpowiednie dane dashboardu.
  - `/onboarding`:
    - docelowo powinno korzystać z tych samych mechanizmów (można stosować guard client-side jak obecnie, ale architektonicznie lepiej byłoby oprzeć się o `Astro.locals.user`),
    - tylko właściciel ma dostęp (US-010).
- **Strony auth**:
  - `/login`, `/register`, `/reset-password` mogą pozostać statyczne (bez `prerender=false`), ponieważ:
    - nie wymagają znajomości bieżącego użytkownika,
    - cała logika jest po stronie Reacta/Supabase.
  - `/register/tenant`, `/reset-password/confirm` – SSR (`prerender=false`), bo zależą od tokenów i dynamicznej walidacji.

---

## 3. System autentykacji z Supabase Auth

### 3.1. Wzorzec integracji – JWT + middleware

- **Źródło autentykacji**: Supabase Auth (email/hasło).
- **Transport tokenu**:
  - frontend po udanym logowaniu/rejestracji zapisuje:
    - `access_token` + `refresh_token` do `localStorage`,
    - `access_token` + opcjonalnie `refresh_token` do cookies (`rentflow_auth_token`, `rentflow_refresh_token`),
  - kolejne żądania:
    - **frontend → API**: dodaje `Authorization: Bearer <access_token>`,
    - **SSR (Astro)**: middleware odczytuje token z nagłówka lub cookie i ustawia `locals.user`.

### 3.2. Login (Supabase Auth + frontend)

- **Endpoint Supabase**:
  - `POST ${PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`.
- **Nagłówki**:
  - `Content-Type: application/json`,
  - `apikey: PUBLIC_SUPABASE_ANON_KEY`,
  - `Authorization: Bearer PUBLIC_SUPABASE_ANON_KEY`.
- **Body**:
  - `{ email, password }`.
- **Flow**:
  1. `LoginForm` wykonuje request.
  2. W razie sukcesu otrzymuje `access_token`, `refresh_token`.
  3. Zapisuje tokeny (localStorage + cookies).
  4. Wywołuje `GET /api/users/me` w celu pobrania roli.
  5. Redirect na odpowiedni widok.

### 3.3. Rejestracja (Supabase Auth + frontend)

- **Właściciel (`RegisterOwnerForm`)**:
  - `POST /auth/v1/signup` z metadanymi `data: { full_name, role: "owner" }`,
  - po sukcesie – **docelowo**:
    - dodatkowe wywołanie `POST /auth/v1/token?grant_type=password` (spójne z loginem),
    - zapis tokenów,
    - redirect `/onboarding`.
- **Lokator (`TenantRegisterForm`)**:
  - już implementuje:
    - `signup` → `login` → `POST /api/invitations/:token/accept` → zapis tokenów → redirect `/dashboard`.

### 3.4. Reset hasła (Supabase Auth)

- **Inicjacja**:
  - endpoint backendowy `POST /api/auth/password/reset-request` wywołuje:
    - `auth.resetPasswordForEmail(email, { redirectTo: PUBLIC_APP_URL + '/reset-password/confirm' })`,
  - Supabase wysyła email z linkiem do zmiany hasła.
- **Ustawienie nowego hasła**:
  - `ResetPasswordForm` odczytuje token (`access_token`) z URL,
  - wywołuje REST:
    - `PUT ${PUBLIC_SUPABASE_URL}/auth/v1/user` z nagłówkiem `Authorization: Bearer <access_token>` i body `{ password: ... }`,
  - po sukcesie:
    - opcjonalnie zapis tokenów (jeśli w odpowiedzi),
    - redirect na `/login` z komunikatem o sukcesie (US-006).

### 3.5. Wylogowanie

- **Funkcja frontendowa**: `logout(redirectTo = "/login")` (`src/lib/utils/auth.ts`)
  - usuwa tokeny z `localStorage`,
  - czyści cookies `rentflow_auth_token` i `rentflow_refresh_token`,
  - przekierowuje na stronę logowania.
- **Konsekwencja**:
  - kolejne żądania nie zawierają tokenu, więc middleware ustawi `locals.user = null`, a strony wymagające auth przekierują użytkownika na `/login`.

### 3.6. Role i autoryzacja

- **Źródło ról**: tabela `users` w Supabase (`role: "owner" | "tenant"`).
- **Ustalanie roli**:
  - po zalogowaniu frontend **zawsze** odczytuje profil użytkownika przez `GET /api/users/me`,
  - rola z profilu determinuje:
    - który dashboard ma zostać wyrenderowany (`OwnerDashboardIsland` vs `TenantDashboardIsland`),
    - dostępność poszczególnych funkcji (np. kreator onboarding tylko dla właściciela).

---

## 4. Porównanie z aktualną implementacją i plan zmian

### 4.1. Zgodność bieżącej implementacji z powyższą specyfikacją

- **Logowanie (`LoginForm`, `/login`)**:
  - Zgodne z założeniami:
    - korzysta z Supabase Auth (`POST /auth/v1/token?grant_type=password`),
    - waliduje dane po stronie klienta (Zod),
    - zapisuje `access_token`/`refresh_token` do localStorage i cookies,
    - wywołuje `GET /api/users/me` i rozróżnia ścieżki dla właściciela (w tym sprawdzanie mieszkań i redirect do `/onboarding`) oraz lokatora (`/dashboard`),
    - komunikuje błędy logowania ogólnym komunikatem.
  - Wniosek: **implementacja logowania jest w praktyce zgodna z docelową architekturą**.

- **Rejestracja właściciela (`RegisterOwnerForm`, `/register`)**:
  - Zgodności:
    - formularz ma prawidłowe pola (Imię, E-mail, Hasło, Powtórz hasło, checkbox zgód),
    - walidacja po stronie klienta jest zgodna z PRD (min. 8 znaków hasła, hasła identyczne, wymagany checkbox),
    - integracja z Supabase Auth (`POST /auth/v1/signup`) i mapowanie błędów.
  - Brakujący element:
    - po pomyślnej rejestracji **nie następuje** automatyczne zalogowanie (brak dodatkowego logowania `token?grant_type=password` i zapisu tokenów),
    - użytkownik jest przekierowywany do `/onboarding`, ale tam autoryzacja opiera się o `rentflow_auth_token` – którego jeszcze nie ma,
    - w efekcie nowo zarejestrowany właściciel zostanie odesłany do `/login`, co jest sprzeczne z US-001 (punkt 8) i US-010.

- **Rejestracja lokatora (`TenantRegisterForm`, `/register/tenant`)**:
  - Implementacja:
    - realizuje signup w Supabase,
    - następnie **jawnie** loguje użytkownika przez `token?grant_type=password`,
    - wywołuje `POST /api/invitations/:token/accept` z nagłówkiem `Authorization`,
    - zapisuje tokeny do localStorage i cookies, redirectuje do `/dashboard`,
    - obsługuje błędy specyficzne dla zaproszenia (`INVALID_TOKEN`, `USER_HAS_LEASE`, `APARTMENT_HAS_LEASE`, `401`).
  - Różnica względem niektórych fragmentów dokumentacji:
    - UI-plan sugerował użycie klienta Supabase (`supabase.auth.signUp`) i rely na sesji, natomiast aktualna implementacja stosuje REST API + manualne logowanie – co **jest spójne** z przyjętym wzorcem w logowaniu i opisanym powyżej systemem.
  - Wniosek: **flow rejestracji lokatora jest zgodny z docelową architekturą**, różni się tylko technicznym detalem (REST zamiast klienta Supabase), który jest akceptowalny.

- **Reset hasła**:
  - aktualnie:
    - istnieje jedynie link „Nie pamiętasz hasła?” kierujący na `/reset-password`,
    - brak zaimplementowanej strony `/reset-password` i brak obsługi po stronie backendu.
  - Wniosek: **część resetu hasła (US-005, US-006) nie jest jeszcze zaimplementowana**.

### 4.2. Podsumowanie

- Moduł **logowania** jest zgodny z założeniami architektury i PRD.
- Moduł **rejestracji lokatora** jest zgodny z docelową architekturą (z wykorzystaniem REST Supabase Auth + manualnego logowania).
- Moduł **rejestracji właściciela** wymaga uzupełnienia o automatyczne logowanie i zapis tokenów po rejestracji.
- Moduł **resetu hasła** wymaga pełnej implementacji (UI + backend + integracja z Supabase).

---

## 5. User stories do aktualizacji logowania i rejestracji

Poniższe user stories rozszerzają istniejące US-001–US-006 w kontekście implementacji technicznej.

### US-AUTH-001 – Automatyczne zalogowanie właściciela po rejestracji

- **Jako** nowy właściciel, który właśnie wypełnił formularz rejestracji,
- **chcę**, aby po pomyślnym utworzeniu konta moje konto było automatycznie zalogowane,
- **aby** zostać bezpośrednio przekierowanym do kreatora onboardingu bez konieczności ponownego wpisywania danych.

**Kryteria akceptacji:**
1. Po pomyślnym `POST /auth/v1/signup` komponent `RegisterOwnerForm` wykonuje dodatkowe wywołanie `POST /auth/v1/token?grant_type=password` z tym samym e-mailem i hasłem.
2. Odpowiedź z Supabase zawierająca `access_token` i (opcjonalnie) `refresh_token` jest zapisywana:
   - w `localStorage` (`rentflow_auth_token`, `rentflow_refresh_token`),
   - w cookies (`rentflow_auth_token`, `rentflow_refresh_token`).
3. Po zapisaniu tokenów następuje redirect na `/onboarding`.
4. Widok `/onboarding` rozpoznaje nowo zalogowanego właściciela i **nie** przekierowuje ponownie na `/login`.
5. W przypadku błędu logowania po signupie (rzadki przypadek) użytkownik widzi komunikat:
   - „Konto zostało utworzone, ale nie udało się zalogować. Spróbuj zalogować się ręcznie.”

### US-AUTH-002 – Ujednolicenie obsługi Supabase Auth po stronie frontendu

- **Jako** deweloper,
- **chcę**, aby logika wywoływania Supabase Auth i zarządzania tokenami była wyekstrahowana do wspólnego modułu,
- **aby** zmniejszyć duplikację kodu i ryzyko niespójności (login, rejestracja właściciela, rejestracja lokatora).

**Kryteria akceptacji:**
1. Powstaje moduł frontowy (np. `src/lib/services/auth.client.ts` lub hook `useAuth`), który udostępnia funkcje:
   - `login(email, password)`,
   - `signupOwner(values)`,
   - `signupTenant(values)`,
   - `saveTokens({ accessToken, refreshToken })`,
   - `clearTokens()`.
2. `LoginForm`, `RegisterOwnerForm` i `TenantRegisterForm` korzystają z tych funkcji, zamiast duplikować logikę `fetch` + zapis tokenów.
3. Zasady zapisu/odczytu tokenów (nazwy kluczy, nazwy cookies) są zdefiniowane **w jednym miejscu** i używane konsekwentnie.
4. Logika mapowania błędów Supabase na komunikaty użytkownika jest zcentralizowana lub przynajmniej spójna pomiędzy formularzami.

### US-AUTH-003 – Widok inicjacji resetu hasła (`/reset-password`)

- **Jako** użytkownik, który zapomniał hasła,
- **chcę** móc wpisać swój adres e-mail i poprosić o link do resetu,
- **aby** odzyskać dostęp do konta zgodnie z US-005.

**Kryteria akceptacji:**
1. Istnieje strona `src/pages/reset-password.astro` z layoutem `AuthLayout`.
2. Strona renderuje Reactowy `ForgotPasswordForm` z jednym polem `email`.
3. Po submitcie:
   - wykonywany jest `POST /api/auth/password/reset-request` z body `{ email }`,
   - niezależnie od tego, czy e-mail istnieje, użytkownik widzi komunikat:
     - „Jeśli konto istnieje, wysłaliśmy instrukcje resetu hasła na podany adres e-mail”.
4. Błędny format e-maila jest walidowany po stronie klienta (Zod) i nie trafia do backendu.
5. W przypadku problemów technicznych (np. błąd 500) wyświetlany jest ogólny komunikat: „Wystąpił błąd. Spróbuj ponownie później.”.

### US-AUTH-004 – Widok ustawienia nowego hasła (`/reset-password/confirm`)

- **Jako** użytkownik, który kliknął link resetu hasła z e-maila,
- **chcę** móc ustawić nowe hasło zgodnie z wymaganiami bezpieczeństwa,
- **aby** odzyskać dostęp do konta (US-006).

**Kryteria akceptacji:**
1. Supabase resetuje hasło z wykorzystaniem `redirectTo=${PUBLIC_APP_URL}/reset-password/confirm`.
2. Strona `src/pages/reset-password/confirm.astro` jest dostępna i korzysta z `AuthLayout`.
3. Reactowy `ResetPasswordForm`:
   - odczytuje token resetu (`access_token`) z `window.location.hash`,
   - umożliwia wpisanie `Nowe hasło` i `Powtórz nowe hasło`,
   - waliduje hasło (min. 8 znaków, pola identyczne),
   - po poprawnym wypełnieniu:
     - wywołuje Supabase REST w celu ustawienia nowego hasła,
     - w przypadku sukcesu wyświetla komunikat i przekierowuje na `/login` (lub `/dashboard`).
4. Link wygasły lub niepoprawny powoduje:
   - wyświetlenie komunikatu o wygaśnięciu linku,
   - redirect na `/reset-password` lub dedykowaną stronę błędu.

### US-AUTH-005 – Dostosowanie `/onboarding` do nowej logiki autentykacji po rejestracji

- **Jako** nowy właściciel po rejestracji,
- **chcę**, aby kreator onboarding działał poprawnie z automatyczną sesją i nie wymagał dodatkowego logowania,
- **aby** doświadczenie rejestracji i startu było płynne.

**Kryteria akceptacji:**
1. Po implementacji US-AUTH-001, wejście na `/onboarding` tuż po rejestracji **nie** powoduje redirectu na `/login`.
2. `onboarding.astro` może:
   - korzystać z guardu po stronie SSR (`Astro.locals.user` + rola `owner`) **lub**
   - aktualnego guardu client-side bazującego na `localStorage`, ale musi uwzględniać nowo zapisane tokeny.
3. W przypadku użytkownika niezalogowanego próba wejścia na `/onboarding` nadal skutkuje przekierowaniem na `/login?redirect=/onboarding`.
4. W przypadku użytkownika o roli `tenant` wejście na `/onboarding` przekierowuje na `/dashboard`.

---

Ten dokument stanowi docelową specyfikację modułu autentykacji (rejestracja, logowanie, reset hasła) zgodną z PRD i aktualnym stackiem technologicznym oraz wskazuje, które elementy istniejącej implementacji są już zgodne, a które wymagają dopracowania. 

