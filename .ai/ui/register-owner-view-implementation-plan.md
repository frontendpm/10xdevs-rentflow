## Plan implementacji widoku Rejestracja Właściciela (`/register`)

## 1. Przegląd

Widok **Rejestracja Właściciela** ma umożliwić nowemu właścicielowi szybkie założenie konta w aplikacji Rentflow przy użyciu adresu e‑mail i hasła. Formularz musi spełniać wymagania biznesowe z PRD: pola Imię, E‑mail, Hasło, Powtórz hasło, obowiązkowy checkbox akceptacji Regulaminu i Polityki Prywatności, walidację po stronie klienta (inline) i po stronie Supabase Auth oraz zapewniać automatyczne logowanie i przekierowanie do kreatora onboardingu po pomyślnej rejestracji. Widok będzie zrealizowany jako strona Astro z layoutem `AuthLayout.astro` i dynamicznym komponentem React `RegisterOwnerForm` korzystającym z Tailwind i Shadcn/ui.

## 2. Routing widoku

- **Ścieżka URL:** `/register`
- **Typ strony:** statyczna strona Astro z osadzonym komponentem React (hydracja klienta).
- **Oczekiwane zachowanie nawigacji:**
  - Użytkownik niezalogowany: ma pełny dostęp do `/register`.
  - Użytkownik już zalogowany: opcjonalnie przekierowanie na dashboard lub stronę główną (może być zaimplementowane w middleware / guardach później).
  - Po pomyślnej rejestracji: automatyczne logowanie (po stronie Supabase) + redirect do kreatora onboardingu właściciela, np. `/onboarding` (zgodnie z US‑001/US‑010).

## 3. Struktura komponentów

- **Strona Astro:** `src/pages/register.astro`
  - Używa layoutu `AuthLayout.astro`.
  - Renderuje nagłówek i opis rejestracji.
  - Umieszcza Reactowy komponent `RegisterOwnerForm` (hydracja `client:load` lub `client:idle`).
- **Layout:** `src/layouts/AuthLayout.astro`
  - Wspólny layout dla stron logowania/rejestracji (logo, opis, kontener formularza, stopka z linkami prawnymi).
- **Komponent React:** `RegisterOwnerForm` (np. `src/components/features/auth/register-owner-form.tsx`)
  - Główny formularz rejestracji (pola, walidacja, komunikaty błędów, integracja z API).
  - Korzysta z komponentów Shadcn/ui: `Form`, `FormField`, `Input`, `Label`, `Button`, `Checkbox`, `FormMessage`, `FormDescription`.
- **Pomocnicze komponenty/elementy:**
  - `AuthHeader` (opcjonalnie) – nagłówek formularza (tytuł, podtytuł).
  - `AuthFooter` (opcjonalnie) – link do logowania „Masz już konto? Zaloguj się”, linki do stron prawnych (mogą być też w layout’cie).
  - Komponent `FormErrorAlert` – do wyświetlenia błędów globalnych (np. błąd z Supabase).

Hierarchia (drzewo):

- `register.astro`
  - `AuthLayout`
    - `AuthHeader` (tekstowy)
    - `RegisterOwnerForm` (React)
      - Shadcn/ui `Form`
        - `FormField` – `full_name` (Input)
        - `FormField` – `email` (Input)
        - `FormField` – `password` (Input typu `password`)
        - `FormField` – `confirmPassword` (Input typu `password`)
        - `FormField` – `acceptTerms` (Checkbox z linkami do `/regulamin` i `/polityka-prywatnosci`)
        - `Button` „Załóż konto” (disabled, jeśli formularz nie jest poprawny lub trwa wysyłka)
        - `FormErrorAlert` (błędy globalne)
    - `AuthFooter` (opcjonalnie: link do logowania, linki prawne)

## 4. Szczegóły komponentów

### 4.1. `register.astro`

- **Opis komponentu:** Strona odpowiedzialna za routing `/register`, osadzająca layout autoryzacyjny i komponent formularza rejestracji. Nie zawiera logiki biznesowej – jedynie strukturę i przekazanie ewentualnych propsów do Reacta (np. URL API).
- **Główne elementy:**
  - Import layoutu: `AuthLayout.astro`.
  - Import komponentu React `RegisterOwnerForm`.
  - Sekcja `<head>` z tytułem strony („Rejestracja właściciela | Rentflow”) i meta opisem.
  - Wewnątrz layoutu: nagłówek (`h1`, `p`) + slot na formularz.
