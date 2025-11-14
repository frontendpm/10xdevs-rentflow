## Plan implementacji widoku Kreator onboardingu (`/onboarding`)

### 1. Przegląd

Widok **Kreator onboardingu** prowadzi nowego właściciela przez obowiązkowy, dwustopniowy proces startu z aplikacją: **utworzenie pierwszego mieszkania** oraz **wygenerowanie linku zapraszającego lokatora**. Po pomyślnym ukończeniu kreatora użytkownik trafia na dashboard (`/dashboard`), gdzie widzi swoje mieszkanie i może dalej zarządzać najmem. Widok musi być prosty, responsywny, pozbawiony globalnej nawigacji oraz spójny z istniejącym ekosystemem komponentów (React 19, Shadcn/ui, Tailwind 4).

### 2. Routing widoku

- **Ścieżka:** `/onboarding`
- **Plik strony:** `src/pages/onboarding.astro`
- **Typ renderowania:** SSR (`export const prerender = false;`)
- **Dostępność / autoryzacja:**
  - Dostęp wyłącznie dla zalogowanego użytkownika o roli `owner`.
  - Middleware: jeśli użytkownik nie jest zalogowany → redirect na `/login?redirect=/onboarding`.
  - Dla właściciela, który **ma już ukończony onboarding** (np. ma co najmniej jedno mieszkanie i aktywną konfigurację) → redirect na `/dashboard` (lub inny docelowy widok właściciela).
- **Wymuszenie kreatora:**
  - Brak globalnej nawigacji (brak linków do dashboardu, innych widoków).
  - Logika “wymuszania” poza zakresem tego widoku (middleware / logika serwerowa), ale widok nie powinien oferować żadnych ścieżek na zewnątrz poza “Zakończ → /dashboard`.

### 3. Struktura komponentów

Drzewo komponentów dla `/onboarding`:

```text
OnboardingPage (Astro: pages/onboarding.astro)
└── OnboardingLayout (Astro layout bez globalnej nawigacji)
    └── <OnboardingWizard /> (React island)
        ├── <ProgressIndicator />
        ├── StepContent
        │   ├── [Krok 1] <ApartmentForm mode="onboarding" />
        │   └── [Krok 2] <InvitationLinkGenerator />
        └── Globalne elementy UI:
            ├── Przycisk "Wstecz" (opcjonalnie dla kroku 2)
            ├── Przycisk "Dalej"/"Zakończ"
            └── Toastery (Shadcn/ui) dla komunikatów globalnych
