## Plan implementacji widoku Dodawanie opłaty (`/charges/new`)

### 1. Przegląd

Widok **Dodawanie opłaty** służy właścicielowi do utworzenia nowej opłaty (czynsz / rachunek / inne) dla aktywnego najmu wybranego mieszkania. Formularz jest dostępny pod ścieżką `/charges/new?apartmentId=xxx`, działa w kontekście panelu właściciela (`DashboardLayout`) i po poprawnym zapisie tworzy rekord opłaty powiązany z aktywnym najmem mieszkania oraz opcjonalny załącznik przechowywany w Supabase Storage. Widok musi być spójny z istniejącą zakładką „Opłaty” w panelu mieszkania oraz spełniać wymagania walidacyjne z PRD, user stories (US-025, US-026) i API (Create Charge + Upload Charge Attachment).

### 2. Routing widoku

- **Ścieżka URL:** `/charges/new?apartmentId=xxx`
- **Typ renderowania:** SSR (`prerender = false`) – wymagane dane mieszkania do breadcrumbów oraz autoryzacja przez middleware.
- **Plik strony:** `src/pages/charges/new.astro`
- **Parametry wejściowe:**
  - **Query param:** `apartmentId: string` (UUID mieszkania, wymagany).
- **Logika na poziomie strony Astro:**
  - Walidacja obecności `apartmentId` – jeśli brak lub nieprawidłowy, redirect na `/dashboard` z toastem błędu (opcjonalnie `window.location.href` po stronie klienta).
  - SSR fetch do `GET /api/apartments/:id` (wewnętrznie przez `fetch('/api/apartments/${apartmentId}')` lub bezpośrednio Supabase w kontekście, zgodnie z istniejącym stylem) w celu:
    - potwierdzenia, że mieszkanie istnieje i użytkownik ma do niego dostęp,
    - pobrania nazwy mieszkania do breadcrumbów.
  - Obsługa błędów:
    - `404` → redirect na `/404` lub `/dashboard` z komunikatem „Mieszkanie nie zostało znalezione”.
    - `403` → redirect na `/403`.
    - `401` → middleware już przekierowuje na `/login`.
  - Przekazanie do wyspy React (`ChargeForm`) propsów:
    - `apartmentId: string`,
    - `apartmentName: string`.

### 3. Struktura komponentów

Wysokopoziomowe drzewo komponentów dla `/charges/new`:

```text
DashboardLayout.astro
  └── Header (Logo, Breadcrumbs, Menu użytkownika)
  └── Main
      ├── Breadcrumbs ("Dashboard > [Nazwa mieszkania] > Dodaj opłatę")
      ├── H1 + opis pomocniczy
      └── React Island: <ChargeForm apartmentId apName />
          ├── <Form> (Shadcn + React Hook Form)
          │   ├── FormInput (Kwota)
          │   ├── FormDatePicker (Data wymagalności)
          │   ├── FormSelect (Typ: Czynsz/Rachunek/Inne)
          │   ├── FormTextarea (Komentarz)
          │   └── FormFileUpload (Załącznik)
          └── Akcje formularza:
              ├── Button "Anuluj" (powrót do `/apartments/[id]`)
              └── Button "Zapisz opłatę"
```

Główne komponenty:

- **`DashboardLayout.astro`** – istniejący layout panelu zalogowanego użytkownika.
- **`Breadcrumbs`** – istniejący komponent breadcrumbów, zbudowany na bazie informacji o mieszkaniu.
- **`ChargeForm` (React)** – nowy komponent domenowy w `src/components/features/charges/charge-form.tsx`.
- **Komponenty formularza (re-używalne, już zdefiniowane w planie UI):**
  - `FormInput`, `FormDatePicker`, `FormSelect`, `FormTextarea`, `FormFileUpload` (z katalogu `src/components/ui` lub `src/components/features` – zgodnie z przyjętym podziałem).

### 4. Szczegóły komponentów

#### 4.1. `charges/new.astro` – strona widoku

- **Opis:**
  - Strona odpowiada za konfigurację layoutu, pobranie danych mieszkania i osadzenie Reactowej wyspy `ChargeForm`.
- **Główne elementy:**
  - Użycie `DashboardLayout.astro` jako layoutu.
  - Odczyt query param `apartmentId` z URL.
  - SSR fetch danych mieszkania (nazwa) do breadcrumbów.
  - Sekcja główna z nagłówkiem („Dodaj opłatę”) i opisem („Utwórz nową opłatę dla lokatora tego mieszkania”).
  - Wyspa React: `<ChargeForm apartmentId={apartmentId} apartmentName={apartmentName} />`.