- **Obsługiwane interakcje:** Brak bezpośrednich – wszystko obsługuje `RegisterOwnerForm`.
- **Obsługiwana walidacja:** Brak – wszystkie walidacje w React.
- **Typy:** Nie wymaga specjalnych typów poza typami Astro/React (TSX). Ewentualnie prosty typ na konfigurację (np. `RegisterPageProps`), ale prawdopodobnie zbędny.
- **Propsy:** Jeśli layout `AuthLayout` wymaga propsów (np. `title`, `subtitle`), strona powinna je przekazać; inaczej brak dodatkowych propsów.

### 4.2. `AuthLayout.astro`

- **Opis komponentu:** Layout wspólny dla stron auth (logowanie, rejestracja, reset hasła). Odpowiada za spójny wygląd: logo, tło, wyrównanie formularza, stopkę z linkami prawnymi i adresem e‑mail pomocy.
- **Główne elementy:**
  - Struktura: główny kontener (np. pełna wysokość ekranu), sekcja środkowa z kartą formularza (`card` z Shadcn lub Tailwind).
  - `slot` na treść (w tym `RegisterOwnerForm`).
  - Logo / nazwa aplikacji w górnej części.
  - Stopka z:
    - Linki `Regulamin` → `/regulamin` (otwierane w nowej karcie `target="_blank"`).
    - Link `Polityka Prywatności` → `/polityka-prywatnosci` (`target="_blank"`).
    - Link mailto do `pomoc@rentflow.pl`.
- **Obsługiwane interakcje:** Kliknięcia linków na stopce (standardowe linki).
- **Obsługiwana walidacja:** Brak.
- **Typy:** Jeśli layout przyjmuje propsy (np. `title?: string`, `subtitle?: string`), może mieć prosty interfejs:
  - `AuthLayoutProps = { title?: string; subtitle?: string }`.
- **Propsy:** przekazywane z `register.astro`, np.:
  - `title="Załóż konto właściciela"`
  - `subtitle="Zarządzaj swoimi mieszkaniami w jednym miejscu."`

### 4.3. `RegisterOwnerForm` (React)

- **Opis komponentu:** Główny formularz rejestracyjny dla właściciela. Odpowiada za:
  - Zarządzanie stanem pól formularza.
  - Walidację po stronie klienta przy użyciu schematu Zod.
  - Integrację z Supabase Auth (`/auth/v1/signup`).
  - Prezentację komunikatów błędów (inline + globalnych).
  - Wyłączenie przycisku „Załóż konto” do czasu spełnienia wszystkich warunków.
  - Przekierowanie do kreatora onboardingu po sukcesie.
- **Główne elementy:**
  - Kontener `Form` (Shadcn + `react-hook-form` / własne rozwiązanie).
  - Pola:
    - Input `Imię` (`full_name`).
    - Input `E‑mail` (`email`).
    - Input `Hasło` (`password`, typ `password`).
    - Input `Powtórz hasło` (`confirmPassword`, typ `password`).
    - Checkbox `acceptTerms` + tekst „Akceptuję Regulamin i Politykę Prywatności” z dwoma linkami.
  - `Button` (typ `submit`) „Załóż konto”.
  - Sekcja błędów globalnych (np. `FormErrorAlert`).
- **Obsługiwane interakcje:**
  - Zmiana wartości pól (`onChange`).
  - Blurem (ustawianie `touched`/`dirty` do pokazywania błędów dopiero po interakcji).
  - Kliknięcie przycisku „Załóż konto” → submit formularza:
    - Jeśli formularz nie jest poprawny: walidacja po stronie klienta, wyświetlenie błędów, brak wywołania API.
    - Jeśli formularz jest poprawny: wywołanie `useRegisterOwner` / funkcji API, pokazanie stanu `loading`.
  - Kliknięcie linków „Regulamin” i „Polityka Prywatności” – otwarcie nowych kart.
- **Obsługiwana walidacja (poziom komponentu):**
  - **Pola wymagane:**
    - `full_name`: wymagane, min. 2 znaki (spójnie z backendem, który już wymaga min. 2 dla `full_name`).
    - `email`: wymagane, poprawny format e‑mail.
    - `password`: wymagane.
    - `confirmPassword`: wymagane.
    - `acceptTerms`: musi być `true`.
  - **Reguły szczegółowe:**
    - `password`: co najmniej 8 znaków (US‑001).
    - `confirmPassword`: musi być identyczne jak `password`.
    - `email`: podstawowa walidacja formatu (np. Zod `z.string().email()`).
  - **Walidacja globalna / cross-field:**
    - Porównanie `password` i `confirmPassword`.
  - **UX walidacji:**
    - Inline validation – błędy pod polem (Shadcn `FormMessage`).
    - Czerwone ramki dla błędnych pól (Tailwind + klasy `border-destructive`).
    - Przycisk `submit` jest `disabled`, dopóki formularz nie przejdzie walidacji po stronie klienta (zgodnie z US‑007).
