## Plan implementacji widoku Dodawanie mieszkania (`/apartments/new`)

## 1. Przegląd

Widok służy do dodawania nowego mieszkania przez zalogowanego właściciela, poza obowiązkowym kreatorem onboardingu. Użytkownik wypełnia prosty formularz (Nazwa mieszkania, Adres), po poprawnym zapisie jest przekierowywany z powrotem na dashboard (`/dashboard`), gdzie nowe mieszkanie pojawia się na liście. Widok musi wykorzystywać istniejący formularz `ApartmentForm` (React) i trzymać się tych samych reguł walidacji oraz integracji z endpointem `POST /api/apartments`.

## 2. Routing widoku

- **Ścieżka URL:** `/apartments/new`
- **Rodzaj renderowania:** SSR (Astro page z wyłączonym `prerender`)
- **Plik strony:** `src/pages/apartments/new.astro`
- **Layout:** `DashboardLayout.astro` (globalna nawigacja + stopka)
- **Dostępność:** tylko zalogowani użytkownicy z rolą `owner` (wymuszane przez middleware + RLS; dodatkowo obsługa ewentualnego błędu 403 z API)

## 3. Struktura komponentów

Drzewo komponentów (logiczne, pomijając layout globalny):

- `DashboardLayout.astro`
  - `Header` (logo, breadcrumbs, menu użytkownika)
    - `Breadcrumbs` (np. "Dashboard > Dodaj mieszkanie")
  - `Main`
    - `NewApartmentView` (React island, strona widoku)
      - `PageHeader` (np. tytuł `Dodaj mieszkanie`, krótki opis)
      - `ApartmentForm`
        - Pola formularza:
          - `FormInput` (Nazwa mieszkania)
          - `FormInput` (Adres)
        - `Button` (submit)
        - Obsługa błędów walidacji (inline) i stanu ładowania
  - `Footer` (Regulamin, Polityka prywatności, `pomoc@rentflow.pl`)

`ApartmentForm` już istnieje i jest używany w kreatorze `/onboarding`; widok `/apartments/new` powinien go reużyć, ewentualnie rozszerzając o tryb `mode="create"` i callback `onSuccess`.

## 4. Szczegóły komponentów

### NewApartmentView (React)

- **Opis komponentu:**  
  Główny komponent React dla widoku `/apartments/new`. Odpowiada za opakowanie `ApartmentForm` w kontekst strony: tytuł, breadcrumbs, integracja z toastami, redirect po sukcesie oraz wysokopoziomową obsługę błędów API.

- **Główne elementy:**
  - Nagłówek strony (`h1`): "Dodaj mieszkanie"
  - Podtytuł/krótki opis: "Uzupełnij dane nowego mieszkania, aby dodać je do swojego dashboardu."
  - Breadcrumbs przekazywane z Astro lub generowane na podstawie propsów: "Dashboard > Dodaj mieszkanie"
  - Komponent `ApartmentForm` w trybie tworzenia nowego mieszkania

- **Obsługiwane interakcje:**
  - Inicjacja wysyłki formularza (delegowana do `ApartmentForm`)
  - Przechwycenie sygnału sukcesu (`onSuccess`) z `ApartmentForm`:
    - Wyświetlenie toastu: "Mieszkanie zostało dodane"
    - Redirect na `/dashboard` (np. `window.location.href = '/dashboard'`)
  - Opcjonalnie: globalna obsługa błędów (np. dla błędu nieobsłużonego w formularzu – toast "Wystąpił błąd serwera. Spróbuj ponownie.")

- **Obsługiwana walidacja:**  
  Brak własnej walidacji pól – delegowana w całości do `ApartmentForm` (React Hook Form + Zod). `NewApartmentView` może jedynie pilnować, aby nie wywoływać `onSuccess` przy nieudanym żądaniu do API.

- **Typy:**
  - `NewApartmentViewProps` (opcjonalne):
    ```ts
    type NewApartmentViewProps = {
      redirectPath?: string; // domyślnie '/dashboard'
    };
    ```