- **Obsługiwane interakcje:**
  - Brak własnych interakcji formularzowych (delegowane do `ChargeForm`).
  - Możliwy przycisk/nawigacja „← Powrót” do `/apartments/[id]` umieszczony w nagłówku strony.
- **Walidacja:**
  - Na poziomie strony: sprawdzenie obecności `apartmentId`.
  - W przypadku błędów API na etapie SSR (brak mieszkania / brak uprawnień) – redirect na odpowiednią stronę błędów.
- **Typy (DTO/ViewModel):**
  - `ApartmentDetailsDTO` z `types.ts` – do walidacji odpowiedzi z `/api/apartments/:id`.
  - Lokalny typ `NewChargePageProps`:
    ```ts
    type NewChargePageProps = {
      apartmentId: string;
      apartmentName: string;
    };
    ```
- **Propsy:**
  - Strona Astro nie przyjmuje propsów z zewnątrz; sama wylicza dane i przekazuje je do `ChargeForm`.

#### 4.2. `ChargeForm` – komponent formularza opłaty

- **Opis:**
  - Reactowy formularz obsługujący tworzenie nowej opłaty oraz (opcjonalnie) upload jednego załącznika.
  - Odpowiada za UI, logikę walidacji po stronie klienta i komunikację z API `POST /api/apartments/:id/charges` oraz `POST /api/charges/:id/attachment`.
- **Główne elementy:**
  - `Form` z React Hook Form + Zod resolver.
  - Pola:
    - `Kwota (PLN)` – `FormInput` typu `number` lub `text` z odpowiednim patternem.
    - `Data wymagalności` – `FormDatePicker` (Calendar + Popover, zwracający datę ISO).
    - `Typ` – `FormSelect` z opcjami:
      - `rent` → „Czynsz”,
      - `bill` → „Rachunek”,
      - `other` → „Inne”.
    - `Komentarz` – `FormTextarea` z licznikiem znaków (max 300).
    - `Załącznik` – `FormFileUpload` z podglądem (nazwa pliku, ikona typu, przycisk „Usuń”).
  - Sekcja przycisków:
    - `Anuluj` – link/przycisk do `/apartments/[apartmentId]`.
    - `Zapisz opłatę` – przycisk `type="submit"` z loading state.
- **Obsługiwane interakcje:**
  - Zmiana wartości pól formularza (onChange).
  - Wybór daty z date pickera.
  - Wybór typu opłaty z selecta.
  - Wpisywanie komentarza (zliczanie znaków).
  - Wybór pliku w `FormFileUpload` (przekazanie pojedynczego `File` do stanu formularza).
  - Usunięcie wybranego pliku (reset pola załącznika).
  - **Submit formularza:**
    - Walidacja po stronie klienta (Zod + RHF).
    - Jeśli walidacja OK:
      1. Wywołanie `POST /api/apartments/:apartmentId/charges` z JSON body (bez pliku).
      2. Jeśli odpowiedź `201` i w formularzu jest plik:
         - Wywołanie `POST /api/charges/:chargeId/attachment` z `FormData` zawierającą `file`.
      3. Po sukcesie:
         - toast: „Opłata została dodana”,
         - redirect na `/apartments/[apartmentId]`.
    - W przypadku błędów:
      - mapowanie błędów walidacyjnych 400 na pola formularza,
      - inne błędy jako toast globalny.
- **Warunki walidacji (klient):**
  - `amount`:
    - wymagane,
    - liczba > 0,
    - maksymalnie 2 miejsca po przecinku (np. Zod: `z.number().positive().multipleOf(0.01)` lub parser z regexem i konwersją).
  - `due_date`:
    - wymagane,
    - poprawna data (akceptowana przez API jako ISO 8601).
  - `type`:
    - wymagane,
    - jedna z wartości: `rent | bill | other`.
  - `comment`:
    - opcjonalne,
    - maks. 300 znaków.
  - `attachment` (plik):
    - maksymalnie 1 plik,
    - dozwolone typy MIME: `application/pdf`, `image/jpeg`, `image/png` (zgodnie z `file-validation.ts`),
    - maksymalny rozmiar: 5MB,
    - walidacja wykonywana **lokalnie** przez `validateAttachmentFile`.