```

Potencjalne rozszerzenie:

- Custom hook: `useOnboardingWizard()` – zarządza stanem kroku, bieżącymi danymi mieszkania, statusem ładowania i błędami API.

### 4. Szczegóły komponentów

#### 4.1. `OnboardingLayout.astro`

- **Opis komponentu:** Layout dla widoku onboardingu, bez globalnej nawigacji (header z logo, brak breadcrumbs, brak menu użytkownika). Zapewnia spójne tło, responsywny kontener i stopkę z linkami prawnymi.
- **Główne elementy:**
  - Prosty `header` z logo Rentflow (kliknięcie nie zmienia trasy lub pozostaje na `/onboarding`).
  - `main` z wycentrowaną kartą kreatora (Shadcn `Card`).
  - `footer` z linkami do `/regulamin` i `/polityka-prywatnosci`.
- **Obsługiwane interakcje:**
  - Brak aktywnych linków nawigacyjnych poza linkami prawnymi (otwierają się w tej samej karcie).
- **Obsługiwana walidacja:** Brak – layout tylko opakowuje treść.
- **Typy:**
  - Brak specyficznych typów – typowy `Props` z `children`.
- **Propsy:**
  - `children: JSX.Element` – zawartość (React island lub Astro content).

#### 4.2. `OnboardingWizard` (React)

- **Opis komponentu:** Główny komponent kreatora, odpowiedzialny za logikę wielokrokową, integrację z API oraz zarządzanie stanem i błędami.
- **Główne elementy:**
  - Nagłówek (tytuł, krótki opis).
  - `<ProgressIndicator step={currentStep} totalSteps={2} />`.
  - Warunkowo renderowane kroki:
    - `currentStep === 1` → `<ApartmentForm ... />`.
    - `currentStep === 2` → `<InvitationLinkGenerator ... />`.
  - Dolny pasek akcji:
    - Przyciski Shadcn `Button`:
      - Krok 1: `Dalej` (submit formularza, `type="submit"`, disabled gdy formularz nieprzejdący walidacji lub `isSubmitting`).
      - Krok 2: `Zakończ` (redirect na `/dashboard`).
    - Opcjonalny `Wstecz` dla kroku 2 (wraca do kroku 1 bez dodatkowego wywołania API).
  - Globalny komponent `Toast` dla komunikatów (np. “Mieszkanie zostało dodane”, “Nie udało się wygenerować linku zapraszającego…”).
- **Obsługiwane interakcje:**
  - Zmiana kroku (`setCurrentStep(1 | 2)`).
  - Obługa `onSubmit` w `ApartmentForm` (delegacja do `handleCreateApartment`).
  - Wywołanie `onGenerateInvitation` w `InvitationLinkGenerator`.
  - Obsługa przycisku `Zakończ` → `router.push('/dashboard')` lub klasyczny redirect `window.location.href`.
- **Obsługiwana walidacja:**
  - Walidacja formularza mieszkania (obsługiwana w `ApartmentForm`).
  - Walidacja warunku przejścia do kroku 2:
    - Do kroku 2 można przejść tylko, gdy posiadamy `apartmentId` i dane mieszkania w stanie.
- **Typy:**
  - `OnboardingStep = 1 | 2`.
  - `OnboardingWizardState`:
    ```ts
    type OnboardingStep = 1 | 2;

    interface OnboardingWizardState {
      currentStep: OnboardingStep;
      apartment?: OnboardingApartmentVM;
      isCreatingApartment: boolean;
      isGeneratingInvitation: boolean;
      error?: string | null;
    }
    ```
  - `OnboardingApartmentVM` – patrz sekcja 5.
- **Propsy:**
  - Brak wymaganych propsów biznesowych (widok kontrolowany lokalnie).
  - Opcjonalnie:
    - `initialStep?: OnboardingStep` – domyślnie `1`.
    - `initialApartment?: OnboardingApartmentVM` – w razie zmiany kierunku implementacji (np. powrót po redirectach).

#### 4.3. `ProgressIndicator` (React)

- **Opis komponentu:** Prosty wskaźnik postępu kreatora (“Krok 1 z 2”, “Krok 2 z 2”) z możliwą prostą wizualizacją (np. pasek lub kroki).
- **Główne elementy:**
  - Tekst: `Krok {step} z {totalSteps}`.
  - Pasek postępu (Tailwind, prosty `div` z szerokością zależną od kroku).
- **Obsługiwane interakcje:**
  - Brak interakcji (tylko wyświetlanie).
- **Obsługiwana walidacja:** Brak.
- **Typy:**
  ```ts
  interface ProgressIndicatorProps {
    step: number;
    totalSteps: number;
  }
  ```
- **Propsy:**
  - `step` – aktywny krok (`1` lub `2`).
  - `totalSteps` – liczba kroków (tu zawsze `2`, ale komponent ogólny).

#### 4.4. `ApartmentForm` (React – wariant onboardingowy)

> Komponent będzie współdzielony z widokami `/apartments/new` i ustawieniami mieszkania, ale tutaj opis dotyczy konfiguracji w kontekście onboardingu.

- **Opis komponentu:** Formularz dodawania mieszkania (Nazwa, Adres) używany jako krok 1/2 kreatora.
- **Główne elementy:**
  - `Form` (Shadcn/ui) + `react-hook-form` + Zod.
  - Pola:
    - `Input` dla `name` (label “Nazwa mieszkania”).
    - `Input` lub `Textarea` dla `address` (label “Adres”).
  - Komunikaty błędów inline (`FormMessage`).
- **Obsługiwane interakcje:**
  - Wprowadzanie tekstu do pól.
  - Walidacja inline przy blur / zmianie / submit.
  - Submit formularza (`onSubmit`), który jest przechwytywany przez `OnboardingWizard`.
- **Obsługiwana walidacja (zgodnie z API `POST /api/apartments`):**
  - `name`:
    - wymagane,
    - string, min. 3 znaki.
  - `address`:
    - wymagane,
    - string, min. 5 znaków.
  - Przycisk `Dalej`:
    - disabled, dopóki formularz nie jest poprawny (`isValid === false`) lub trwa submit (`isSubmitting === true`).
- **Typy:**
  ```ts
  interface ApartmentFormValues {
    name: string;
    address: string;
  }

  interface ApartmentFormProps {
    defaultValues?: ApartmentFormValues;
    mode?: 'onboarding' | 'standalone';
    onSubmit: (values: ApartmentFormValues) => Promise<void> | void;
    isSubmitting?: boolean;
  }
  ```
- **Propsy:**
  - `defaultValues` – domyślne wartości (opcjonalnie puste).
  - `mode` – do dostosowania tekstów/przycisków; w onboardingu np. placeholdery bardziej “prowadzące”.
  - `onSubmit` – callback przekazywany z `OnboardingWizard`.
  - `isSubmitting` – sterowanie stanem disabled przycisku i spinnerem.

#### 4.5. `InvitationLinkGenerator` (React)

- **Opis komponentu:** Krok 2/2 kreatora – generowanie i kopiowanie linku zapraszającego dla świeżo utworzonego mieszkania.
- **Główne elementy:**
  - Sekcja z podsumowaniem mieszkania:
    - Nazwa mieszkania.
    - Adres.
  - Przycisk Shadcn `Button` “Wygeneruj link zapraszający”.
  - Pole tekstowe typu `Input` z wygenerowanym linkiem (`invitationUrl`) w trybie read-only.
  - Przycisk `Kopiuj` (ikona + tekst), z `Tooltip` “Skopiowano!” po sukcesie.
  - Krótki tekst instruktażowy: “Skopiuj link i wyślij go swojemu lokatorowi e-mailem lub SMS-em”.
- **Obsługiwane interakcje:**
  - Kliknięcie `Wygeneruj link zapraszający`:
    - Wywołanie `POST /api/apartments/:id/invitations`.
    - Stan ładowania (`isGeneratingInvitation`).
    - Po sukcesie → ustawienie `invitationUrl` + toast “Link zapraszający został wygenerowany”.
  - Kliknięcie `Kopiuj`:
    - Użycie `navigator.clipboard.writeText(invitationUrl)`.
    - Po sukcesie → tooltip “Skopiowano!” + opcjonalny toast.
  - Przycisk “Zakończ” jest zarządzany przez `OnboardingWizard` na dole widoku; `InvitationLinkGenerator` może wystawiać informację, czy link wygenerowano.
- **Obsługiwana walidacja:**
  - Przycisk “Wygeneruj link zapraszający”:
    - disabled, jeśli `apartmentId` brak lub trwa ładowanie.
  - Przycisk “Kopiuj”:
    - disabled, jeśli `invitationUrl` jest pusty.
  - Przycisk “Zakończ”:
    - w idealnym scenariuszu – dostępny dopiero, gdy `invitationUrl` jest ustawiony (spełnienie US-012).
- **Typy:**
  ```ts
  interface InvitationLinkGeneratorProps {
    apartment: OnboardingApartmentVM;
    invitation?: InvitationLinkVM;
    onGenerate: () => Promise<void>;
  }

  interface InvitationLinkVM {
    url: string;
    status: 'idle' | 'loading' | 'ready' | 'error';
    errorMessage?: string;
  }
  ```
- **Propsy:**
  - `apartment` – dane mieszkania (id, name, address).
  - `invitation` – aktualny stan linku (opcjonalne, kontrolowane przez `OnboardingWizard`).
  - `onGenerate` – funkcja generująca link (wywołuje API).

#### 4.6. `useOnboardingWizard` (custom hook – opcjonalny, ale rekomendowany)

- **Opis komponentu:** Hook enkapsulujący całą logikę stanu kreatora (krok, dane mieszkania, stany ładowania, błędy) i wywołania API.
- **Główne elementy:**
  - Lokalne `useState` / `useReducer`:
    - `step`, `apartment`, `invitation`, flagi ładowania, `error`.
  - Funkcje:
    - `createApartment(values: ApartmentFormValues)` – wywołanie `POST /api/apartments`.
    - `generateInvitation()` – wywołanie `POST /api/apartments/:id/invitations`.
    - `goToStep(step: OnboardingStep)`.
    - `finish()` – redirect na `/dashboard`.
- **Obsługiwane interakcje:**
  - Używany przez `OnboardingWizard` – dzięki temu komponent pozostaje “szczupły”.
- **Obsługiwana walidacja:**
  - Weryfikacja, że przed `generateInvitation()` istnieje `apartment.id`.
- **Typy:** patrz sekcja 5 (typy ViewModel i DTO).
- **Propsy:** Hook nie przyjmuje propsów, ewentualnie `initialState`.

### 5. Typy

#### 5.1. Istniejące typy (z `src/types.ts`, API planu i bazy)

- **Backend/DTO:**
  - `CreateApartmentCommand` – request body `POST /api/apartments`:
    - `name: string` (min 3).
    - `address: string` (min 5).
  - Odpowiedź `POST /api/apartments` – rekord `apartments`:
    - `id: string`.
    - `name: string`.
    - `address: string`.
    - `owner_id: string`.
    - `created_at: string`.
    - `updated_at: string`.
  - `CreateInvitationResponseDTO` – `POST /api/apartments/:id/invitations`:
    - `id: string`.
    - `apartment_id: string`.
    - `token: string`.
    - `status: 'pending' | 'accepted' | ...`.
    - `invitation_url: string`.
    - `created_at: string`.

Te typy backendowe są wykorzystywane po stronie frontu jako kontrakty API, ale dla komponentów widoku definiujemy uproszczone ViewModel.

#### 5.2. Nowe typy ViewModel dla widoku onboardingu

- **`OnboardingStep`**
  ```ts
  export type OnboardingStep = 1 | 2;
  ```

- **`OnboardingApartmentVM`** – minimalny zestaw danych o mieszkaniu potrzebny w kreatorze:
  ```ts
  export interface OnboardingApartmentVM {
    id: string;
    name: string;
    address: string;
  }
  ```
  - Źródło: response `POST /api/apartments` (mapowanie pól 1:1).

- **`InvitationLinkVM`** – stan widoku linku zapraszającego:
  ```ts
  export interface InvitationLinkVM {
    url: string;
    status: 'idle' | 'loading' | 'ready' | 'error';
    errorMessage?: string;
  }
  ```
  - `url` – `invitation_url` z `CreateInvitationResponseDTO`.
  - `status` – pozwala na sterowanie disabled / loaderami.
  - `errorMessage` – tekst błędu dla UI (np. toast).

- **`OnboardingWizardState`**
  ```ts
  export interface OnboardingWizardState {
    currentStep: OnboardingStep;
    apartment?: OnboardingApartmentVM;
    invitation?: InvitationLinkVM;
    isCreatingApartment: boolean;
    isGeneratingInvitation: boolean;
    error?: string | null;
  }
  ```

- **Typy formularza:**
  ```ts
  export interface ApartmentFormValues {
    name: string;
    address: string;
  }
  ```

Wszystkie powyższe typy mogą być zdefiniowane w pliku np. `src/types.ts` lub dedykowanym module `src/types/onboarding.ts`, w zależności od przyjętej konwencji.

### 6. Zarządzanie stanem

- **Poziom globalny:**
  - Stan użytkownika i roli (`UserProfileDTO`) jest już obsługiwany w projekcie (middleware + `/api/users/me`); widok onboardingu zakłada, że w momencie montowania mamy dostępne `context.locals.user` oraz że jest to właściciel.
  - Brak konieczności tworzenia nowego globalnego store pod onboarding – logika ogranicza się do jednego widoku.
- **Poziom widoku (`OnboardingWizard`):**
  - Lokalne `useState` / `useReducer` dla:
    - `currentStep`, `apartment`, `invitation`, flag ładowania, błędów.
  - Integracja z `react-hook-form`:
    - `useForm<ApartmentFormValues>({ mode: 'onChange', resolver: zodResolver(apartmentSchema) })`.
    - `isValid` używane do kontrolowania dostępności przycisku `Dalej`.
- **Custom hook `useOnboardingWizard`:**
  - Odpowiada za:
    - Wywołania API (`createApartment`, `generateInvitation`).
    - Aktualizację `OnboardingWizardState`.
    - Mapowanie błędów API na komunikaty dla UI.
  - `OnboardingWizard` używa go w stylu:
    ```ts
    const {
      state,
      createApartment,
      generateInvitation,
      goToStep,
      finish,
    } = useOnboardingWizard();
    ```
- **Zarządzanie nawigacją:**
  - `finish()` wykonuje redirect na `/dashboard`.
  - Opcjonalnie: jeśli podczas ładowania `/onboarding` backend wykryje, że onboarding jest już ukończony, strona nie renderuje kreatora, tylko od razu redirectuje (SSR).

### 7. Integracja API

#### 7.1. `POST /api/apartments` – utworzenie mieszkania (krok 1)

- **Wywołanie z frontu:**
  - W `createApartment(values)`:
    ```ts
    const response = await fetch('/api/apartments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    ```
- **Typy żądania:**
  - `CreateApartmentCommand` (`name`, `address`) – mapujemy bezpośrednio z `ApartmentFormValues`.
- **Typy odpowiedzi:**
  - DTO odpowiadające rekordowi `apartments`:
    - Mapowane na `OnboardingApartmentVM`:
      - `id`, `name`, `address`.
- **Obsługa statusów:**
  - `201` – sukces:
    - Ustawiamy `state.apartment` i przechodzimy do kroku 2.
    - Pokazujemy toast “Mieszkanie zostało dodane”.
  - `400` – błąd walidacji:
    - Parsujemy `details` (jeśli dostępne) i mapujemy na błędy formularza (Zod + RHF).
  - `403` – brak uprawnień (np. rola nie-owner):
    - Toast “Tylko właściciele mogą dodawać mieszkania”.
    - Opcjonalnie redirect na `/403`.
  - `500` – błąd serwera:
    - Toast “Wystąpił błąd serwera. Spróbuj ponownie później”.

#### 7.2. `POST /api/apartments/:id/invitations` – generowanie linku (krok 2)

- **Wywołanie z frontu:**
  ```ts
  const response = await fetch(`/api/apartments/${apartment.id}/invitations`, {
    method: 'POST',
  });
  ```
- **Typy żądania:**
  - Bez body – endpoint identyfikowany tylko `apartmentId` i zalogowanym użytkownikiem.
- **Typy odpowiedzi:**
  - `CreateInvitationResponseDTO`:
    - interesuje nas głównie `invitation_url`.
  - Mapowanie:
    - `invitation.url = dto.invitation_url`.
    - `invitation.status = 'ready'`.
- **Obsługa statusów:**
  - `201` – sukces:
    - Ustawienie `InvitationLinkVM` na `ready`.
    - Wyświetlenie toastu “Link zapraszający został wygenerowany”.
  - `400` – np. mieszkanie ma już aktywnego lokatora (w onboardingu teoretycznie nie powinno się wydarzyć, ale obsługujemy defensywnie):
    - Toast z komunikatem biznesowym z API (“To mieszkanie ma już aktywnego lokatora”).
    - `invitation.status = 'error'`, `errorMessage` ustawione.
  - `403` – brak uprawnień:
    - Jak wyżej, toast + ewentualny redirect na `/403`.
  - `500` – błąd serwera:
    - Toast z komunikatem ogólnym.

#### 7.3. Redirect po zakończeniu

- Po kliknięciu “Zakończ”:
  - Prosty redirect:
    ```ts
    window.location.href = '/dashboard';
    ```
  - lub, jeśli używany jest router klientowy, stosujemy jego API.
- Nie ma dodatkowego wywołania API – logika zakończenia onboardingu jest de facto: mieszkanie utworzone + link wygenerowany.

### 8. Interakcje użytkownika

- **Po wejściu na `/onboarding`:**
  - Użytkownik widzi krok 1/2 z pustym formularzem mieszkania.
  - Może wypełnić pola lub opuścić stronę (nie ma linków, ale nic nie blokuje zamknięcia karty).
- **Krok 1 – Dodanie mieszkania:**
  - Wypełnienie pola “Nazwa mieszkania”:
    - Val: min 3 znaki.
  - Wypełnienie pola “Adres”:
    - Val: min 5 znaków.
  - Przycisk “Dalej”:
    - Na początku disabled.
    - Po spełnieniu walidacji → aktywny.
    - Po kliknięciu → submit → `POST /api/apartments`.
  - W razie błędów walidacji:
    - Błędy inline pod odpowiadającymi polami.
- **Przejście do kroku 2:**
  - Po sukcesie tworzenia mieszkania:
    - UI przełącza się na “Krok 2 z 2”.
    - Wyświetlone zostają nazwa i adres nowego mieszkania.
- **Krok 2 – Generowanie linku:**
  - Przycisk “Wygeneruj link zapraszający”:
    - Kliknięcie → `POST /api/apartments/:id/invitations`.
    - Pokazanie loadera na przycisku.
  - Po sukcesie:
    - Pole z wygenerowanym linkiem (readonly).
    - Przycisk “Kopiuj”:
      - Kliknięcie → zapis do schowka → tooltip “Skopiowano!”.
  - Przycisk “Zakończ”:
    - Kliknięcie → redirect na `/dashboard`.
  - Opcjonalnie przycisk “Wstecz”:
    - Przejście z powrotem do kroku 1 (bez dodatkowego API).

### 9. Warunki i walidacja

- **Walidacja formularza mieszkania (poziom komponentu):**
  - `name`:
    - required,
    - `string` min 3 znaki – zgodnie z `CreateApartmentCommand`.
  - `address`:
    - required,
    - `string` min 5 znaków.
  - Inline errors + czerwone ramki przy błędnych polach.
  - Przycisk “Dalej” disabled do czasu spełnienia walidacji.
- **Walidacja warunków API:**
  - `POST /api/apartments`:
    - Błędy walidacji z backendu mapowane na pola (jeśli backend zwróci szczegóły).
    - Brak potrzeby dodatkowej walidacji po stronie klienta poza tą, którą już mamy.
  - `POST /api/apartments/:id/invitations`:
    - Sprawdzenie, że `apartment.id` istnieje w stanie przed wywołaniem.
    - Obsługa błędu biznesowego (np. aktywny lokator) – toast, blokada kontynuacji.
- **Warunki przejść między krokami:**
  - Przejście do kroku 2 możliwe tylko, jeśli:
    - `apartment` w stanie jest ustawione (mamy dane z API).
  - Można rozważyć blokadę przycisku “Zakończ”, jeśli `invitationUrl` nie istnieje (żeby wymusić wygenerowanie linku – zgodność z US-012).

### 10. Obsługa błędów

- **Błędy walidacji formularza:**
  - Błędy Zod / client-side:
    - Wyświetlane bezpośrednio pod polami.
  - Błędy server-side (HTTP 400 z `details`):
    - Mapowane na konkretne pola, jeśli klucze pokrywają się z nazwami pól.
- **Błędy autoryzacji (401, 403):**
  - 401 – obsługiwane przez middleware (redirect do `/login`).
  - 403 – toast “Nie masz uprawnień do wykonania tej akcji” + opcjonalny redirect `/403`.
- **Błędy biznesowe (400 z message):**
  - Np. próba wygenerowania linku dla mieszkania z lokatorem:
    - Toast z komunikatem z `message`.
    - `InvitationLinkVM.status = 'error'`.
- **Błędy serwera (500):**
  - Globalny toast:
    - “Wystąpił błąd serwera. Spróbuj ponownie lub skontaktuj się z pomocą (pomoc@rentflow.pl).”
  - Formularz pozostaje wypełniony (nie czyścimy stanu).
- **Błędy sieci (brak odpowiedzi):**
  - Traktowane jak 500 – ten sam komunikat.
- **Przypadek odświeżenia strony:**
  - Po odświeżeniu w kroku 2 tracimy stan:
    - Minimalne wymaganie MVP: kreator startuje od kroku 1 (użytkownik może po prostu utworzyć mieszkanie ponownie).
    - Możliwe usprawnienie (poza MVP): zapis `apartmentId` w query params lub `localStorage` i próba odtworzenia stanu.

### 11. Kroki implementacji

1. **Routing i layout:**
   - Utwórz stronę `src/pages/onboarding.astro` z `prerender = false`.
   - Zastosuj `OnboardingLayout.astro` (nowy layout bez globalnej nawigacji) i osadź w niej React island `<OnboardingWizard />`.
   - W middleware upewnij się, że `/onboarding` wymaga zalogowanego użytkownika i roli `owner`.
2. **Definicja typów i schema walidacji:**
   - Dodaj typy `OnboardingStep`, `OnboardingApartmentVM`, `InvitationLinkVM`, `ApartmentFormValues` w dedykowanym module (np. `src/types/onboarding.ts`).
   - Zdefiniuj schema Zod dla `ApartmentFormValues` (min 3/5 znaków).
3. **Implementacja `ApartmentForm`:**
   - Jeśli komponent już istnieje – rozszerz go o tryb `mode="onboarding"` i props `onSubmit` oraz `isSubmitting`.
   - Zapewnij integrację z `react-hook-form` i walidacją Zod, disabled przycisku `Dalej` przy błędach.
4. **Implementacja `ProgressIndicator`:**
   - Utwórz prosty komponent przyjmujący `step`, `totalSteps` i renderujący tekst + pasek postępu (Tailwind).
5. **Implementacja custom hooka `useOnboardingWizard`:**
   - Zaimplementuj stan `OnboardingWizardState` i funkcje:
     - `createApartment(values)` – `POST /api/apartments`, mapowanie odpowiedzi → `OnboardingApartmentVM`, obsługa błędów.
     - `generateInvitation()` – `POST /api/apartments/:id/invitations`, mapowanie → `InvitationLinkVM`.
     - `goToStep(step)` i `finish()`.
   - Dodaj obsługę toastów dla sukcesów i błędów.
6. **Implementacja `InvitationLinkGenerator`:**
   - Zaimplementuj UI kroku 2 z podsumowaniem mieszkania, przyciskiem “Wygeneruj link zapraszający”, polem readonly z linkiem, przyciskiem “Kopiuj” + tooltip “Skopiowano!”.
   - Oprzyj logikę na propsach `apartment`, `invitation`, `onGenerate`.
7. **Implementacja `OnboardingWizard`:**
   - Użyj `useOnboardingWizard` do pobrania stanu i akcji.
   - Warunkowo renderuj `ApartmentForm` (krok 1) i `InvitationLinkGenerator` (krok 2).
   - Dodaj dolny pasek z przyciskami:
     - Krok 1: “Dalej” (submit formularza) – wywołuje `createApartment`.
     - Krok 2: “Zakończ” (wywołuje `finish()`), opcjonalnie “Wstecz”.
8. **Integracja z API i testy manualne:**
   - Sprawdź poprawność wywołań:
     - Utworzenie mieszkania → status 201, przejście do kroku 2.
     - Generowanie linku → status 201, pojawienie się linku i poprawne kopiowanie.
   - Zweryfikuj, że błędy walidacji są poprawnie wyświetlane.
9. **Mapowanie User Stories i UX:**
   - Upewnij się, że:
     - US-010 – po rejestracji właściciel trafia na `/onboarding` (logika w flow rejestracji).
     - US-011 – formularz mieszkania spełnia wymagania pól i walidacji.
     - US-012 – krok 2 pokazuje dane mieszkania, generuje link, umożliwia kopiowanie, a zakończenie redirectuje na `/dashboard`.
10. **Responsywność i accessibility:**
    - Przetestuj widok na ekranach mobilnych (~360px).
    - Upewnij się, że:
      - Wszystkie interaktywne elementy mają focus state.
      - Przycisk “Kopiuj” ma `aria-label`, tooltip jest poprawnie odczytywany.
      - Teksty są w języku polskim, zgodnie z PRD.
11. **Refaktoryzacja i dokumentacja:**
    - W razie potrzeby wydziel fragmenty logiki do wspólnych komponentów (np. użycie `InvitationLinkGenerator` także w zakładce “Ustawienia” mieszkania).
    - Uzupełnij dokumentację w `.ai/ui` (ten plik) o ewentualne zmiany w przyszłości (np. dodanie pamiętania stanu po odświeżeniu).***

