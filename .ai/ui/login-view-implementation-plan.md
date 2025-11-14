## Plan implementacji widoku logowania

## 1. Przegląd

Widok logowania odpowiada za uwierzytelnienie istniejących użytkowników (Właściciel i Lokator) przy użyciu e‑maila i hasła zgodnie z US-003. Jest to publicznie dostępna, statyczna strona Astro wykorzystująca Reactowy formularz z walidacją, integrująca się bezpośrednio z Supabase Auth (`POST /auth/v1/token?grant_type=password`). Widok musi zapewniać bezpieczne komunikaty błędów (bez ujawniania istnienia konta), link do resetu hasła oraz link do rejestracji właściciela, a po poprawnym logowaniu kierować użytkownika do odpowiedniego widoku (dashboard właściciela / dashboard lokatora) z przygotowanym tokenem JWT do dalszych wywołań API.

## 2. Routing widoku

- **Ścieżka**: `/login`
- **Typ renderowania**: strona statyczna Astro (bez SSR), z Reactowym formularzem hydratowanym po stronie klienta (`client:load`).
- **Dostępność**: publiczna, bez wymogu tokena (middleware nie powinien wymagać nagłówka `Authorization` dla tej ścieżki).
- **Nawigacja po zalogowaniu**:
  - Po poprawnym logowaniu frontend pobiera token JWT z odpowiedzi Supabase, zapisuje go lokalnie (np. `localStorage` pod kluczem `rentflow_auth_token`) i używa do autoryzacji dalszych wywołań do `/api/...`.
  - Następnie (w ramach logiki widoku logowania) wykonywane jest żądanie `GET /api/users/me` z nagłówkiem `Authorization: Bearer <JWT>` w celu odczytu roli użytkownika.
  - Dla `role === "owner"` użytkownik jest przekierowywany do widoku właściciela zawierającego listę mieszkań (np. `/dashboard` lub inna docelowa ścieżka zgodna z implementacją dashboardu).
  - Dla `role === "tenant"` użytkownik jest przekierowywany do dashboardu lokatora (również `/dashboard`, z odmiennym renderowaniem po stronie UI).

## 3. Struktura komponentów

Hierarchia komponentów dla widoku `/login`:

- `login.astro` (strona Astro)
  - używa layoutu `AuthLayout.astro`
  - renderuje komponent React:
    - `LoginForm` (`src/components/features/auth/login-form.tsx`, hydratowany `client:load`)
      - komponenty z Shadcn/ui:
        - `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`
        - `Input`
        - `Button`
      - dodatkowe elementy:
        - blok błędu globalnego (alert)
        - link tekstowy **"Nie pamiętasz hasła?"**
        - link tekstowy do rejestracji właściciela (`/register`)

## 4. Szczegóły komponentów

### 4.1. `login.astro`

- **Opis**: Strona Astro odpowiadająca za routing na `/login`, osadzająca formularz logowania w layoutcie `AuthLayout`.
- **Główne elementy**:
  - Import `AuthLayout` ze `src/layouts/AuthLayout.astro`.
  - Import `LoginForm` ze `src/components/features/auth/login-form`.
  - Użycie:
    - `AuthLayout` z przekazaniem:
      - `title="Zaloguj się"`
      - `subtitle="Zarządzaj najmem w jednym miejscu."` (lub podobny tekst zgodny z UX).
    - W slocie layoutu: `<LoginForm client:load />`.
- **Obsługiwane interakcje**:
  - Brak bezpośrednich zdarzeń – cała interakcja dzieje się w komponencie `LoginForm`.
- **Walidacja**:
  - Brak logiki walidacyjnej – strona tylko kompozuje layout i komponenty.
- **Typy**:
  - Wykorzystuje tylko propsy `AuthLayout` (`title?: string`, `subtitle?: string`).
- **Propsy**:
  - Nie przyjmuje propsów (strona), przekazuje do `AuthLayout`:
    - `title: string`
    - `subtitle?: string`

### 4.2. `AuthLayout.astro` (istniejący)