- **Typy (DTO i ViewModel):**
  - **DTO/commands (z `types.ts`):**
    - `CreateChargeCommand` – baza request body:
      - `amount: number`,
      - `due_date: string` (ISO),
      - `type: 'rent' | 'bill' | 'other'`,
      - `comment?: string`.
    - `UploadChargeAttachmentResponseDTO`:
      - `id: string`,
      - `attachment_path: string | null`,
      - `attachment_url: string`.
  - **View model formularza:**
    ```ts
    type ChargeFormValues = {
      amount: string;           // wartość wprowadzona w polu, parsowana do number przed wysłaniem
      dueDate: string;          // ISO lub format akceptowany przez backend
      type: 'rent' | 'bill' | 'other' | ''; // '' na start dla pustego selecta
      comment: string;
      attachment: File | null;  // pojedynczy plik, nie wysyłany w JSON
    };
    ```
  - **Typ propsów komponentu:**
    ```ts
    interface ChargeFormProps {
      apartmentId: string;
      apartmentName: string;
    }
    ```
- **Propsy:**
  - `apartmentId` – identyfikator mieszkania potrzebny do żądania `POST /api/apartments/:id/charges` oraz do redirectu.
  - `apartmentName` – używany w nagłówku formularza lub podtytule („Dodajesz opłatę dla: [Nazwa]”).

### 5. Typy

- **Istniejące typy z `types.ts` (do wykorzystania):**
  - **`CreateChargeCommand`** – typ requestu do `POST /api/apartments/:apartmentId/charges`:
    - `amount: number`,
    - `due_date: string`,
    - `type: 'rent' | 'bill' | 'other'`,
    - `comment?: string`.
  - **`UploadChargeAttachmentResponseDTO`** – odpowiedź po uploadzie załącznika:
    - `id: string`,
    - `attachment_path: string | null`,
    - `attachment_url: string`.
- **Nowy view model formularza: `ChargeFormValues`** (opisany w sekcji 4.2):
  - Podział na typy wejściowe użytkownika (`string`, `File`) i typy używane w API (`number`, `string` ISO).
  - Warstwa mapowania:
    - `amount` (string) → `amount` (number) z kontrolą formatu,
    - `dueDate` (string/Date) → `due_date` (string ISO),
    - `type` (select) → `type` (enum API),
    - `comment` (string) tylko jeśli niepuste.
- **Typ danych do API attachmentu:**
  - Nie wymaga nowego TypeScriptowego typu poza użyciem `FormData`, ale w kodzie można wprowadzić pomocniczy typ:
    ```ts
    type ChargeAttachmentUploadPayload = {
      file: File;
    };
    ```
- **Typ danych do breadcrumbów:**
  - Można użyć `Pick<ApartmentDetailsDTO, 'id' | 'name'>` dla przejrzystości w warstwie SSR.

### 6. Zarządzanie stanem

- **Poziom lokalny (React w `ChargeForm`):**
  - Stan formularza zarządzany przez React Hook Form:
    - wartości pól (`ChargeFormValues`),
    - błędy walidacji (mapowane z Zod + ewentualnie z API),
    - status submitu (`isSubmitting`).
  - Dodatkowe flagi:
    - `isUploadingAttachment: boolean` – jeśli upload wykonywany jest po utworzeniu opłaty.
    - `apiError: string | null` – ogólny błąd dla toastów lub inline alertu.
- **Custom hook (opcjonalny, rekomendowany): `useCreateCharge`**
  - Lokalizacja: `src/components/hooks/use-create-charge.ts` (nowy plik).
  - Cel:
    - kapsułowanie logiki komunikacji z API i obsługi błędów dla tworzenia opłaty i uploadu załącznika,
    - uproszczenie komponentu `ChargeForm`.
  - API hooka:
    ```ts
    interface UseCreateChargeResult {
      isSubmitting: boolean;
      createCharge: (values: ChargeFormValues) => Promise<void>;
    }
    ```
  - Wewnątrz:
    - `fetch('/api/apartments/${apartmentId}/charges', { method: 'POST', body: JSON.stringify(command) })`,
    - po sukcesie i obecności załącznika:
      - `fetch('/api/charges/${chargeId}/attachment', { method: 'POST', body: formData })`,
    - mapowanie odpowiedzi błędów na wyjątki z komunikatami po polsku.
