## Plan implementacji widoku Rejestracja lokatora (`/register/tenant?token=xxx`)

## 1. Przegląd

Widok służy do rejestracji lokatora wyłącznie poprzez ważny, jednorazowy link zapraszający wygenerowany przez właściciela.  
Po wejściu z linku aplikacja waliduje token, prezentuje informację o mieszkaniu (nazwa, adres, właściciel), a następnie umożliwia założenie konta lokatora (Imię, E-mail, Hasło, Powtórz hasło, zgody).  
Po poprawnej rejestracji lokator jest automatycznie logowany, powiązany z mieszkaniem (utworzenie najmu) i przekierowywany do dashboardu lokatora.  
Widok musi poprawnie obsłużyć przypadki brzegowe: nieważny token, próba wejścia bez tokenu, ponowne użycie linku, lokator z już aktywnym najmem.

## 2. Routing widoku

- **Ścieżka:** `/register/tenant`
- **Parametry:** wymagany query param `token` (`/register/tenant?token=xyz`)
- **Typ renderowania:** SSR, `prerender = false` (dane zależne od tokenu i stanu bazy)
- **Dostępność:** publiczna (bez wymaganej sesji) – token w URL jest mechanizmem dostępu
- **Zachowania specjalne:**
  - Brak parametru `token` → natychmiastowy redirect na stronę błędu / stronę główną (zgodnie z US-051, opisem w UI-plan: redirect, np. na `/login` lub dedykowaną stronę zaproszeń).
  - Nieważny/wykorzystany token (GET `/api/invitations/:token` → 400 / `INVALID_TOKEN`) → redirect na dedykowaną stronę błędu zaproszenia (np. `/invitation-expired`) z komunikatem z US-050.
  - Ważny token → render widoku z informacją o mieszkaniu i formularzem rejestracji.

## 3. Struktura komponentów

Drzewo komponentów dla widoku:

- `register/tenant.astro` (Astro page, SSR)
  - używa layoutu `AuthLayout.astro`
  - wewnątrz: karta z React island
  - `TenantRegisterForm` (React, `src/components/features/auth/tenant-register-form.tsx`)
    - `Alert` z informacją o zaproszeniu i mieszkaniu
    - `Form` (Shadcn/ui) spięty z React Hook Form
      - Pola:
        - `Input` Imię (`full_name`)
        - `Input` E-mail (`email`)
        - `Input` Hasło (`password`, `type="password"`)
        - `Input` Powtórz hasło (`passwordConfirm`, `type="password"`)
        - `Checkbox` „Akceptuję Regulamin i Politykę Prywatności”
      - `Button` „Załóż konto” (submit)
    - Sekcja komunikatów błędów (inline + toast / ogólny error)

Potencjalne komponenty pomocnicze w ramach widoku:

- `TenantInvitationAlert` – wydzielony fragment z informacją o mieszkaniu (opcjonalnie osobny komponent).
- `FormLegalLinks` – drobny komponent z linkami do `/regulamin` i `/polityka-prywatnosci` (może być współdzielony z formularzem rejestracji właściciela).

## 4. Szczegóły komponentów

### 4.1. `register/tenant.astro` (strona Astro)

- **Opis i przeznaczenie:**
  - Odpowiada za SSR, walidację tokenu przed renderem UI oraz przekazanie danych do wyspy React.
  - Implementuje logikę przekierowań (brak tokenu, token nieważny) i integruje się z `AuthLayout.astro`.
- **Główne elementy:**
  - Eksport `export const prerender = false;`
  - Funkcja serwerowa (w top-level w Astro) pobierająca:
    - `const token = Astro.url.searchParams.get('token');`
    - Wywołanie `fetch` do własnego API: `GET /api/invitations/${token}` (lub użycie serwisu w `lib/services/invitation.service.ts` jeśli przewidziano taki pattern).
  - Opakowanie w layout:
    - `<AuthLayout>` / `<Layout>` z wycentrowaną kartą.
    - Wewnątrz: `<TenantRegisterForm client:only="react" {...props} />`.