- **Opis komponentu**: Layout dla stron autoryzacyjnych, dostarczający spójny wygląd (logo, tytuł, podtytuł, karta formularza oraz stopka z linkami prawnymi i pomocą).
- **Główne elementy**:
  - `<html lang="pl">`, `<head>` z `title` opartym o prop `title`.
  - `<body>` z centralnie wyrównanym kontenerem, kartą na formularz i stopką.
  - Stopka zawiera linki:
    - `/regulamin`
    - `/polityka-prywatnosci`
    - `mailto:pomoc@rentflow.pl`
- **Obsługiwane interakcje**:
  - Linki w stopce (standardowe przejścia na inne strony).
- **Walidacja**:
  - Brak walidacji – layout nie ma logiki domenowej.
- **Typy**:
  - `Props`:
    - `title?: string`
    - `subtitle?: string`
- **Propsy**:
  - `title` – używany w `<title>` oraz jako nagłówek H2.
  - `subtitle` – tekst pomocniczy pod tytułem, opcjonalny.

### 4.3. `LoginForm` (`src/components/features/auth/login-form.tsx`)

- **Opis komponentu**: Reactowy formularz logowania, odpowiedzialny za:
  - zarządzanie stanem formularza,
  - walidację po stronie klienta,
  - wywołanie Supabase Auth (login),
  - obsługę błędów,
  - zapis tokenu JWT oraz inicjalny redirect po zalogowaniu.
- **Główne elementy**:
  - Kontener `div` z odstępami (`space-y-6`).
  - Blok globalnego błędu (alert) wyświetlany nad formularzem, gdy `globalError` jest ustawiony.
  - `Form` z Shadcn/ui owinięty wokół elementu `<form>`.
  - Pola formularza:
    - `email`:
      - `FormField` + `FormItem` + `FormLabel` ("E‑mail").
      - `FormControl` z komponentem `Input`:
        - `type="email"`, `autoComplete="email"`, `autoFocus` (spełnienie wymogu UX).
      - `FormMessage` dla błędu walidacji inline.
    - `password`:
      - `FormLabel` ("Hasło").
      - `Input` `type="password"`, `autoComplete="current-password"`.
      - `FormMessage`.
  - Sekcja linków pod polami:
    - Link tekstowy "Nie pamiętasz hasła?" kierujący do widoku resetu hasła (np. `/reset-password` zgodnie z implementacją US-005).
  - Przyciski / CTA:
    - Główny `Button type="submit"` z tekstem:
      - `"Logowanie..."` gdy `isSubmitting === true`,
      - `"Zaloguj się"` w pozostałych przypadkach.
    - Link tekstowy: "Nie masz jeszcze konta? Załóż konto właściciela" kierujący do `/register`.
  - Atrybuty dostępności:
    - Globalny alert błędu z `role="alert"` i `aria-live="polite"`.
- **Obsługiwane interakcje**:
  - Zmiana wartości pól `email` i `password` (obsługiwana przez `react-hook-form`).
  - `onSubmit` formularza:
    - walidacja schema Zod,
    - jeśli walidacja nie powiedzie się – wyrenderowanie błędów inline, brak requestu do API,
    - jeśli walidacja przejdzie – wywołanie `login()` (logika integracji z API).
  - Kliknięcie linku "Nie pamiętasz hasła?" – nawigacja do strony resetu hasła.
  - Kliknięcie linku do rejestracji – nawigacja do `/register`.
  - Wciśnięcie klawisza Enter w polu `password` (lub w formularzu) – submit formularza (domyślne zachowanie `<form>`).
- **Walidacja (szczegółowo)**:
  - `email`:
    - wymagany (nie może być pusty),
    - `z.string().trim().email("Nieprawidłowy adres e‑mail")`.
  - `password`:
    - wymagane,
    - `z.string().min(8, "Hasło musi mieć co najmniej 8 znaków")` – spójne z wymaganiami rejestracji.
  - Walidacja uruchamiana w trybie `onTouched` lub `onChange` (jak w formularzu rejestracji), z natychmiastową aktualizacją `FormMessage`.
  - Przycisk "Zaloguj się" jest `disabled`, gdy:
    - formularz jest w trakcie wysyłania (`isSubmitting`),
    - lub `form.formState.isValid === false`.
  - Walidacja po stronie serwera:
    - przy błędnych danych logowania (Supabase zwraca `error`) – wyświetlany jest wyłącznie ogólny komunikat "Nieprawidłowy e‑mail lub hasło" w bloku globalnego błędu, bez pokazywania, czy e-mail istnieje w systemie.