- **Brak globalnego stanu:**
  - Widok tworzy pojedynczy zasób, nie wymaga współdzielenia stanu między wyspami.
  - Po zakończeniu akcji wykonywany jest redirect na `/apartments/[id]`, gdzie dane i tak są refetchowane.

### 7. Integracja API

- **Tworzenie opłaty – `POST /api/apartments/:apartmentId/charges`**
  - **Request:**
    - Metoda: `POST`.
    - Nagłówki:
      - `Content-Type: application/json`,
      - `Authorization: Bearer <jwt>` (dodawany przez `getAuthHeaders` lub middleware).
    - Body (`CreateChargeCommand`):
      ```json
      {
        "amount": 2000.00,
        "due_date": "2025-02-10",
        "type": "rent",
        "comment": "Czynsz za luty 2025"
      }
      ```
  - **Odpowiedź sukcesu (`201`):**
    - JSON zawierający szczegóły utworzonej opłaty (w tym `id`, `lease_id`, `payment_status`, itp.).
    - UI głównie potrzebuje `id` nowej opłaty do ewentualnej dalszej nawigacji / uploadu załącznika.
  - **Błędy:**
    - `400 Validation Error` – walidacja danych (np. kwota ≤ 0, zły format daty); należy odczytać `details` i przypisać do konkretnych pól.
    - `404 Not Found` – brak aktywnego najmu dla mieszkania („Brak aktywnego najmu dla tego mieszkania”) – należy pokazać komunikat i uniemożliwić dalsze dodawanie (np. disable submit + link powrotny do mieszkania).
    - `401/403` – obsłużone standardowo: toast + ewentualny redirect (401 → `/login`, 403 → `/403`).
- **Upload załącznika – `POST /api/charges/:id/attachment`**
  - **Request:**
    - Metoda: `POST`.
    - Nagłówki:
      - `Authorization: Bearer <jwt>`,
      - **brak** `Content-Type` – ustawiany automatycznie przez `fetch` przy użyciu `FormData`.
    - Body: `FormData` z jednym polem `file` (`File` z formularza).
  - **Odpowiedź sukcesu (`200`):**
    - JSON z `UploadChargeAttachmentResponseDTO` (zawiera `attachment_url`).
    - UI nie musi nic z tym dalej robić poza ewentualną aktualizacją stanu / potwierdzeniem sukcesu.
  - **Błędy:**
    - `400 Validation Error` – nieprawidłowy format pliku (`"Nieprawidłowy format pliku. Dozwolone: PDF, JPG, PNG"`).
    - `413 Payload Too Large` – plik > 5MB (`"Rozmiar pliku nie może przekraczać 5MB"`).
    - Obsługa na UI:
      - toast z treścią komunikatu,
      - zachowanie formularza (bez redirectu), możliwość ponownego wyboru pliku.
- **Nagłówki autoryzacji:**
  - Wzorować się na `useApartmentCharges` – użyć `getAuthHeaders()` z `src/lib/utils/auth.ts`.

### 8. Interakcje użytkownika

- **Wejście na stronę `/charges/new?apartmentId=xxx`:**
  - Użytkownik (właściciel) przechodzi z zakładki „Opłaty” przyciskiem „Dodaj opłatę”.
  - Widzi breadcrumb „Dashboard > [Nazwa mieszkania] > Dodaj opłatę”, nagłówek „Dodaj opłatę” oraz pusty formularz.
- **Wypełnianie formularza:**
  - Użytkownik wpisuje kwotę, wybiera datę wymagalności i typ opłaty.
  - Opcjonalnie wpisuje komentarz (pole z licznikiem znaków).
  - Opcjonalnie dodaje załącznik:
    - po wybraniu pliku widzi nazwę pliku, ikonę typu (np. PDF vs obraz) i przycisk „Usuń”.
- **Zmiana / usunięcie pliku:**
  - Kliknięcie „Usuń” czyści pole pliku i pozwala wybrać inny załącznik.
- **Submit formularza:**
  - Kliknięcie „Zapisz opłatę”:
    - przy zablokowanym klienckim formularzu (walidacja inline) przycisk jest disabled dopóki są błędy,
    - po akceptacji walidacji:
      - przycisk przechodzi w stan `loading` („Zapisywanie…”),
      - pola formularza są disabled.
  - **Na sukces:**
    - toast: „Opłata została dodana”,
    - redirect na `/apartments/[apartmentId]` (zakładka „Opłaty”), gdzie nowa opłata jest widoczna.