- **Obsługiwane interakcje:**
  - Brak interakcji użytkownika bezpośrednio – wszystkie interakcje w React.
  - Logika na poziomie strony:
    - Redirect, jeśli `token` jest `null` → np. `return Astro.redirect('/login');` lub dedykowana ścieżka.
    - Redirect na stronę błędu zaproszenia, jeśli API zwróci 400 `Invalid Token`.
- **Walidacja / warunki:**
  - Na poziomie strony:
    - Warunek obecności parametru `token`.
    - Obsługa statusów odpowiedzi z `/api/invitations/:token`:
      - `200` – `validation.valid === true` → kontynuacja.
      - `400` – invalid token → redirect, zgodnie z US-050.
      - `500` / inne → wyświetlenie generycznego błędu lub redirect na 500/404 (zgodnie z ogólną strategią błędów).
- **Typy (DTO / ViewModel):**
  - Wejście z API: `ValidateInvitationDTO` z `src/types.ts`:
    - `valid: boolean`
    - `apartment: { name: string; address: string }`
    - `owner: { full_name: string }`
  - ViewModel przekazywany do React:
    - `TenantInvitationViewModel` (nowy typ, patrz sekcja 5).
- **Propsy do komponentu potomnego:**
  - `invitation: TenantInvitationViewModel`
  - `token: string` (oryginalny token z URL – potrzebny przy POST `/api/invitations/:token/accept`).

### 4.2. `TenantRegisterForm` (React)

- **Opis i przeznaczenie:**
  - Główna wyspa React odpowiedzialna za UI rejestracji lokatora, walidację formularza po stronie klienta i wywołania API.
  - Korzysta z React Hook Form + Zod (analogicznie do formularza rejestracji właściciela) oraz komponentów Shadcn/ui.
- **Główne elementy:**
  - Nagłówek formularza: np. „Załóż konto lokatora”.
  - `Alert`/`Card` nad formularzem z informacją:
    - „Zostałeś zaproszony do mieszkania **[Nazwa]** (**[Adres]**). Właściciel: **[Imię właściciela]**.”
  - Pola formularza:
    - `full_name` – `Input`, label „Imię i nazwisko”
    - `email` – `Input`, label „E-mail”, typ `email`
    - `password` – `Input`, label „Hasło”, typ `password`
    - `passwordConfirm` – `Input`, label „Powtórz hasło”, typ `password`
    - `acceptTerms` – `Checkbox` + tekst „Akceptuję Regulamin i Politykę Prywatności” + linki do statycznych stron
  - Przycisk `Button`:
    - Tekst: „Załóż konto”
    - Stan ładowania: spinner + disabled, gdy trwa rejestracja.
- **Obsługiwane interakcje:**
  - Zmiana wartości pól (controlled przez React Hook Form).
  - Kliknięcie checkboxa zgód.
  - Submit formularza:
    1. Local Zod validation; w przypadku błędów – inline, brak wywołań API.
    2. Jeśli ok:
       - Wywołanie rejestracji w Supabase Auth (`signup` z rolą `tenant`).
       - Po sukcesie: wywołanie `POST /api/invitations/:token/accept`.
       - Po sukcesie obu kroków: redirect do `/dashboard` (dashboard lokatora) + toast sukcesu.
  - Obsługa błędów:
    - Wyświetlanie błędów walidacji (client-side) pod polami.
    - Wyświetlanie błędów biznesowych / serwerowych jako:
      - Inline komunikat nad formularzem lub
      - Toast (Sonner) z treścią z backendu.
- **Walidacja:**
  - **Po stronie klienta (Zod):**
    - `full_name`: `string().trim().min(2)` – spójne z API `/api/users/me`.
    - `email`: poprawny format, wymagany (spójnie z rejestracją właściciela).
    - `password`: `string().min(8)` – jak w US-001.
    - `passwordConfirm`: identyczne jak `password` (`refine`).
    - `acceptTerms`: `true` – checkbox musi być zaznaczony.
  - **Po stronie serwera:**
    - Supabase Auth: unikalność e-maila, minimalna długość hasła, inne reguły bezpieczeństwa.
    - `POST /api/invitations/:token/accept`:
      - Token ważny, status `pending`.
      - Użytkownik nie może posiadać aktywnego najmu (US-053).
      - Mieszkanie nie może mieć aktywnego najmu.