- **Propsy:**
  - `redirectPath?: string` – ścieżka, na którą przekierować po sukcesie (domyślnie `/dashboard`).

### ApartmentForm (React – istniejący, rozszerzony o tryb create)

- **Opis komponentu:**  
  Reużywalny formularz dodawania/edycji mieszkania. Dla widoku `/apartments/new` działa w trybie tworzenia nowego mieszkania. Integruje React Hook Form + Zod, wysyła żądanie `POST /api/apartments` i mapuje odpowiedzi walidacyjne z backendu na błędy formularza. Ten sam komponent powinien być użyty także w kreatorze onboardingu i w zakładce „Ustawienia” mieszkania (tryb edycji).

- **Główne elementy:**
  - `Form` (Shadcn) + `React Hook Form`:
    - Pole `name` – `FormField` + `Input`
    - Pole `address` – `FormField` + `Input`
  - Przycisk `Button` (submit):
    - Tekst: "Dodaj mieszkanie" w trybie create
    - Disabled w trakcie wysyłania i gdy formularz nie jest poprawny
  - Miejsce na komunikaty błędów pod polami (`FormMessage`)

- **Obsługiwane interakcje:**
  - `onChange` pól `name`, `address` – aktualizacja stanu formularza i walidacja inline
  - `onSubmit` formularza:
    - Walidacja po stronie klienta (Zod) – jeśli błędy, blokada żądania
    - Wywołanie `fetch('/api/apartments', { method: 'POST', body: JSON.stringify(formValues) })`
    - Obsługa odpowiedzi:
      - `201` → wywołanie `onSuccess(responseDto)`
      - `400` Validation Error → mapowanie `details` na błędy pól (inline)
      - `401` → redirect na `/login?redirect=/apartments/new` albo toast "Sesja wygasła. Zaloguj się ponownie."
      - `403` → toast "Tylko właściciele mogą dodawać mieszkania"
      - `500` → toast "Wystąpił błąd serwera. Spróbuj ponownie."
  - Disabled submit w trakcie `isSubmitting`

- **Obsługiwana walidacja (zgodnie z API):**
  - Pole `name`:
    - wymagane (`required`)
    - typ `string`
    - minimalna długość: 3 znaki
  - Pole `address`:
    - wymagane (`required`)
    - typ `string`
    - minimalna długość: 5 znaków
  - Walidacja inline:
    - Puste pola → "To pole jest wymagane"
    - Zbyt krótkie wartości → np. "Nazwa mieszkania musi mieć co najmniej 3 znaki"
  - Przycisk "Dodaj mieszkanie" nieaktywny, jeśli formularz ma błędy klienta

- **Typy:**
  - ViewModel formularza:
    ```ts
    type CreateApartmentFormValues = {
      name: string;
      address: string;
    };
    ```
  - `CreateApartmentCommand` (API request – już zdefiniowany w `types.ts`):
    ```ts
    // Pick<TablesInsert<'apartments'>, 'name' | 'address'>
    type CreateApartmentCommand = {
      name: string;
      address: string;
    };
    ```
  - Oczekiwany DTO odpowiedzi (zgodnie z API planem `POST /api/apartments`):
    ```ts
    type CreateApartmentResponseDTO = {
      id: string;
      name: string;
      address: string;
      owner_id: string;
      created_at: string;
      updated_at: string;
    };
    ```

- **Propsy (interfejs komponentu):**
  ```ts
  type ApartmentFormProps = {
    mode: 'create' | 'edit';
    initialValues?: CreateApartmentFormValues; // używane w trybie edit
    onSuccess?: (apartment: CreateApartmentResponseDTO) => void;
    onError?: (errorMessage: string) => void; // opcjonalne, np. do globalnych toastów
  };
  ```

### Breadcrumbs (React / istniejący komponent nawigacyjny)

- **Opis komponentu:**  
  Wyświetla ścieżkę nawigacji w headerze layoutu. Dla tego widoku powinna być postaci "Dashboard > Dodaj mieszkanie".

- **Główne elementy:**
  - Lista segmentów breadcrumb:
    - "Dashboard" → link do `/dashboard`
    - "Dodaj mieszkanie" → bieżąca strona (bez linku)