- **Błędne dane:**
  - Inline błędy pod polami:
    - np. „Kwota musi być większa od 0”, „To pole jest wymagane”, „Komentarz może mieć maksymalnie 300 znaków”.
  - W przypadku odpowiedzi 400 z API, błędy są odwzorowywane na konkretne pola (np. `amount`).
- **Błędny plik:**
  - W przypadku niewłaściwego typu / rozmiaru pliku:
    - natychmiastowa walidacja po stronie klienta (bez requestu) z komunikatem z `FILE_VALIDATION_ERROR_MESSAGES`,
    - jeżeli błąd zostanie zwrócony przez API – toast z komunikatem.
- **Anulowanie:**
  - Kliknięcie „Anuluj” przenosi użytkownika z powrotem do `/apartments/[apartmentId]` bez wysyłania formularza.

### 9. Warunki i walidacja

- **Walidacja po stronie klienta (Zod + React Hook Form):**
  - Odzwierciedla dokładnie zasady z API planu (sekcja Create Charge) oraz z PRD:
    - kwota > 0 i max 2 miejsca po przecinku,
    - data wymagalności i typ są wymagane,
    - komentarz maks. 300 znaków,
    - załącznik – 1 plik, typ PDF/JPG/PNG, max 5MB.
  - Komunikaty błędów po polsku, zgodne z UX z PRD (US-007).
- **Walidacja po stronie API (serwer):**
  - `amount`, `due_date`, `type`, `comment` zgodne z `CreateChargeCommand` / Zod schematem w backendzie.
  - UI musi umieć:
    - zmapować `Validation Error` z `details` na pola formularza,
    - w przypadku `Not Found` (brak aktywnego najmu) wyświetlić odpowiedni komunikat i przestać próbować ponawiania submission (to nie jest błąd formularza, tylko stanu biznesowego).
- **Warunki kontekstowe:**
  - **Aktywny najem:** wymóg istnienia aktywnego najmu dla mieszkania (API zwróci 404 w przeciwnym razie) – UI może pokazać komunikat „Brak aktywnego najmu dla tego mieszkania. Nie można dodać opłaty.”.
  - **Rola użytkownika:** endpoint dostępny tylko dla właściciela – 403 → redirect / toast „Tylko właściciele mogą dodawać opłaty”.

### 10. Obsługa błędów

- **Błędy walidacji formularza (klient):**
  - Wyświetlane inline pod odpowiednimi polami, `aria-invalid="true"`, komunikaty w języku polskim.
- **Błędy walidacji API (400):**
  - Jeśli response zawiera `details` per pole – przypisanie do pól przez `setError`.
  - Jeśli to ogólny `Bad Request` (np. typ biznesowy), pokazanie toastu z `message`.
- **Brak aktywnego najmu (`404` z komunikatem „Brak aktywnego najmu dla tego mieszkania”):**
  - Wyświetlenie bloku błędu nad formularzem / zamiast formularza (np. `Alert`):
    - „Brak aktywnego najmu dla tego mieszkania. Nie można dodać opłaty.”
  - Ukrycie lub zablokowanie przycisku „Zapisz opłatę”.
- **Błędy uploadu pliku (`400`, `413`):**
  - Toast z odpowiednim komunikatem z API.
  - Zresetowanie pola pliku (aby wymusić ponowny wybór).
- **Błędy autoryzacji:**
  - `401 Unauthorized` – komunikat „Sesja wygasła. Zaloguj się ponownie.” + redirect na `/login?redirect=/charges/new?apartmentId=...`.
  - `403 Forbidden` – redirect na `/403` lub toast „Nie masz uprawnień do dodawania opłat”.
- **Błędy serwera (`500`):**
  - Toast: „Wystąpił błąd serwera. Spróbuj ponownie lub skontaktuj się z pomocą (pomoc@rentflow.pl)”.
  - Formularz pozostaje wypełniony (brak resetu pól), aby użytkownik nie tracił danych.

### 11. Kroki implementacji

1. **Routing i szkielet strony**
   - Utwórz plik `src/pages/charges/new.astro` z `export const prerender = false`.
   - Wczytaj `apartmentId` z query params i wykonaj SSR fetch do `/api/apartments/:id` w celu pobrania nazwy mieszkania.
   - Osadź stronę w `DashboardLayout.astro` i skonfiguruj breadcrumb „Dashboard > [Nazwa mieszkania] > Dodaj opłatę”.
   - Dodaj nagłówek strony oraz opis.