- **Typy (DTO / ViewModel) używane w komponencie:**
  - `TenantInvitationViewModel` – wejście (dane o mieszkaniu/właścicielu).
  - `TenantRegisterFormValues` – struktura danych formularza, patrz sekcja 5.
  - `AcceptInvitationResponseDTO` – odpowiedź z `POST /api/invitations/:token/accept` (z `src/types.ts`).
  - `ApiError` / `TenantRegisterApiError` – lokalny typ na potrzeby mapowania błędów HTTP na komunikaty UI.
- **Propsy:**
  - `invitation: TenantInvitationViewModel`
  - `token: string`

### 4.3. `TenantInvitationAlert` (opcjonalny komponent pomocniczy)

- **Opis i przeznaczenie:**
  - Prezentuje informację o mieszkaniu oraz właścicielu, związanych z linkiem zapraszającym.
  - Buduje zaufanie i kontekst dla lokatora, spełniając wymagania US-002 i US-043.
- **Główne elementy:**
  - Shadcn `Alert` lub `Card` z ikoną (np. dom/mieszkanie).
  - Tekst: „Zostałeś zaproszony do mieszkania **[apartmentName]** (**[apartmentAddress]**). Właściciel: **[ownerFullName]**.”
- **Obsługiwane interakcje:** brak (tylko read-only).
- **Typy:**
  - `TenantInvitationViewModel` lub prosty zestaw props:
    - `apartmentName: string`
    - `apartmentAddress: string`
    - `ownerFullName: string`
- **Propsy:**
  - `invitation: TenantInvitationViewModel`

## 5. Typy

### 5.1. Istniejące DTO z `src/types.ts` wykorzystywane w widoku

- **`ValidateInvitationDTO` (GET `/api/invitations/:token`):**
  - `valid: boolean` – czy token jest ważny.
  - `apartment: { name: string; address: string }` – dane mieszkania z zaproszenia.
  - `owner: { full_name: string }` – dane właściciela zapraszającego.
- **`AcceptInvitationResponseDTO` (POST `/api/invitations/:token/accept`):**
  - `lease`: obiekt zawierający minimum:
    - `id: string`
    - `apartment_id: string`
    - `tenant_id: string`
    - `status: 'active' | ...` (Enum `lease_status`)
    - `start_date: string` (ISO)
    - `created_at: string`

### 5.2. Nowe typy ViewModel dla widoku

- **`TenantInvitationViewModel`** – uproszczony model do UI:
  - `token: string` – token zaproszenia (kopiowany z URL).
  - `apartmentName: string`
  - `apartmentAddress: string`
  - `ownerFullName: string`
  - Opcjonalnie `isValid: true` – dla spójności, choć przy wejściu na widok token już musi być ważny.

- **`TenantRegisterFormValues`** – dane formularza rejestracji:
  - `full_name: string`
  - `email: string`
  - `password: string`
  - `passwordConfirm: string`
  - `acceptTerms: boolean`

- **`TenantRegisterApiError`** – typ pomocniczy na potrzeby komponentu:
  - `fieldErrors?: Partial<Record<keyof TenantRegisterFormValues, string>>` – mapowanie pola → komunikat.
  - `globalError?: string` – komunikat ogólny (np. błąd serwera, konflikt najmu).
  - `statusCode?: number` – kod HTTP (do ewentualnego różnicowania zachowań).

### 5.3. Typy dla custom hooków

- **`UseTenantRegistrationResult`** – typ zwracany przez hook `useTenantRegistration` (jeśli będzie wprowadzony):
  - `registerTenant: (values: TenantRegisterFormValues) => Promise<void>` – główna akcja submit.
  - `isLoading: boolean` – stan wysyłania.
  - `error: TenantRegisterApiError | null` – ostatni błąd.

## 6. Zarządzanie stanem

- **Poziom strony (`register/tenant.astro`):**
  - Brak stanu reaktywnego – jedynie jednorazowe pobranie danych z API i przekazanie do React.