- **Typy (DTO i ViewModel) używane przez komponent**:
  - Nowe typy lokalne:
    - `LoginFormValues`:
      - wynik `z.infer<typeof loginSchema>`, gdzie `loginSchema` to:
        - `email: string` – poprawny adres e‑mail,
        - `password: string` – min. 8 znaków.
    - `LoginErrorState`:
      - `{ message: string; code?: string } | null`
      - używany do przechowywania i wyświetlania globalnego błędu.
    - Opcjonalny typ odpowiedzi Supabase (remote DTO, uproszczony):
      - `SupabaseLoginResponse` (opcjonalny, jeśli chcemy go jawnie typować):
        - `access_token?: string`
        - `refresh_token?: string`
        - `user?: { id: string; email: string; /* inne pola Supabase */ }`
        - `error?: { message: string; status?: number }`
  - Wykorzystywane istniejące typy DTO (po zalogowaniu):
    - `UserProfileDTO` (z `src/types.ts`), wykorzystywany jako typ odpowiedzi `GET /api/users/me` do odczytania roli (`role`) i ewentualnie innych danych użytkownika.
- **Propsy komponentu**:
  - W MVP komponent `LoginForm` nie potrzebuje propsów – cała logika jest wewnątrz.
  - Opcjonalnie można przewidzieć przyszłościowo:
    - `onLoginSuccess?: (user: UserProfileDTO) => void` – wywoływane po poprawnym zalogowaniu i pobraniu danych użytkownika.

## 5. Typy

### 5.1. Nowe typy specyficzne dla widoku logowania

- **`loginSchema` (Zod)**:
  - Definicja:
    - `email: z.string().trim().email("Nieprawidłowy adres e‑mail")`
    - `password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków")`
  - Użycie:
    - Jako `resolver` dla `react-hook-form` (`zodResolver(loginSchema)`).
    - Zapewnia spójność walidacji pomiędzy frontendem a wymaganiami biznesowymi.

- **`LoginFormValues`**:
  - Definicja (TypeScript):
    - `type LoginFormValues = z.infer<typeof loginSchema>;`
  - Pola:
    - `email: string`
    - `password: string`
  - Użycie:
    - Typ generyczny dla `useForm<LoginFormValues>()`.
    - Typ parametru `values` w funkcji `onSubmit(values: LoginFormValues)`.

- **`LoginErrorState`**:
  - Definicja:
    - `type LoginErrorState = { message: string; code?: string } | null;`
  - Pola:
    - `message: string` – treść błędu pokazywana użytkownikowi.
    - `code?: string` – opcjonalny kod błędu z Supabase (np. do logowania/diagnostyki).
  - Użycie:
    - Przechowywany w `useState<LoginErrorState>`.
    - Gdy ustawiony, renderowany jest globalny alert w formularzu.

- **`SupabaseLoginResponse` (opcjonalny)**:
  - Można zdefiniować lokalnie w komponencie, aby typować odpowiedź:
    - `access_token?: string`
    - `refresh_token?: string`
    - `token_type?: string`
    - `expires_in?: number`
    - `user?: { id: string; email: string; /* ... */ }`
    - `error?: { message: string; status?: number }`
  - Użycie:
    - Typowanie wyniku `await response.json()` w logice loginu.

### 5.2. Wykorzystanie istniejących typów

- **`UserProfileDTO`**:
  - Typ odpowiedzi `GET /api/users/me`.
  - Zawiera m.in. pola:
    - identyfikator użytkownika,
    - `email`,
    - `full_name`,
    - `role` (`"owner"` lub `"tenant"`).
  - Użycie:
    - Po zapisaniu tokenu JWT, `LoginForm` może wykonać request do `/api/users/me`, sparsować odpowiedź jako `UserProfileDTO` i na tej podstawie:
      - ustawić docelową ścieżkę przekierowania,
      - ewentualnie zainicjalizować globalny stan użytkownika, jeśli w projekcie powstanie warstwa globalnego store.

## 6. Zarządzanie stanem