- **Obsługiwane interakcje:**
  - Kliknięcie w "Dashboard" → przejście na `/dashboard`

- **Typy:**
  ```ts
  type BreadcrumbItem = {
    label: string;
    href?: string;
  };
  ```

- **Propsy:**
  ```ts
  type BreadcrumbsProps = {
    items: BreadcrumbItem[];
  };
  ```

## 5. Typy

Nowe i używane typy potrzebne do implementacji widoku:

- **CreateApartmentFormValues (ViewModel formularza):**
  - `name: string` – nazwa mieszkania
  - `address: string` – pełny adres mieszkania

- **CreateApartmentCommand (request DTO – już istnieje w `types.ts`):**
  - Mapowany 1:1 z `CreateApartmentFormValues`
  - Pola:
    - `name: string`
    - `address: string`

- **CreateApartmentResponseDTO (response DTO – do wykorzystania po stronie frontendu):**
  - `id: string`
  - `name: string`
  - `address: string`
  - `owner_id: string`
  - `created_at: string (ISO)`
  - `updated_at: string (ISO)`

- **NewApartmentViewProps (opcjonalne):**
  - `redirectPath?: string`

- **BreadcrumbItem / BreadcrumbsProps** – jak w sekcji komponentów.

Typy backendowe (`CreateApartmentCommand`, `Tables<'apartments'>`) pozostają źródłem prawdy; ViewModel formularza powinien być z nimi kompatybilny (ten sam zestaw pól).

## 6. Zarządzanie stanem

- **Poziom widoku (`NewApartmentView`):**
  - Brak złożonego globalnego stanu; wystarczy lokalne zarządzanie:
    - `isRedirecting: boolean` – zabezpieczenie przed wielokrotnym redirectem (opcjonalne)
  - Po sukcesie formularza:
    - Wywołanie `toast.success("Mieszkanie zostało dodane")`
    - Ustawienie `isRedirecting = true` i wykonanie `window.location.href = redirectPath`

- **Poziom formularza (`ApartmentForm`):**
  - React Hook Form:
    - `formState.values: CreateApartmentFormValues`
    - `formState.errors` – błędy walidacji klienta i serwera
    - `formState.isSubmitting` – pokazuje stan wysyłania
    - `formState.isValid` – kontrola aktywności przycisku submit
  - Dodatkowo:
    - `apiError?: string` – ogólny błąd spoza mapowalnych błędów walidacji (np. 500)

- **Custom hook (zalecany, ale nie wymagany):**
  - `useCreateApartment`:
    ```ts
    type UseCreateApartmentResult = {
      createApartment: (payload: CreateApartmentCommand) => Promise<CreateApartmentResponseDTO>;
      isLoading: boolean;
    };
    ```
  - Odpowiedzialność:
    - enkapsulacja logiki `fetch('/api/apartments', ...)`
    - obsługa statusów HTTP i mapowanie na wyjątki/błędy
    - możliwość reużycia w kreatorze onboardingu

Nie ma potrzeby używania globalnego store (np. Nano Stores) dla tego widoku – po dodaniu mieszkania i redirect na `/dashboard` dane i tak będą odświeżane z backendu (`GET /api/dashboard`).

## 7. Integracja API

- **Endpoint:** `POST /api/apartments`
- **Autoryzacja:** wymagany zalogowany użytkownik z rolą `owner` (auth Supabase + RLS)

- **Request (body JSON):**
  ```json
  {
    "name": "Kawalerka na Woli",
    "address": "ul. Złota 44, Warszawa"
  }
  ```

- **Request (TypeScript):**
  ```ts
  const payload: CreateApartmentCommand = {
    name,
    address,
  };
  ```

- **Response 201 (JSON):**
  ```json
  {
    "id": "uuid",
    "name": "Kawalerka na Woli",
    "address": "ul. Złota 44, Warszawa",
    "owner_id": "uuid",
    "created_at": "2025-01-12T10:00:00Z",
    "updated_at": "2025-01-12T10:00:00Z"
  }
  ```