- **Poziom komponentu React (`TenantRegisterForm`):**
  - React Hook Form:
    - Stan pól formularza (`TenantRegisterFormValues`).
    - Stan błędów walidacji (po stronie klienta).
  - Lokalny stan komponentu:
    - `isSubmitting: boolean` – ustawiany na czas całego procesu (signup + accept invitation).
    - `apiError: TenantRegisterApiError | null` – ostatni błąd z API.
- **Potencjalny custom hook: `useTenantRegistration` (w `src/components/hooks/use-tenant-registration.ts`):**
  - Odpowiedzialny za:
    - Wywołanie Supabase Auth signup (z rolą `tenant`).
    - Wywołanie `POST /api/invitations/:token/accept`.
    - Mapowanie błędów backendu (w tym specjalne komunikaty `USER_HAS_LEASE`, `APARTMENT_HAS_LEASE`, `INVALID_TOKEN`) na `TenantRegisterApiError`.
  - Użycie:
    - `const { registerTenant, isLoading, error } = useTenantRegistration(token);`
    - W `onSubmit` formularza:
      - `await registerTenant(values);`
      - Po sukcesie – redirect do `/dashboard`.

## 7. Integracja API

### 7.1. Walidacja tokenu (SSR)

- **Endpoint:** `GET /api/invitations/:token`
- **Wywołanie:** w `register/tenant.astro` na serwerze:
  - Budowa URL: `const apiUrl = new URL(`/api/invitations/${token}`, Astro.url.origin);`
  - `const res = await fetch(apiUrl);`
- **Request:**
  - Metoda: `GET`
  - Brak body, brak nagłówków auth (endpoint publiczny).
- **Response typ `200` (`ValidateInvitationDTO`):**
  - Przepisanie do `TenantInvitationViewModel`.
- **Response typ `400` (`Invalid Token` / brak tokenu):**
  - Redirect na `/invitation-expired` lub alternatywnie na `/login` z parametrem informującym.
- **Response typ `500`:**
  - Możliwe strategie:
    - Redirect na `/500` lub generyczny error w tym widoku: „Wystąpił błąd serwera. Spróbuj ponownie później.”

### 7.2. Rejestracja lokatora (Supabase Auth)

- **Endpoint:** `POST https://<supabase-url>/auth/v1/signup`
- **Wywołanie:** w przeglądarce, z użyciem klienta Supabase skonfigurowanego globalnie.
- **Body (zgodne z API-plan, z rolą `tenant`):**
  - `email: string`
  - `password: string`
  - `data`: obiekt metadanych:
    - `full_name: string`
    - `role: 'tenant'`
- **Oczekiwania:**
  - Po sukcesie Supabase ustawia cookie sesyjne / token potrzebny do autoryzacji kolejnych żądań.
  - Błędy (np. email już istnieje) są zwracane w standardowym formacie Supabase – należy je zmapować na:
    - Błąd pola `email` („Ten e-mail jest już zarejestrowany”) lub
    - Błąd ogólny („Nie udało się założyć konta. Spróbuj ponownie.”).

### 7.3. Akceptacja zaproszenia (powiązanie lokatora z mieszkaniem)

- **Endpoint:** `POST /api/invitations/:token/accept`
- **Wywołanie:** po udanej rejestracji i automatycznym zalogowaniu lokatora:
  - `await fetch(`/api/invitations/${token}/accept`, { method: 'POST' });`
  - Autoryzacja: poprzez sesję Supabase (middleware Astro ustawia `context.locals.user`).
- **Możliwe odpowiedzi i ich obsługa:**
  - `200` (`AcceptInvitationResponseDTO`):
    - Sukces – zapisanie ewentualnych danych w UI nie jest konieczne (i tak redirect na `/dashboard`).
  - `400` z różnymi komunikatami:
    - `INVALID_TOKEN` (obsługiwany w samym endpointcie jako message „Ten link zapraszający wygasł lub został już wykorzystany”):
      - Po stronie UI: toast + redirect na `/invitation-expired`.
    - `USER_HAS_LEASE` („Twoje konto jest już przypisane do aktywnego najmu”):
      - UI: toast + inline komunikat nad formularzem, brak redirectu (użytkownik wie, co się stało).
    - `APARTMENT_HAS_LEASE` („To mieszkanie ma już aktywnego lokatora”):
      - UI: toast + komunikat, można zasugerować kontakt z właścicielem.
  - `401` („Brak autoryzacji” – np. problem z sesją po signupie):
    - Redirect na `/login` z komunikatem: „Sesja wygasła. Zaloguj się ponownie, aby dokończyć proces.”
  - `500`:
    - Toast: „Wystąpił błąd serwera. Spróbuj ponownie później.”