- **Typy:**
  - `RegisterOwnerFormValues` – view model formularza (szczegóły w sekcji Typy).
  - `RegisterOwnerApiPayload` – payload do Supabase Auth (szczegóły w sekcji Typy).
  - Ewentualnie `RegisterOwnerErrorState` – struktura błędów globalnych.
  - Będzie korzystać z typów Supabase (jeśli dostępne) lub uproszczonych typów odpowiedzi.
- **Propsy (interfejs komponentu):**
  - Na poziomie MVP komponent może być samowystarczalny (bez propsów).
  - Opcjonalnie:
    - `onRegistered?: () => void` – callback wywoływany po sukcesie (jeśli nie chcemy robić redirectu wewnątrz komponentu).
    - `redirectTo?: string` – ścieżka przekierowania po sukcesie (domyślnie `/onboarding`).
    - `supabaseUrl?: string` – alternatywny URL, jeśli nie korzystamy z globalnej konfiguracji.

### 4.4. `FormErrorAlert` (opcjonalny)

- **Opis komponentu:** Prezentuje błędy globalne niezwiązane bezpośrednio z jednym polem (np. „Adres e‑mail jest już zajęty”, „Wystąpił nieoczekiwany błąd serwera”).
- **Główne elementy:**
  - Kontener z klasami ostrzegawczymi (np. czerwone tło, ikona błędu).
  - Tekst komunikatu.
- **Obsługiwane interakcje:**
  - Opcjonalnie przycisk „Zamknij” (ukrycie komunikatu).
- **Walidacja:** Brak – tylko prezentacja statusu.
- **Typy:**
  - `FormErrorAlertProps = { message?: string; onClose?: () => void }`.

## 5. Typy

### 5.1. ViewModel formularza – `RegisterOwnerFormValues`

Typ reprezentujący stan formularza po stronie frontendu:

- `full_name: string`
  - Imię/nazwisko lub pełne imię użytkownika.
  - Walidacja: `z.string().trim().min(2, "Imię musi mieć co najmniej 2 znaki")`.
- `email: string`
  - Adres e‑mail właściciela.
  - Walidacja: `z.string().trim().email("Nieprawidłowy adres e‑mail")`.
- `password: string`
  - Hasło użytkownika.
  - Walidacja: `z.string().min(8, "Hasło musi mieć co najmniej 8 znaków")`.
- `confirmPassword: string`
  - Potwierdzenie hasła.
  - Walidacja: `z.string().min(8, "Hasło musi mieć co najmniej 8 znaków")` + cross-field: równe `password`.
- `acceptTerms: boolean`
  - Checkbox akceptacji regulaminu.
  - Walidacja: `z.literal(true, { message: "Musisz zaakceptować Regulamin i Politykę Prywatności" })` (w praktyce można użyć `z.boolean().refine(v => v, ...)`).

Schemat Zod:

```ts
const registerOwnerSchema = z
  .object({
    full_name: z.string().trim().min(2, "Imię musi mieć co najmniej 2 znaki"),
    email: z.string().trim().email("Nieprawidłowy adres e‑mail"),
    password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków"),
    confirmPassword: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków"),
    acceptTerms: z.boolean().refine((v) => v, {
      message: "Musisz zaakceptować Regulamin i Politykę Prywatności",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Hasła muszą być identyczne",
    path: ["confirmPassword"],
  });
```

### 5.2. Payload do Supabase – `RegisterOwnerApiPayload`

Typ reprezentujący ciało żądania `POST https://<supabase-url>/auth/v1/signup`:

- `email: string`
- `password: string`
- `data: {`
  - `full_name: string`
  - `role: "owner"`
  - `...` (opcjonalnie inne meta dane w przyszłości)
  - `}`

Typ:

```ts
type RegisterOwnerApiPayload = {
  email: string;
  password: string;
  data: {
    full_name: string;
    role: "owner";
  };
};
```

### 5.3. Odpowiedź z Supabase – `RegisterOwnerApiResponse` (uproszczona)

Na potrzeby widoku rejestracji wystarczy uproszczona struktura:

- `user?: { id: string; email?: string | null }`
- `session?: unknown` (lub konkretny typ z Supabase, jeśli będzie importowany)
- `error?: { message: string; status?: number; code?: string }`

Typ:

```ts
type RegisterOwnerApiResponse = {
  user?: { id: string; email?: string | null };
  session?: unknown;
  error?: { message: string; status?: number; code?: string };
};
```

### 5.4. Stan błędów globalnych – `RegisterOwnerErrorState`

Typ do przechowywania błędu globalnego:

- `message: string`
- `code?: string`

Typ:

```ts
type RegisterOwnerErrorState = {
  message: string;
  code?: string;
} | null;
```

### 5.5. Custom hook – `UseRegisterOwnerResult`

Typ dla wyniku custom hooka `useRegisterOwner`:

- `registerOwner(values: RegisterOwnerFormValues): Promise<void>`
- `isLoading: boolean`
- `error: RegisterOwnerErrorState`

Typ:

```ts
type UseRegisterOwnerResult = {
  registerOwner: (values: RegisterOwnerFormValues) => Promise<void>;
  isLoading: boolean;
  error: RegisterOwnerErrorState;
};
```

## 6. Zarządzanie stanem

- **Poziom komponentu `RegisterOwnerForm`:**
  - Główny stan formularza zarządzany przez `react-hook-form` (zalecane, spójne z Shadcn/ui) lub `useState` + własna walidacja.
  - Zastosowanie schematu Zod (`registerOwnerSchema`) jako źródła prawdy dla walidacji.
  - Pola: `full_name`, `email`, `password`, `confirmPassword`, `acceptTerms`.
  - Dodatkowy stan:
    - `isSubmitting` / `isLoading` (z `react-hook-form` lub custom).
    - `globalError: RegisterOwnerErrorState`.
    - Opcjonalnie: `hasSubmittedOnce` dla lepszej UX przy wyświetlaniu błędów.
- **Custom hook `useRegisterOwner`:**
  - Enkapsuluje logikę `fetch`/`supabase.auth.signUp` + obsługę błędów + redirect.
  - Zwraca `registerOwner`, `isLoading`, `error`.
  - Używany w `RegisterOwnerForm`, dzięki czemu komponent pozostaje czystszy, a logika API łatwo testowalna.
- **Czy wymagany jest globalny stan (np. context)?**
  - Nie, dla tego widoku wystarczy lokalny stan komponentu + ewentualne wykorzystanie globalnego klienta Supabase.
  - Sesja po rejestracji/zalogowaniu jest zarządzana przez Supabase (cookies / local storage), więc brak potrzeby manualnego trzymania jej w local state.

## 7. Integracja API

- **Endpoint:** `POST https://<supabase-url>/auth/v1/signup`
  - Wywołanie zgodnie z dokumentacją Supabase Auth (lub przy użyciu klienta `supabase-js`).
- **Nagłówki:**
  - `Content-Type: application/json`
  - `apikey: PUBLIC_SUPABASE_ANON_KEY` (jeśli używamy surowego `fetch`).
  - `Authorization: Bearer PUBLIC_SUPABASE_ANON_KEY` (wymagane przez Supabase Auth przy bezpośrednim wywołaniu REST).
- **Body żądania:** `RegisterOwnerApiPayload`
  - `email` – z formularza.
  - `password` – z formularza.
  - `data.full_name` – z formularza.
  - `data.role = "owner"` – stała wartość.
- **Odpowiedź:** `RegisterOwnerApiResponse`
  - W przypadku sukcesu:
    - `user` – informacje o nowo utworzonym użytkowniku.
    - `session` – aktywna sesja (oznacza automatyczne zalogowanie).
  - W przypadku błędu:
    - `error` – obiekt z `message`, `status`, `code`.