- **Poziom komponentu (`LoginForm`)**:
  - `useForm<LoginFormValues>`:
    - zarządza wartościami pól formularza (`email`, `password`),
    - przechowuje stan walidacji (`errors`, `isValid`, `isSubmitting`),
    - integruje się z Zod poprzez `zodResolver(loginSchema)`.
  - `useState<boolean>`:
    - `isSubmitting` – dodatkowa flaga do sterowania przyciskiem i blokowania pól w trakcie requestu.
  - `useState<LoginErrorState>`:
    - `globalError` – przechowuje ostatni błąd loginu po stronie serwera (np. nieprawidłowe dane, błąd sieci).
- **Potencjalny custom hook**: `useLogin` (`src/components/hooks/use-login.ts`)
  - **Cel**:
    - Oddzielenie logiki sieciowej i obsługi tokenu od komponentu prezentacyjnego.
  - **API hooka**:
    - `const { login, isLoading, error } = useLogin();`
    - `login(credentials: LoginFormValues): Promise<UserProfileDTO | null>`
      - Wykonuje:
        1. `POST` do Supabase Auth (`/auth/v1/token?grant_type=password`).
        2. Zapis `access_token` (i opcjonalnie `refresh_token`) w `localStorage` lub innym miejscu.
        3. `GET /api/users/me` z nagłówkiem `Authorization: Bearer <access_token>`.
        4. Zwraca `UserProfileDTO` lub `null` w wypadku błędu.
  - **Korzyści**:
    - Umożliwia ponowne użycie logiki logowania w innych miejscach (np. modal logowania).
    - Upraszcza komponent `LoginForm`, który skupia się na UI i walidacji.

## 7. Integracja API

### 7.1. Supabase Auth – logowanie

- **Endpoint**:
  - `POST ${import.meta.env.PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`
- **Nagłówki**:
  - `Content-Type: application/json`
  - `apikey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY`
  - `Authorization: Bearer ${import.meta.env.PUBLIC_SUPABASE_ANON_KEY}`
- **Body (request DTO)**:
  - JSON:
    - `{ "email": string, "password": string }`
  - Typ: `LoginFormValues`.
- **Odpowiedź (response DTO)**:
  - Sukces:
    - `access_token: string` – token JWT do użycia w nagłówku `Authorization`.
    - `refresh_token: string` – do ewentualnego odświeżania sesji (MVP może na razie pominąć automatyczne odświeżanie).
    - `user: { ... }` – obiekt użytkownika w standardzie Supabase.
  - Błąd:
    - `error: { message: string; status?: number }`.
- **Logika w komponencie**:
  - Po sukcesie:
    - zapisać `access_token` w `localStorage` (np. `localStorage.setItem("rentflow_auth_token", accessToken)`),
    - opcjonalnie zapisać `refresh_token`,
    - wyczyścić `globalError`,
    - wykonać dodatkowe żądanie do `/api/users/me` (poniżej),
    - na podstawie roli zadecydować o nawigacji.
  - Przy błędzie:
    - niezależnie od treści `error.message` (np. nieprawidłowe hasło, nieistniejący e‑mail) ustawić:
      - `globalError = { message: "Nieprawidłowy e‑mail lub hasło", code: error.code }`
      - nie ustalać, czy e-mail istnieje (wymóg bezpieczeństwa).

### 7.2. `GET /api/users/me` – profil zalogowanego użytkownika

- **Endpoint (Astro)**:
  - `GET /api/users/me`
  - `prerender = false` (endpoint serwerowy, wymaga tokena).
- **Nagłówki**:
  - `Authorization: Bearer <access_token>`
  - `Content-Type: application/json`
- **Request DTO**:
  - Brak body (GET).
- **Response DTO**:
  - Przy sukcesie (`200`):
    - body typu `UserProfileDTO` – zawiera m.in. `role`.
  - Błędy:
    - `401 Unauthorized` – brak lub nieprawidłowy token.
    - `404 Not Found` – profil nie istnieje w bazie.
    - `500 Internal Server Error`.