## 8. Interakcje użytkownika

- **Wejście na stronę z linku:**
  - *Wejście*: kliknięcie linku z zaproszenia w e-mailu/SMS.
  - *Rezultat*:
    - Przy ważnym tokenie – wyświetlenie widoku z informacją o mieszkaniu i formularzem rejestracji.
    - Przy nieważnym tokenie – przekierowanie na stronę błędu zaproszenia (US-050).
- **Wypełnienie formularza:**
  - Użytkownik wypełnia pola, w razie błędów walidacji client-side:
    - Pola są oznaczone czerwonym obramowaniem.
    - Pod polem widoczny komunikat (np. „To pole jest wymagane”, „Hasło musi mieć co najmniej 8 znaków”).
  - Checkbox zgód musi być zaznaczony, inaczej przy próbie submitu pojawia się komunikat.
- **Kliknięcie „Załóż konto”:**
  - Gdy formularz jest niepoprawny – przycisk pozostaje aktywny, ale walidacja uniemożliwia wywołania API (błędy inline).
  - Gdy formularz jest poprawny:
    - Przycisk przechodzi w stan ładowania (`disabled`, spinner), formularz jest dezaktywowany.
    - W tle:
      1. Wywołanie Supabase Auth signup.
      2. Po sukcesie – wywołanie `POST /api/invitations/:token/accept`.
  - *Rezultaty*:
    - Sukces obu kroków – toast „Konto zostało utworzone, witaj w Rentflow!” + redirect do `/dashboard`.
    - Błędy – odpowiednie komunikaty (patrz sekcja 10).

## 9. Warunki i walidacja

- **Warunki wejścia na widok:**
  - URL zawiera `token`:
    - Jeśli nie – redirect na `/login` lub stronę błędu (US-051).
  - Token jest ważny według `GET /api/invitations/:token`:
    - Jeśli `400 Invalid Token` – redirect na `/invitation-expired` + komunikat (US-050).
- **Walidacja formularza po stronie klienta:**
  - Zgodnie z US-001 i US-002:
    - `full_name`: wymagane, min 2 znaki.
    - `email`: wymagany, poprawny format (regex).
    - `password`: wymagane, min 8 znaków.
    - `passwordConfirm`: identyczne jak `password`.
    - `acceptTerms`: musi być `true`.
  - Przycisk „Załóż konto”:
    - Może być aktywny, ale przy naciśnięciu blokujemy przejście dalej, jeśli są błędy.
    - Alternatywnie, zgodnie z US-007, możemy utrzymywać przycisk w stanie disabled dopóki formularz jest niepoprawny (React Hook Form `formState.isValid` + `mode: 'onChange'`).
- **Walidacja po stronie serwera i warunki biznesowe:**
  - Supabase Auth:
    - Spójność z wymaganiami haseł i e-maila (dodatkowe błędy mapowane na komunikaty).
  - `POST /api/invitations/:token/accept`:
    - Token wciąż ważny (pending).
    - Lokator nie posiada aktywnego najmu (US-053).
    - Mieszkanie nie ma aktywnego najmu (US-019/US-020/US-021).
    - W razie niespełnienia – odpowiednie błędy 400 (mapowane w UI).

## 10. Obsługa błędów

- **Błędy walidacji formularza (client-side):**
  - Wyświetlane inline pod polami.
  - Nie wysyłamy żądań do API, dopóki formularz nie przejdzie walidacji.
- **Błędy rejestracji Supabase Auth:**
  - Przykłady:
    - E-mail już istnieje → błąd pola `email` („Konto z tym adresem e-mail już istnieje”).
    - Zbyt słabe hasło → błąd pola `password`.
  - Ogólny fallback: `globalError` z komunikatem „Nie udało się założyć konta. Spróbuj ponownie.”