- **Integracja w `useRegisterOwner`:**
  - Zbudowanie payloadu na podstawie `RegisterOwnerFormValues`.
  - Wywołanie `fetch` z konfiguracją środowiskową (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`).
  - Analiza odpowiedzi:
    - Jeśli `error` istnieje → ustawienie `globalError` i rzucenie wyjątku / zwrócenie błędu.
    - Jeśli brak `user` lub `session` → traktowanie jak błąd nieoczekiwany.
  - Po sukcesie:
    - Opcjonalne odświeżenie klienta Supabase / sesji.
    - Redirect do `/onboarding` (np. `window.location.href = redirectTo`).

## 8. Interakcje użytkownika

- **Wypełnianie pól formularza:**
  - Użytkownik wpisuje imię, e‑mail, hasło i powtórzenie hasła.
  - Po opuszczeniu pola (blur) lub zmianie wartości:
    - Wykonywana jest walidacja dla danego pola (i powiązanych pól przy walidacji cross-field).
    - Przy błędzie pod polem wyświetlany jest komunikat, pole dostaje czerwony border.
- **Zaznaczenie checkboxa „Akceptuję Regulamin i Politykę Prywatności”:**
  - Kliknięcie zmienia `acceptTerms` na `true`/`false`.
  - Jeśli `false` przy próbie submitu, wyświetlany jest komunikat błędu.
- **Kliknięcie linków „Regulamin” / „Polityka Prywatności”:**
  - Otwiera nową kartę przeglądarki z odpowiednią stroną Astro (`target="_blank"`).
- **Kliknięcie przycisku „Załóż konto”:**
  - Jeśli formularz ma błędy:
    - Walidacja client-side uruchamia się.
    - Błędy są wyświetlane, submit nie wywołuje API.
  - Jeśli formularz jest poprawny:
    - Przycisk przechodzi w stan `loading` (spinner, tekst „Rejestracja…”).
    - Wywoływany jest hook `useRegisterOwner` (API Supabase).
    - W razie sukcesu:
      - Przycisk wraca do normalnego stanu.
      - Następuje redirect do `/onboarding`.
    - W razie błędu:
      - Przycisk wraca do normalnego stanu.
      - Wyświetlany jest `FormErrorAlert` z komunikatem typu:
        - `Ten adres e‑mail jest już zajęty`
        - `Wystąpił błąd serwera. Spróbuj ponownie później.`

## 9. Warunki i walidacja

- **Warunki weryfikowane przez UI:**
  - `full_name` ma co najmniej 2 znaki.
  - `email` jest niepusty i ma poprawny format.
  - `password` ma co najmniej 8 znaków.
  - `confirmPassword` jest identyczne jak `password`.
  - `acceptTerms` jest zaznaczony.
  - Formularz może zostać wysłany tylko wtedy, gdy wszystkie wyżej wymienione warunki są spełnione.
- **Komponenty odpowiedzialne za walidację:**
  - `RegisterOwnerForm` + schemat `registerOwnerSchema`.
  - Shadcn `FormField` + `FormMessage` odpowiadają za prezentację błędów.
- **Wpływ warunków na stan interfejsu:**
  - Błędne pola:
    - Oznaczone czerwonym borderem / tekstem błędu (Tailwind klasy).
  - Przycisk „Załóż konto”:
    - `disabled` gdy:
      - Formularz jest niepoprawny (np. `!formState.isValid`).
      - Trwa submit (`isSubmitting` / `isLoading`).
  - Błędy globalne:
    - Wyświetlany `FormErrorAlert`, który może blokować ponowny submit do czasu zmiany danych przez użytkownika.

## 10. Obsługa błędów

- **Błędy walidacji po stronie klienta:**
  - Obsłużone przez Zod + `react-hook-form`.
  - Wyświetlane inline pod danym polem.
- **Błędy walidacji po stronie Supabase (API):**
  - Przykłady:
    - E‑mail już istnieje → Supabase zwraca `error.code` typu `user_already_exists`.
    - Za krótkie hasło (gdyby ustawiono dodatkowe reguły po stronie Supabase).
  - Mapa błędów:
    - Znane kody → przyjazne komunikaty po polsku (np. `Ten adres e‑mail jest już używany.`).
    - Nieznane kody → ogólny komunikat „Wystąpił błąd podczas rejestracji. Spróbuj ponownie później.”
  - Prezentacja:
    - `FormErrorAlert` powyżej/przed przyciskiem `submit`.
- **Błędy sieciowe (network error, timeout):**
  - Wyświetlenie komunikatu: „Nie udało się połączyć z serwerem. Sprawdź połączenie internetowe i spróbuj ponownie.”
  - Brak redirectu.
- **Błędy nieoczekiwane (np. niepoprawny format odpowiedzi):**
  - Logowanie w konsoli (tylko w trybie dev).
  - Ogólny komunikat użytkowy.
- **Edge cases:**
  - Użytkownik kliknie „Załóż konto” wielokrotnie:
    - Przycisk jest `disabled` i/lub ma `pointer-events: none` w czasie `isLoading`, więc kolejne requesty nie są wysyłane.
  - Użytkownik opuszcza stronę w trakcie `loading`:
    - Nie wymaga dodatkowego handlingu – request zostanie przerwany.

## 11. Kroki implementacji

1. **Przygotowanie layoutu i routing:**
   - Upewnij się, że istnieje `AuthLayout.astro` (lub utwórz go) z podstawową strukturą i stopką zawierającą linki do `/regulamin`, `/polityka-prywatnosci` oraz `mailto:pomoc@rentflow.pl`.
   - Utwórz stronę `src/pages/register.astro`:
     - Ustaw tytuł strony i meta tagi.
     - Zaimportuj `AuthLayout` i `RegisterOwnerForm`.
     - Wewnątrz layoutu osadź `RegisterOwnerForm` z odpowiednią hydracją (`client:load` lub `client:idle`).
2. **Stworzenie komponentu `RegisterOwnerForm`:**
   - W katalogu `src/components/features/auth/` utwórz plik `register-owner-form.tsx`.
   - Zaimplementuj komponent z użyciem Shadcn `Form` + `react-hook-form` + `zod`.
   - Zdefiniuj typ `RegisterOwnerFormValues` oraz schemat `registerOwnerSchema` zgodny z wymaganiami.
   - Zbuduj strukturę formularza (pola input, checkbox, button), dodaj klasy Tailwind i komponenty Shadcn/ui.
3. **Implementacja walidacji client-side:**
   - Podłącz `registerOwnerSchema` do `react-hook-form` (resolver Zod).
   - Upewnij się, że błędy są wyświetlane inline (`FormMessage`) oraz że pola z błędami mają odpowiednie klasy (czerwone ramki).
   - Skonfiguruj formularz tak, aby `isValid` aktualizował się na bieżąco, a przycisk `submit` był `disabled`, gdy formularz jest niepoprawny.
4. **Implementacja custom hooka `useRegisterOwner`:**
   - Utwórz plik hooka, np. `src/lib/hooks/use-register-owner.ts`.
   - Zaimplementuj logikę:
     - Budowa `RegisterOwnerApiPayload` z `RegisterOwnerFormValues`.
     - Wywołanie `fetch` na `PUBLIC_SUPABASE_URL + "/auth/v1/signup"` z odpowiednimi nagłówkami (`apikey`, `Authorization`).
     - Parsowanie odpowiedzi i mapowanie błędów na `RegisterOwnerErrorState`.
     - Ustawianie flagi `isLoading`.
     - Po sukcesie – redirect do `/onboarding`.
5. **Integracja formularza z hookiem:**
   - W `RegisterOwnerForm` użyj `useRegisterOwner`.
   - W `onSubmit`:
     - Wywołaj `registerOwner(values)`.
     - Obsłuż ewentualne błędy (ustaw `globalError` na podstawie hooka).
6. **Obsługa UI błędów globalnych:**
   - Zaimportuj/utwórz `FormErrorAlert` i wykorzystaj go w `RegisterOwnerForm`, przekazując `globalError?.message`.
   - Dodaj przyjazne komunikaty dla najczęściej spotykanych błędów (np. `user_already_exists`).
7. **Dodanie linków do stron prawnych i logowania:**
   - W `RegisterOwnerForm` (lub w `AuthFooter`) dodaj tekst typu:
     - „Masz już konto? [Zaloguj się](/login)”
     - Tekst checkboxa z linkami do `/regulamin` i `/polityka-prywatnosci` (`target="_blank"`).
8. **Testy manualne i walidacja wymagań:**
   - Sprawdź, że:
     - Formularz nie pozwala na wysłanie przy błędach walidacji (client-side).
     - Przycisk jest `disabled`, dopóki walidacja nie przejdzie.
     - Błędy są wyświetlane inline dla każdego pola.
     - Checkbox jest wymagany (bez niego nie można wysłać formularza).
     - Przy poprawnych danych użytkownik jest rejestrowany w Supabase, automatycznie zalogowany i przekierowany do `/onboarding`.
     - Błędy z Supabase (np. email istnieje) są pokazywane w czytelnej formie.
9. **Dopracowanie RWD i UX:**
   - Upewnij się, że widok jest responsywny (RWD) i zgodny z wytycznymi PRD (czytelny na szerokościach od 360px).
   - Przetestuj formularz na urządzeniu mobilnym / w trybie mobilnym przeglądarki.
10. **Dokumentacja i cleanup:**
    - Krótko udokumentuj komponent `RegisterOwnerForm` i hook `useRegisterOwner` (TS docstringi).
    - Upewnij się, że kod przechodzi linting i type-check.