- **Użycie w `LoginForm` / `useLogin`**:
  - Po zapisaniu tokenu z Supabase:
    - wykonać `fetch("/api/users/me", { headers: { Authorization: "Bearer " + token } })`,
    - sparsować odpowiedź do `UserProfileDTO`,
    - na tej podstawie wybrać ścieżkę przekierowania:
      - `role === "owner"` → dashboard właściciela (lista mieszkań),
      - `role === "tenant"` → dashboard lokatora.
  - W przypadku błędu (401/404/500):
    - wyczyścić wcześniej zapisany token (bezpieczne zachowanie),
    - ustawić `globalError` na ogólny komunikat:
      - np. "Wystąpił problem podczas logowania. Spróbuj ponownie."

## 8. Interakcje użytkownika

- **Wprowadzanie danych logowania**:
  - Użytkownik wpisuje adres e‑mail w polu z autofocusem.
  - Użytkownik wpisuje hasło w polu typu `password`.
  - Błędy walidacji (np. pusty e‑mail, zły format, zbyt krótkie hasło) są wyświetlane inline pod odpowiednim polem.
- **Wysłanie formularza**:
  - Użytkownik klika przycisk "Zaloguj się" lub naciska Enter.
  - Jeżeli formularz jest niepoprawny:
    - przycisk jest zablokowany dzięki `formState.isValid` (walidacja klienta),
    - po dotknięciu pól użytkownik widzi konkretne komunikaty walidacyjne.
  - Jeżeli dane są poprawne:
    - formularz wywołuje logikę logowania:
      - pokazanie stanu ładowania (`isSubmitting`),
      - wysłanie requestu do Supabase,
      - po sukcesie: zapis tokenu + request do `/api/users/me` + redirect.
- **Kliknięcie "Nie pamiętasz hasła?"**:
  - Użytkownik przechodzi do strony inicjacji resetu hasła (US-005, np. `/reset-password`).
  - Logika resetu hasła nie jest realizowana w tym widoku, ale widok logowania zapewnia łatwy dostęp do niej.
- **Kliknięcie linku do rejestracji**:
  - Użytkownik przechodzi na `/register` (rejestracja właściciela).
  - Spójny UX: dwukierunkowa nawigacja między rejestracją a logowaniem.

## 9. Warunki i walidacja

- **Poziom UI (formularz)**:
  - `email`:
    - wymagany,
    - poprawny format e‑maila.
  - `password`:
    - wymagane,
    - min. 8 znaków.
  - Walidacja działa inline:
    - po dotknięciu/opuszczeniu pola, błędy pojawiają się pod etykietą.
  - Przycisk "Zaloguj się" jest aktywny tylko, gdy:
    - formularz jest poprawnie wypełniony (`isValid === true`),
    - nie trwa aktualnie request (`!isSubmitting`).
- **Poziom API (Supabase Auth)**:
  - Supabase egzekwuje:
    - istnienie konta,
    - poprawność hasła,
    - ewentualne dodatkowe reguły (np. niezweryfikowany e‑mail).
  - Każdy błąd logowania jest mapowany na ogólny komunikat:
    - "Nieprawidłowy e‑mail lub hasło" (bez rozróżniania przyczyny).
- **Poziom API (`/api/users/me`)**:
  - Wymaga poprawnego tokenu w nagłówku `Authorization`.
  - Brak użytkownika, brak tokenu lub błędny token skutkuje statusem `401`/`404`/`500`, który jest mapowany na ogólny błąd logowania w UI.
- **Wpływ na stan interfejsu**:
  - Przy błędach walidacji klienta:
    - pola są oznaczone błędem (czerwone ramki, komunikat pod polem).
  - Przy błędzie serwerowym (Supabase / `/api/users/me`):
    - ustawiony `globalError`, wyświetlany nad formularzem,
    - przycisk wraca do stanu nieaktywnego (nie ładuje),
    - pola pozostają wypełnione, aby użytkownik mógł poprawić dane.

## 10. Obsługa błędów

- **Błędne dane logowania (Supabase)**:
  - Gdy odpowiedź zawiera `error` lub status HTTP wskazuje błąd:
    - UI ustawia `globalError.message = "Nieprawidłowy e‑mail lub hasło"`,
    - nie wyświetla bardziej szczegółowych informacji (wymóg bezpieczeństwa),
    - loguje szczegóły błędu do konsoli (dla dewelopera).