- **Błędy `POST /api/invitations/:token/accept`:**
  - Mapped business errors:
    - `INVALID_TOKEN` (komunikat z endpointu) → toast + redirect na `/invitation-expired`.
    - `USER_HAS_LEASE` → komunikat inline + toast; użytkownik pozostaje na stronie (może się np. wylogować).
    - `APARTMENT_HAS_LEASE` → komunikat inline; sugerujemy kontakt z właścicielem.
  - `401 Unauthorized` → redirect do `/login?redirect=/register/tenant?token=...`.
  - `500` → toast z komunikatem: „Wystąpił błąd serwera. Spróbuj ponownie później lub skontaktuj się z pomocą (pomoc@rentflow.pl).”
- **Błędy sieciowe / timeouty:**
  - Jeden ogólny komunikat: „Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.”
  - Możliwość ponownego submitu (przycisk ponownie aktywny).

## 11. Kroki implementacji

1. **Dodanie strony routingu Astro:**
   - Utworzenie pliku `src/pages/register/tenant.astro`.
   - Ustawienie `export const prerender = false;`.
   - Wczytanie parametru `token` z `Astro.url.searchParams`.
   - Implementacja wywołania `GET /api/invitations/:token` i logiki redirectów (brak tokenu, nieważny token).
   - Mapowanie `ValidateInvitationDTO` na `TenantInvitationViewModel` i przekazanie do wyspy React.
2. **Stworzenie komponentu React `TenantRegisterForm`:**
   - Lokalizacja: `src/components/features/auth/tenant-register-form.tsx`.
   - Implementacja formularza z React Hook Form + Zod, z polami `full_name`, `email`, `password`, `passwordConfirm`, `acceptTerms`.
   - Dodanie `Alert` z informacją o mieszkaniu (`TenantInvitationViewModel`).
   - Dodanie linków do `/regulamin` i `/polityka-prywatnosci`.
3. **Implementacja logiki rejestracji lokatora:**
   - Wstrzyknięcie klienta Supabase (analogicznie do istniejących formularzy auth).
   - Wywołanie `supabase.auth.signUp` z metadanymi (`full_name`, `role: 'tenant'`).
   - Mapowanie błędów Supabase na `TenantRegisterApiError`.
4. **Integracja z `POST /api/invitations/:token/accept`:**
   - Po sukcesie signupu wywołanie `fetch('/api/invitations/${token}/accept', { method: 'POST' })`.
   - Obsługa różnych komunikatów błędów (`INVALID_TOKEN`, `USER_HAS_LEASE`, `APARTMENT_HAS_LEASE`) zgodnie z sekcją 10.
5. **Redirect po sukcesie:**
   - Po poprawnym signupie i akceptacji zaproszenia:
     - Wywołanie redirectu do `/dashboard` (np. `window.location.href = '/dashboard';`).
     - Wyświetlenie toastu sukcesu (Sonner).
6. **Ewentualny custom hook `useTenantRegistration`:**
   - Wyekstrahowanie logiki signup + accept + mapowanie błędów do `src/components/hooks/use-tenant-registration.ts`.
   - Użycie go w `TenantRegisterForm` dla uproszczenia komponentu.
7. **Implementacja / weryfikacja strony błędu zaproszenia:**
   - Upewnienie się, że istnieje widok `/invitation-expired` lub podobny, zgodny z UI-plan (komunikat „Ten link zapraszający wygasł lub został już wykorzystany” i instrukcja z US-050).
8. **Dopasowanie stylów i RWD:**
   - Zastosowanie Tailwind 4 + Shadcn/ui w spójnym stylu z `RegisterForm` właściciela.
   - Zapewnienie pełnej responsywności (mobile-first, min. 360px).
9. **Testy manualne i/lub E2E:**
   - Scenariusze:
     - Rejestracja z poprawnym tokenem.
     - Wejście na `/register/tenant` bez tokenu.
     - Wejście z tokenem nieważnym/zużytym.
     - Lokator z już aktywnym najmem używa nowego linku (US-053).
   - Weryfikacja poprawnego przekierowania do dashboardu lokatora po sukcesie.