2. **Definicja typów view modelu**
   - W pliku Reactowym (np. w `charge-form.tsx`) zdefiniuj typ `ChargeFormValues` oraz interfejs `ChargeFormProps`.
   - Upewnij się, że importujesz `CreateChargeCommand` i `UploadChargeAttachmentResponseDTO` z `types.ts`.
3. **Implementacja komponentu `ChargeForm`**
   - Utwórz plik `src/components/features/charges/charge-form.tsx`.
   - Skonfiguruj React Hook Form z domyślnymi wartościami (`amount: ''`, `dueDate: ''`, `type: ''`, `comment: ''`, `attachment: null`).
   - Zdefiniuj Zod schema odzwierciedlające walidację formularza (kwota > 0, 2 miejsca po przecinku, itd.) i podepnij przez `zodResolver`.
   - Użyj re-używalnych komponentów formularza (`FormInput`, `FormDatePicker`, `FormSelect`, `FormTextarea`, `FormFileUpload`).
4. **Walidacja załącznika po stronie klienta**
   - Użyj `validateAttachmentFile` z `src/lib/utils/file-validation.ts` podczas obsługi wyboru pliku.
   - W przypadku błędu pokaż user-friendly komunikat z `FILE_VALIDATION_ERROR_MESSAGES` i nie zapisuj pliku w stanie formularza.
5. **Integracja z API – tworzenie opłaty**
   - W handlerze `onSubmit` (lub hooku `useCreateCharge`) zaimplementuj:
     - rzutowanie `ChargeFormValues` na `CreateChargeCommand`,
     - wywołanie `fetch('/api/apartments/${apartmentId}/charges', { method: 'POST', ... })`,
     - obsługę statusów 201, 400, 404, 401, 403, 500.
   - Zaimportuj `getAuthHeaders()` i użyj go do ustawienia nagłówków autoryzacji.
6. **Integracja z API – upload załącznika**
   - Po sukcesie utworzenia opłaty i obecności pliku:
     - zbuduj `FormData`, dodaj `file`,
     - wywołaj `POST /api/charges/:id/attachment`,
     - obsłuż ewentualne błędy 400/413 za pomocą toastów.
7. **Nawigacja po sukcesie**
   - Po zakończonym sukcesem (opłata + ewentualny załącznik) wyświetl toast „Opłata została dodana”.
   - Wykonaj redirect na `/apartments/[apartmentId]` (np. `window.location.href` albo mechanizmem nawigacji, którego używa projekt).
8. **Obsługa edge-case’ów**
   - Zaimplementuj w `ChargeForm` obsługę scenariusza `Brak aktywnego najmu dla tego mieszkania` (404 z API):
     - pokaż komunikat,
     - dezaktywuj przycisk „Zapisz”.
   - Dodaj obsługę błędów sesji (np. podobnie jak w `useApartmentCharges` – redirect na login przy 401).
9. **Dopasowanie do istniejącej stylistyki UI**
   - Użyj Tailwind CSS według istniejących wzorców (spacing, kolory, dark mode).
   - Zadbaj o RWD (formularz w jednej kolumnie, `w-full` na inputach i przyciskach).
   - Zapewnij focus states, `aria-*` dla błędów i przycisków zgodnie z wytycznymi WCAG.
10. **Testy manualne przepływu US-025/US-026**
    - Scenariusz pozytywny: dodanie poprawnej opłaty bez i z załącznikiem.
    - Scenariusz błędny: kwota 0 lub ujemna, brak daty, brak typu, komentarz > 300 znaków.
    - Scenariusz błędny pliku: zły format (`.docx`), zbyt duży plik (> 5MB).
    - Scenariusz `Brak aktywnego najmu` (jeśli da się go łatwo zasymulować w środowisku deweloperskim).
11. **Refaktoryzacja i dopracowanie UX**
    - Po upewnieniu się, że przepływ działa, ewentualnie wydziel hook `useCreateCharge`, jeśli logika w `ChargeForm` zaczyna być rozbudowana.
    - Upewnij się, że komunikaty błędów, teksty przycisków i nagłówki są spójne językowo z resztą aplikacji (PL, ton formalny, zgodny z PRD).