- **Obsługa błędów:**
  - `400 Validation Error` – niepoprawne dane (zbyt krótkie pola, brak pól)
  - `401 Unauthorized` – brak sesji (przekierowanie do `/login`)
  - `403 Forbidden` – użytkownik nie jest właścicielem
  - `500 Internal Server Error` – ogólny błąd serwera

- **Flow w komponencie:**
  - Submit formularza → wywołanie `createApartment(payload)`
  - Na sukces:
    - wywołanie `onSuccess(dto)`
    - w `NewApartmentView`: toast + redirect `/dashboard`
  - Na błąd walidacji:
    - Ustawienie błędów na polach formularza (jeśli backend zwróci szczegóły)
  - Na inne błędy:
    - Wyświetlenie toastu z komunikatem z `message` lub fallbackiem

## 8. Interakcje użytkownika

- Użytkownik wchodzi na `/dashboard` i klika przycisk "Dodaj mieszkanie" → przejście na `/apartments/new`.
- Na `/apartments/new`:
  - Widziany jest breadcrumb "Dashboard > Dodaj mieszkanie".
  - Użytkownik wypełnia:
    - Nazwa mieszkania (np. "Kawalerka na Woli")
    - Adres (np. "ul. Złota 44, Warszawa")
  - Podczas pisania:
    - Błędy walidacji inline pojawiają się pod polami po opuszczeniu inputu lub przy próbie submita.
  - Po kliknięciu "Dodaj mieszkanie":
    - Przycisk przechodzi w stan ładowania, jest wyłączony.
    - Przy poprawnych danych i udanym żądaniu:
      - Pojawia się toast "Mieszkanie zostało dodane".
      - Użytkownik jest przekierowany na `/dashboard`.
      - Na dashboardzie widoczna jest nowa karta mieszkania.
    - Przy błędzie walidacji z backendu:
      - Błędy są pokazane przy odpowiednich polach.
    - Przy błędzie serwera lub sieci:
      - Pojawia się toast z informacją o błędzie.

## 9. Warunki i walidacja

- **Warunki wymagane przez API:**
  - `name`:
    - obecność (required)
    - string, min 3 znaki
  - `address`:
    - obecność (required)
    - string, min 5 znaków
  - Użytkownik musi być właścicielem (`role = 'owner'`)

- **Walidacja na poziomie komponentu:**
  - Zod schema w `ApartmentForm`:
    ```ts
    const createApartmentSchema = z.object({
      name: z.string().min(3, 'Nazwa mieszkania musi mieć co najmniej 3 znaki'),
      address: z.string().min(5, 'Adres musi mieć co najmniej 5 znaków'),
    });
    ```
  - Walidacja wywoływana:
    - inline (onBlur/onChange)
    - przy submit (blokuje wysłanie requestu, jeśli błędy)
  - Przycisk "Dodaj mieszkanie":
    - disabled gdy `!formState.isValid` lub `formState.isSubmitting`

- **Wpływ na stan interfejsu:**
  - Błędy walidacji:
    - czerwone obramowanie pola
    - komunikat błędu pod polem
  - Błędy serwera:
    - toast z ogólnym komunikatem (np. "Wystąpił błąd serwera. Spróbuj ponownie.")
  - Brak uprawnień:
    - toast "Tylko właściciele mogą dodawać mieszkania"
    - opcjonalny redirect do `/dashboard` lub `/403`

## 10. Obsługa błędów

Potencjalne scenariusze błędów i oczekiwane zachowanie:

- **Niepoprawne dane wejściowe (400 Validation Error):**
  - Backend zwraca komunikat "Nieprawidłowe dane" oraz ewentualne szczegóły.
  - Frontend:
    - mapuje `details` na błędy pól (`name`, `address`)
    - nie wykonuje redirectu
    - utrzymuje wartości pól (bez czyszczenia formularza)

- **Brak autoryzacji (401 Unauthorized):**
  - Sesja wygasła lub brak tokenu.
  - Frontend:
    - opcjonalny toast "Sesja wygasła. Zaloguj się ponownie."
    - redirect na `/login?redirect=/apartments/new`