- **Brak połączenia / błąd sieci**:
  - Wyjątki z `fetch` (np. brak internetu) są przechwytywane:
    - UI ustawia `globalError.message = "Nie udało się połączyć z serwerem. Sprawdź połączenie internetowe i spróbuj ponownie."`.
- **Nieoczekiwana odpowiedź (brak `access_token` lub `user`)**:
  - Jeśli Supabase zwróci odpowiedź bez oczekiwanych pól:
    - UI loguje szczegóły błędu,
    - pokazuje komunikat: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później."
- **Błędy z `/api/users/me` po zalogowaniu**:
  - Status 401/404/500:
    - usuwa wcześniej zapisany token z `localStorage`,
    - ustawia ogólny komunikat błędu,
    - pozostawia użytkownika na stronie logowania.
- **Ochrona przed wyciekiem informacji**:
  - W żadnym przypadku UI nie informuje użytkownika, czy dany e‑mail istnieje w bazie (zarówno przy logowaniu, jak i – docelowo – przy resetowaniu hasła).

## 11. Kroki implementacji

1. **Przygotowanie schematu walidacji i typów**  
   - Zdefiniuj `loginSchema` (Zod) z polami `email` i `password` oraz odpowiednimi komunikatami błędów.  
   - Utwórz typy `LoginFormValues` oraz `LoginErrorState` w pliku `login-form.tsx`.

2. **Implementacja komponentu `LoginForm`**  
   - Użyj `useForm<LoginFormValues>` z `zodResolver(loginSchema)` i `mode: "onTouched"`.  
   - Zbuduj strukturę formularza w oparciu o Shadcn/ui (`Form`, `FormField`, `Input`, `Button`, `FormMessage`).  
   - Dodaj globalny blok błędu nad formularzem (`globalError`).  
   - Zaimplementuj pole `email` z `autoFocus` oraz `type="email"` i pole `password` z `type="password"`.

3. **Integracja z Supabase Auth**  
   - W funkcji `onSubmit` zaimplementuj `fetch` na endpoint: `${import.meta.env.PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`.  
   - Ustaw odpowiednie nagłówki (`Content-Type`, `apikey`, `Authorization`).  
   - Po sukcesie odczytaj `access_token` (i ewentualnie `refresh_token`), zapisz token w `localStorage` i wyczyść `globalError`.  
   - Przy błędzie ustaw ogólny komunikat `"Nieprawidłowy e‑mail lub hasło"` bez ujawniania szczegółów.

4. **Integracja z `/api/users/me` i redirect po zalogowaniu**  
   - Po zapisaniu tokenu wykonaj `GET /api/users/me` z nagłówkiem `Authorization: Bearer <token>`.  
   - Sparsuj odpowiedź jako `UserProfileDTO` i na podstawie pola `role` wybierz ścieżkę przekierowania (dashboard właściciela vs dashboard lokatora).  
   - Zaimplementuj redirect przez `window.location.href = "/dashboard"` (lub docelową ścieżkę wynikającą z implementacji dashboardu).

5. **Utworzenie strony `login.astro`**  
   - Dodaj plik `src/pages/login.astro` analogiczny do istniejącego `register.astro`.  
   - Użyj `AuthLayout` z odpowiednim `title` i `subtitle`.  
   - Wewnątrz slota layoutu wyrenderuj `<LoginForm client:load />`.

6. **Dodanie linków i spójność nawigacji**  
   - W `LoginForm` dodaj link "Nie pamiętasz hasła?" wskazujący na stronę resetu hasła (zgodną z US-005).  
   - Upewnij się, że link do `/register` (rejestracja właściciela) jest poprawny i stylistycznie spójny z analogicznym linkiem w formularzu rejestracji.

7. **Testy i weryfikacja UX/Accessibility**  
   - Przetestuj scenariusze: poprawne logowanie właściciela, poprawne logowanie lokatora, błędne hasło, nieistniejący e‑mail, brak połączenia z siecią.  
   - Sprawdź, że autofocus jest na polu e‑mail, Enter wysyła formularz, a błędy walidacji wyświetlają się inline.  
   - Zweryfikuj, że komunikaty błędów są w języku polskim, zrozumiałe i nie ujawniają szczegółów technicznych.