- **Brak uprawnień (403 Forbidden):**
  - Użytkownik nie jest właścicielem.
  - Frontend:
    - toast "Tylko właściciele mogą dodawać mieszkania"
    - redirect na `/dashboard` lub `/403` (w zależności od przyjętego wzorca)

- **Błąd serwera (500 Internal Server Error):**
  - Nieoczekiwany problem po stronie backendu.
  - Frontend:
    - toast "Wystąpił błąd serwera. Spróbuj ponownie."
    - formularz pozostaje wypełniony, aby użytkownik nie stracił danych

- **Błąd sieci (fetch error, brak internetu):**
  - Frontend:
    - toast "Nie udało się połączyć z serwerem. Sprawdź połączenie internetowe i spróbuj ponownie."
    - brak redirectu, możliwość ponownego wysłania

## 11. Kroki implementacji

1. **Dodanie strony routingu:**
   - Utwórz plik `src/pages/apartments/new.astro`.
   - Ustaw `export const prerender = false;`.
   - Owiń zawartość w `DashboardLayout.astro` i zapewnij przekazanie breadcrumbs.

2. **Przygotowanie breadcrumbs dla widoku:**
   - W `new.astro` skonfiguruj `Breadcrumbs` z elementami:
     - `{ label: 'Dashboard', href: '/dashboard' }`
     - `{ label: 'Dodaj mieszkanie' }`

3. **Stworzenie/wyodrębnienie komponentu `NewApartmentView`:**
   - W `src/components/features/apartments/` dodaj np. `new-apartment-view.tsx`.
   - Zaimportuj `ApartmentForm` i konfiguruj go z `mode="create"` oraz callbackami `onSuccess`, `onError`.
   - Zaimplementuj header (tytuł, opis) zgodnie z UI planem.

4. **Rozszerzenie `ApartmentForm` o tryb `create`:**
   - Upewnij się, że `ApartmentForm` ma props `mode: 'create' | 'edit'`.
   - Zaimplementuj walidację Zod (`name` min 3, `address` min 5).
   - Zaimplementuj submit:
     - dla `mode="create"` → `POST /api/apartments`
   - Dodaj obsługę `onSuccess` i `onError`.

5. **Implementacja hooka `useCreateApartment` (opcjonalnie, jeśli nie istnieje):**
   - Umieść go w `src/components/hooks/` lub `src/lib/`.
   - Zapewnij obsługę statusów HTTP i rzutowanie błędów z przyjaznymi komunikatami.
   - Wstrzyknij hook do `ApartmentForm`.

6. **Integracja z toastami (`sonner`):**
   - W `NewApartmentView`:
     - przy sukcesie: `toast.success('Mieszkanie zostało dodane')`
     - przy błędach globalnych: `toast.error(message)`

7. **Obsługa redirectu po sukcesie:**
   - W `onSuccess` (w `NewApartmentView`) wywołaj:
     - `window.location.href = '/dashboard';`

8. **Dodanie przycisku "Dodaj mieszkanie" na dashboardzie (jeśli nie istnieje):**
   - W widoku `/dashboard` zapewnij, że przycisk:
     - ma etykietę "Dodaj mieszkanie"
     - prowadzi do `/apartments/new`

9. **Testy manualne scenariuszy z US-015:**
   - Wejście z dashboardu na `/apartments/new` i poprawne dodanie mieszkania.
   - Sprawdzenie, że mieszkanie pojawia się na liście na `/dashboard`.
   - Sprawdzenie walidacji (za krótkie pola, puste pola).
   - Sprawdzenie zachowania przy błędach (symulacja 401, 403, 500).

10. **Ewentualne dopracowanie UX:**
    - Upewnij się, że formularz wygląda spójnie z krokiem 1 kreatora onboardingu.
    - Zadbaj o RWD (pełna szerokość pól na mobile, czytelny układ).
    - Sprawdź focus management (focus na pierwszym polu po wejściu na stronę, focus na pierwszym błędnym polu po nieudanym submitcie).


