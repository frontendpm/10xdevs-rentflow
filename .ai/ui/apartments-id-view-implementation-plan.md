## Plan implementacji widoku Szczegóły mieszkania (`/apartments/[id]`)

## 1. Przegląd

Widok `/apartments/[id]` służy jako główny panel zarządzania pojedynczym mieszkaniem dla właściciela oraz widok read‑only dla lokatora. Zawiera zakładki: **Opłaty** (domyślna), **Protokół Odbioru**, **Protokół Zwrotu** oraz **Ustawienia** (tylko właściciel), integruje się z wieloma endpointami (`GET /api/apartments/:id`, opłaty, protokoły, najem, zaproszenia) i musi poprawnie reagować na rolę użytkownika (owner vs tenant). Widok powinien zapewniać spójne UX z resztą panelu (layout `DashboardLayout.astro`, breadcrumbs, tabs Shadcn/ui), pełną responsywność (mobile‑first, zakładki scrollowalne) oraz bezpieczną obsługę operacji biznesowych (edycja, zakończenie najmu, usunięcie mieszkania) zgodnie z ograniczeniami API i RLS.

## 2. Routing widoku

- **Ścieżka URL:** `/apartments/[id]`
- **Rodzaj renderowania:** SSR (strona Astro z `prerender = false`)
- **Plik strony:** `src/pages/apartments/[id].astro`
- **Layout:** `DashboardLayout.astro`
  - Header: Logo (link do `/dashboard`), `Breadcrumbs`, menu użytkownika
  - Footer: linki prawne + `pomoc@rentflow.pl`
- **Dostępność / autoryzacja:**
  - Route chroniona przez middleware (`src/middleware/index.ts`) – wymaga zalogowanego użytkownika.
  - Dostęp otrzymują:
    - Właściciel mieszkania (rola `owner`)
    - Lokator aktywnego najmu dla tego mieszkania (rola `tenant`)
  - Próba wejścia bez uprawnień → redirect / widok błędu (`/403` lub toast + redirect zgodnie z globalnym wzorcem).
- **Obsługa zakładek przez hash w URL:**
  - Domyślny widok (bez hash): zakładka **Opłaty** → `/apartments/[id]`
  - `#protokol-odbioru` → zakładka **Protokół Odbioru**
  - `#protokol-zwrotu` → zakładka **Protokół Zwrotu**
  - `#ustawienia` → zakładka **Ustawienia** (tylko właściciel; hash ignorowany dla lokatora).

## 3. Struktura komponentów

Logiczne drzewo komponentów dla widoku (pomijając globalny layout i komponenty już opisane w `ui-plan.md`):

- `DashboardLayout.astro`
  - `Header` (React / Astro)
    - `Logo` (link do `/dashboard`)
    - `Breadcrumbs` (React)
    - `UserMenu` (Dropdown, wylogowanie itd.)
  - `Main`
    - `ApartmentDetailsPage` (część w `src/pages/apartments/[id].astro`)
      - Nagłówek strony (`h1` z nazwą mieszkania, ewentualnie adresem)
      - React island: `ApartmentDetailsView`
        - `Tabs` (Shadcn/ui)
          - `TabsList` (scrollowalne na mobile)
            - `TabsTrigger` "Opłaty"
            - `TabsTrigger` "Protokół Odbioru"
            - `TabsTrigger` "Protokół Zwrotu"
            - `TabsTrigger` "Ustawienia" (renderowane tylko dla roli `owner`)
          - `TabsContent` `"charges"`
            - `ApartmentChargesTab`
              - `ChargeList` (owner / tenant; `readOnly` w zależności od roli)
                - `ChargeCard`
                - `ChargeStatusBadge`
              - `EmptyState` dla braku opłat
              - Przycisk "Dodaj opłatę" (owner → link do `/charges/new?apartmentId=...`)
          - `TabsContent` `"protocol-move-in"`
            - `ApartmentProtocolTab` (`type="move_in"`)
              - Owner: `ProtocolForm` + `ProtocolPhotoGallery`
              - Tenant: `ProtocolView` + `ProtocolPhotoGallery` (read‑only)
          - `TabsContent` `"protocol-move-out"`
            - `ApartmentProtocolTab` (`type="move_out"`)
          - `TabsContent` `"settings"` (tylko owner)
            - `ApartmentSettingsTab`
              - Sekcja "Edycja mieszkania" → `ApartmentForm` (tryb `edit`)
              - Sekcja "Lokator"
                - `ActiveTenantSummary` (imię, email) lub komunikat "Brak lokatora"
                - Przycisk "Zaproś lokatora" → `InvitationLinkGenerator`
                - Przycisk "Zakończ najem" (`AlertDialog` potwierdzający)
              - Sekcja "Historia najemców" → `LeaseHistory`
              - Sekcja "Usuń mieszkanie" → `AlertDialog` + przycisk destructive (disabled przy istniejących najmów).
  - `Footer`

## 4. Szczegóły komponentów

### ApartmentDetailsPage (Astro – `src/pages/apartments/[id].astro`)

- **Opis komponentu:**  
  Serwerowa strona Astro odpowiedzialna za:
  - odczyt parametru `id` z URL,
  - pobranie podstawowych danych mieszkania (`GET /api/apartments/:id` lub bezpośrednio z Supabase),
  - określenie roli użytkownika (`owner` / `tenant`) na podstawie `UserContext` / `context.locals.user`,
  - skonfigurowanie breadcrumbs i wstrzyknięcie danych początkowych do React island (`ApartmentDetailsView`).

- **Główne elementy:**
  - Import `DashboardLayout.astro` i osadzenie zawartości w `layout`.
  - Kod serwerowy (frontmatter Astro) pobierający:
    - `apartmentDetails: ApartmentDetailsDTO`
    - ewentualnie `activeLease: ActiveLeaseDTO | null` (np. do wyświetlenia w nagłówku / breadcrumbs)
  - Komponent `Breadcrumbs` z elementami:
    - `{ label: 'Dashboard', href: '/dashboard' }`
    - `{ label: apartmentDetails.name }`
  - Tytuł strony (`h1`): nazwa mieszkania + ewentualnie krótki opis/adres.
  - React island:
    - `<ApartmentDetailsView apartmentId={id} initialApartment={apartmentDetails} role={role} />`

- **Obsługiwane interakcje:**
  - Brak interakcji po stronie klienta – tylko SSR + przekazanie propsów do React.
  - Obsługa błędów SSR:
    - 404 z API → render dedykowanego widoku "Mieszkanie nie zostało znalezione" + link do `/dashboard` lub redirect do `/404`.
    - 403 / brak uprawnień → redirect do `/403`.

- **Walidacja / warunki:**
  - Walidacja parametru `id` (UUID) po stronie serwera:
    - jeśli `id` nie jest poprawnym UUID → szybki redirect na `/404`.

- **Typy:**
  - `ApartmentDetailsPageProps` (wewnętrzny typ w pliku .astro):
    ```ts
    type ApartmentDetailsPageProps = {
      apartmentId: string;
      initialApartment: ApartmentDetailsDTO;
      role: 'owner' | 'tenant';
    };
    ```

- **Propsy:**  
  Strona Astro nie przyjmuje propsów z zewnątrz (routingowy entrypoint), ale przekazuje powyższe dane do `ApartmentDetailsView`.

---

### ApartmentDetailsView (React – `src/components/features/apartments/apartment-details-view.tsx`)

- **Opis komponentu:**  
  Główny komponent React dla widoku `/apartments/[id]`. Odpowiada za:
  - zarządzanie zakładkami z użyciem Shadcn `Tabs`,
  - synchronizację aktywnej zakładki z hashem w URL,
  - przekazywanie `apartmentId`, `role` oraz danych początkowych do zakładek,
  - wyświetlenie stanów ładowania / błędów dla danych, które muszą być dociągnięte po stronie klienta (np. opłaty, protokoły, historia najmu).

- **Główne elementy:**
  - Nagłówek sekcji (opcjonalny): nazwa mieszkania, adres, status lokatora / skrócone podsumowanie finansowe (jeżeli dostępne z `ApartmentSummaryDTO`).
  - Shadcn `Tabs`:
    - `TabsList` (scrollowalne na mobile, `overflow-x-auto`).
    - `TabsTrigger` dla:
      - `"charges"` – "Opłaty"
      - `"protocol-move-in"` – "Protokół Odbioru"
      - `"protocol-move-out"` – "Protokół Zwrotu"
      - `"settings"` – "Ustawienia" (tylko właściciel).
    - `TabsContent` renderujące tab‑specyficzne komponenty (`ApartmentChargesTab`, `ApartmentProtocolTab`, `ApartmentSettingsTab`).

- **Obsługiwane interakcje:**
  - Zmiana aktywnej zakładki:
    - aktualizacja stanu lokalnego (`activeTab`),
    - aktualizacja hash w URL (`window.location.hash = ...`) bez przeładowania,
    - lazy‑loading danych zakładki (np. pierwsze wejście do protokołów uruchamia `fetch`).
  - Odczyt hash z URL na mount:
    - `#protokol-odbioru` → aktywuje `"protocol-move-in"`,
    - `#protokol-zwrotu` → `"protocol-move-out"`,
    - `#ustawienia` → `"settings"` (jeśli role = owner, inaczej ignorowane),
    - brak / nieznany hash → `"charges"`.

- **Obsługiwana walidacja:**
  - Walidacja hash / nazwy zakładki – niepoprawne wartości są mapowane do zakładki domyślnej.

- **Typy:**
  ```ts
  type ApartmentDetailsViewProps = {
    apartmentId: string;
    initialApartment: ApartmentDetailsDTO;
    role: 'owner' | 'tenant';
  };

  type ApartmentTabId = 'charges' | 'protocol-move-in' | 'protocol-move-out' | 'settings';
  ```

- **Propsy:**
  - `apartmentId: string` – UUID mieszkania z URL.
  - `initialApartment: ApartmentDetailsDTO` – dane mieszkania wczytane na serwerze.
  - `role: 'owner' | 'tenant'` – używana do warunkowego renderowania zakładek i trybów read‑only.

---

### ApartmentChargesTab (React – np. `src/components/features/apartments/apartment-charges-tab.tsx`)

- **Opis komponentu:**  
  Kontener dla zakładki **Opłaty** w panelu mieszkania. Odpowiada za:
  - pobranie listy opłat z endpointu `GET /api/apartments/:id/charges`,
  - przekazanie danych do `ChargeList`,
  - renderowanie CTA "Dodaj opłatę" (owner only) oraz pustych stanów.

- **Główne elementy:**
  - Nagłówek sekcji (opcjonalny) + krótki opis.
  - `ChargeList`:
    - grupowanie po miesiącach,
    - `ChargeCard` z informacjami o opłacie i statusie,
    - `ChargeStatusBadge`.
  - CTA:
    - Owner: przycisk `"Dodaj opłatę"` → link do `/charges/new?apartmentId={apartmentId}`.
    - Tenant: brak przycisku, tylko lista (read‑only).
  - `EmptyState`:
    - Owner: "Brak dodanych opłat" + przycisk "Dodaj pierwszą opłatę".
    - Tenant: "Właściciel nie dodał jeszcze żadnych opłat".

- **Obsługiwane interakcje:**
  - **Ładowanie danych:**
    - `useApartmentCharges(apartmentId)` (custom hook) wywołujący `GET /api/apartments/:id/charges`.
    - Pokazanie spinnera / stanu ładowania.
  - **Kliknięcie na opłatę:**
    - Owner i Tenant: redirect do `/charges/[id]` (owner – widok edycji/zarządzania, tenant – read‑only).
  - **CTA "Dodaj opłatę":**
    - Owner: redirect do `/charges/new?apartmentId=...`.

- **Walidacja / warunki:**
  - Widok zakładki sam nie waliduje danych domenowych – zakłada, że statusy i pola (kwota, daty) są poprawne po stronie API.
  - Warunek roli:
    - jeśli `role === 'tenant'`, CTA nie jest renderowane, a `ChargeList` dostaje `readOnly = true`.

- **Typy:**
  ```ts
  type ApartmentChargesTabProps = {
    apartmentId: string;
    role: 'owner' | 'tenant';
    initialChargesByMonth?: ChargesListDTO['charges_by_month'];
  };
  ```

- **Propsy:**
  - `apartmentId` – identyfikator mieszkania (wymagany).
  - `role` – decyduje o możliwości dodawania opłat.
  - `initialChargesByMonth?` – opcjonalne dane SSR (dla ewentualnego prefetchu; w MVP można ładować tylko po stronie klienta).

---

### ApartmentProtocolTab (React – `src/components/features/apartments/apartment-protocol-tab.tsx`)

- **Opis komponentu:**  
  Reużywalny kontener dla zakładek **Protokół Odbioru** i **Protokół Zwrotu**. Parametryzowany typem protokołu (`move_in` / `move_out`), odpowiada za:
  - pobranie protokołu z API,
  - renderowanie formularza edycji (owner) lub widoku read‑only (tenant),
  - integrację z uploadem / usuwaniem zdjęć.

- **Główne elementy:**
  - Nagłówek sekcji ("Protokół Odbioru" / "Protokół Zwrotu").
  - Owner:
    - `ProtocolForm` (textarea + przyciski zapisu).
    - `ProtocolPhotoGallery` z możliwością dodawania i usuwania zdjęć.
  - Tenant:
    - `ProtocolView` (tekst read‑only).
    - `ProtocolPhotoGallery` (read‑only, tylko otwieranie zdjęć).
  - Komunikaty pustego stanu:
    - Owner (pusty protokół): od razu pokazujemy formularz (textarea + "Dodaj zdjęcia").
    - Tenant (brak protokołu): komunikat "Protokół nie został jeszcze uzupełniony".

- **Obsługiwane interakcje:**
  - **Ładowanie protokołu:**
    - `useProtocol(apartmentId, type)` → `GET /api/apartments/:id/protocols/:type`.
  - **Edycja treści (owner):**
    - OnChange textarea → lokalny stan + debounce `PUT /api/apartments/:id/protocols/:type` lub ręczny przycisk "Zapisz".
  - **Dodawanie zdjęć (owner):**
    - `POST /api/apartments/:id/protocols/:type/photos` (multipart/form‑data).
    - Po sukcesie: refetch listy zdjęć + toast "Zdjęcie zostało dodane".
  - **Usuwanie zdjęcia (owner):**
    - `DELETE /api/apartments/:id/protocols/:type/photos/:photoId`.
    - Potwierdzenie inline (np. prosty `confirm` lub drobny dialog).
  - **Oglądanie zdjęć:**
    - Kliknięcie miniatury → otwarcie zdjęcia w nowej karcie (`target="_blank"`).

- **Walidacja / warunki:**
  - Opis protokołu:
    - `description`: wymagany, `string` (walidacja głównie po stronie API; na froncie można blokować wysyłkę pustego stringa).
  - Zdjęcia:
    - Max 10 zdjęć na protokół (limit egzekwowany w DB; UI:
      - przy liczbie 10 → disable przycisku "Dodaj zdjęcia" + tooltip).
    - Typ pliku: JPG / PNG.
    - Rozmiar pliku: max 5MB.
  - Rola:
    - `role === 'tenant'` → wszystkie akcje edycji/ uploadu/ usuwania są ukryte, tylko odczyt.

- **Typy:**
  ```ts
  type ApartmentProtocolTabProps = {
    apartmentId: string;
    type: 'move_in' | 'move_out';
    role: 'owner' | 'tenant';
    initialProtocol?: ProtocolDTO | null;
  };
  ```

- **Propsy:**
  - `apartmentId` – identyfikator mieszkania.
  - `type` – `"move_in"` (Protokół Odbioru) lub `"move_out"` (Protokół Zwrotu).
  - `role` – kontroluje tryb edycji vs read‑only.
  - `initialProtocol?` – opcjonalny SSR‑prefetch protokołu (np. `null` dla braku).

---

### ApartmentSettingsTab (React – `src/components/features/apartments/apartment-settings-tab.tsx`)

- **Opis komponentu:**  
  Zakładka **Ustawienia** skupiająca wszystkie operacje administracyjne na mieszkaniu:
  - edycja nazwy i adresu mieszkania,
  - zarządzanie lokatorem (status, generowanie linku, zakończenie najmu),
  - podgląd historii najmów,
  - usunięcie mieszkania (zabezpieczone warunkami biznesowymi).

- **Główne elementy:**
  - Sekcja "Dane mieszkania":
    - `ApartmentForm` (tryb `edit`) z polami:
      - `name` (Nazwa mieszkania),
      - `address` (Adres).
    - Przycisk "Zapisz zmiany".
  - Sekcja "Lokator":
    - Jeśli brak aktywnego najmu:
      - komunikat "Brak aktywnego lokatora",
      - `InvitationLinkGenerator` z przyciskiem "Zaproś lokatora".
    - Jeśli jest aktywny najem:
      - wyświetlenie imienia i emaila lokatora (`ActiveLeaseDTO.tenant`),
      - przycisk "Zakończ najem" (`AlertDialog` potwierdzający).
  - Sekcja "Historia najemców":
    - `LeaseHistory` – lista archiwalnych i aktywnych najmów (read‑only).
  - Sekcja "Usuń mieszkanie":
    - przycisk destructive "Usuń mieszkanie",
    - disabled jeśli mieszkanie ma jakiekolwiek najmy (aktywne lub archiwalne),
    - tooltip / komunikat wyjaśniający ograniczenie.

- **Obsługiwane interakcje:**
  - **Edycja mieszkania:**
    - Submit `ApartmentForm`:
      - `PATCH /api/apartments/:id` z `UpdateApartmentCommand`.
      - Po sukcesie: toast "Dane mieszkania zostały zaktualizowane" + ewentualny refetch szczegółów (dla breadcrumbs i innych widoków).
  - **Generowanie linku zapraszającego:**
    - `InvitationLinkGenerator`:
      - `POST /api/apartments/:id/invitations`.
      - Wyświetlenie wygenerowanego linku + przycisk "Kopiuj".
      - Obsługa błędu 400: "To mieszkanie ma już aktywnego lokatora".
  - **Zakończenie najmu:**
    - `AlertDialog` → `POST /api/apartments/:id/lease/end`.
    - Po sukcesie:
      - toast "Najem został zakończony",
      - refetch `ActiveLeaseDTO` i `LeaseHistoryDTO`,
      - sekcja "Lokator" przechodzi w stan "Brak lokatora".
  - **Usunięcie mieszkania:**
    - `AlertDialog` z ostrzeżeniem: "Czy na pewno chcesz trwale usunąć [Nazwa]? Tej operacji nie można cofnąć."
    - `DELETE /api/apartments/:id`.
    - Po sukcesie: redirect do `/dashboard` + toast "Mieszkanie zostało usunięte".

- **Walidacja / warunki:**
  - Dane mieszkania:
    - `name`: opcjonalne, string, min 3 znaki (zgodnie z `UpdateApartmentCommand`).
    - `address`: opcjonalne, string, min 5 znaków.
    - Walidacja formularza po stronie klienta (Zod, współdzielona z formularzem tworzenia mieszkania).
  - Generowanie linku:
    - przycisk wyłączony, jeśli istnieje aktywny najem (opcjonalne optymistyczne zabezpieczenie – faktyczny warunek egzekwowany przez API).
  - Zakończenie najmu:
    - dostępne tylko, gdy `activeLease.status === 'active'`.
  - Usuwanie mieszkania:
    - przycisk "Usuń mieszkanie" disabled, jeżeli `leaseHistory.leases.length > 0`,
    - API dodatkowo może zwrócić 400: "Nie można usunąć mieszkania z istniejącymi najmami. Najpierw usuń wszystkie najmy." – komunikat w toascie.

- **Typy:**
  ```ts
  type ApartmentSettingsTabProps = {
    apartment: ApartmentDetailsDTO;
    activeLease?: ActiveLeaseDTO | null;
    leaseHistory: LeaseHistoryDTO['leases'];
    invitations: InvitationListDTO['invitations'];
  };
  ```

- **Propsy:**
  - `apartment` – pełne dane mieszkania.
  - `activeLease?` – aktywny najem (lub `null`, jeśli brak).
  - `leaseHistory` – lista najmów (dla sekcji "Historia najemców").
  - `invitations` – lista linków zapraszających; może być użyta do wyświetlenia statusu (opcjonalne).

---

### Komponenty wspierające użyte w widoku

Poniższe komponenty są opisane szerzej w `ui-plan.md` i innych planach, tutaj tylko kontekst użycia w widoku:

- **`Breadcrumbs`** – wyświetla "Dashboard > [Nazwa mieszkania]".
- **`ChargeList`, `ChargeCard`, `ChargeStatusBadge`** – lista opłat zgrupowana po miesiącach; `readOnly` zależny od roli.
- **`ProtocolForm`, `ProtocolView`, `ProtocolPhotoGallery`** – edycja i podgląd protokołów odbioru/zwrotu.
- **`ApartmentForm`** – formularz edycji danych mieszkania (mode `edit`).
- **`InvitationLinkGenerator`** – generowanie i wyświetlanie linku zapraszającego.
- **`LeaseHistory`** – wyświetlanie listy historycznych najmów.
- **`AlertDialog`** – potwierdzenie operacji destrukcyjnych: zakończenie najmu, usunięcie mieszkania.

## 5. Typy

### 5.1. Typy z `src/types.ts` wykorzystywane przez widok

- **`ApartmentDetailsDTO`**  
  Zawiera pełne dane mieszkania oraz opcjonalny aktywny najem:
  - Pola z tabeli `apartments`: `id`, `name`, `address`, `owner_id`, `created_at`, `updated_at`, …
  - `lease?: LeaseInfo`:
    - `id`, `status`, `start_date`,
    - `tenant: TenantInfo` (zawiera `id`, `full_name`, `email`).

- **`ChargesListDTO` / `ChargeListItemDTO`**  
  Reprezentacja listy opłat zgrupowanych po miesiącach:
  - `charges_by_month: Record<string, ChargeListItemDTO[]>`
  - `ChargeListItemDTO` zawiera m.in.:
    - `id`, `amount`, `due_date`, `type`, `comment`,
    - `payment_status`, `total_paid`, `remaining_amount`, `is_overdue`,
    - `attachment_url?`.

- **`ProtocolDTO` / `ProtocolPhotoDTO`**  
  Dane pojedynczego protokołu:
  - `id`, `lease_id`, `type` (`move_in` / `move_out`), `description`, znaczniki czasu.
  - `photos: ProtocolPhotoDTO[]`:
    - `id`, `file_path`, `file_url`, `uploaded_at`.

- **`CreateUpdateProtocolCommand`**  
  Komenda używana przy `PUT /api/apartments/:id/protocols/:type`:
  - `description: string`.

- **`ActiveLeaseDTO`**  
  Aktywny najem mieszkania:
  - Pola z tabeli `leases`: `id`, `apartment_id`, `tenant_id`, `status`, `start_date`, `notes?`, `created_at`, `updated_at`.
  - `tenant: TenantInfo` (imię, email, id).

- **`LeaseHistoryDTO` / `LeaseHistoryItemDTO`**  
  Historia najmów dla mieszkania:
  - `leases: LeaseHistoryItemDTO[]`.
  - `LeaseHistoryItemDTO`:
    - `id`, `status` (`active` / `archived`), `start_date`, `archived_at?`,
    - `tenant.full_name`.

- **`InvitationListDTO` / `InvitationListItemDTO` / `CreateInvitationResponseDTO`**  
  Dane zaproszeń lokatorów:
  - `InvitationListDTO`:
    - `invitations: InvitationListItemDTO[]`.
  - `InvitationListItemDTO`:
    - `id`, `token`, `status`, `created_at`,
    - `accepted_by?` (imię lokatora).
  - `CreateInvitationResponseDTO`:
    - `id`, `apartment_id`, `token`, `status`, `created_at`, `invitation_url`.

- **`UpdateApartmentCommand`**  
  Komenda używana dla `PATCH /api/apartments/:id`:
  - `name?: string` (min 3 znaki),
  - `address?: string` (min 5 znaków).

### 5.2. Nowe ViewModel‑e i typy specyficzne dla widoku

- **`ApartmentDetailsViewProps`** (opisane wyżej):  
  - `apartmentId: string` – identyfikator mieszkania.
  - `initialApartment: ApartmentDetailsDTO` – dane mieszkania z SSR.
  - `role: 'owner' | 'tenant'` – rola zalogowanego użytkownika.

- **`ApartmentTabId`**  
  Używany do zarządzania zakładkami:
  - `'charges' | 'protocol-move-in' | 'protocol-move-out' | 'settings'`.

- **`ApartmentChargesTabProps`**:
  - `apartmentId: string`.
  - `role: 'owner' | 'tenant'`.
  - `initialChargesByMonth?: ChargesListDTO['charges_by_month']`.

- **`ApartmentProtocolTabProps`**:
  - `apartmentId: string`.
  - `type: 'move_in' | 'move_out'`.
  - `role: 'owner' | 'tenant'`.
  - `initialProtocol?: ProtocolDTO | null`.

- **`ApartmentSettingsTabProps`**:
  - `apartment: ApartmentDetailsDTO`.
  - `activeLease?: ActiveLeaseDTO | null`.
  - `leaseHistory: LeaseHistoryDTO['leases']`.
  - `invitations: InvitationListDTO['invitations']`.

Te typy są czysto frontendowymi ViewModel‑ami i mogą być zdefiniowane lokalnie w plikach komponentów lub wydzielone do `src/types/onboarding.ts` / nowego pliku `src/types/apartments.ts` dla lepszej reużywalności.

## 6. Zarządzanie stanem

- **Poziom globalny:**
  - Wykorzystanie istniejącego `UserContext` / `DashboardLayout` do pobrania danych użytkownika i roli.
  - Widok `/apartments/[id]` opiera się na roli (`role`) przekazanej z warstwy SSR / contextu.

- **Poziom widoku (`ApartmentDetailsView`):**
  - Lokalny stan:
    - `activeTab: ApartmentTabId` – aktualna zakładka (inicjalizowana na podstawie hash z URL, domyślnie `'charges'`).
  - `useEffect`:
    - na mount: odczyt `window.location.hash` i ustawienie `activeTab`,
    - przy zmianie `activeTab`: aktualizacja hash w URL (np. `#protokol-odbioru`).

- **Poziom zakładek (custom hooki):**
  - `useApartmentCharges(apartmentId)`:
    - Stan: `chargesByMonth`, `isLoading`, `error`.
    - Metody: `refetch()`.
    - Wywołuje `GET /api/apartments/:id/charges`.
  - `useProtocol(apartmentId, type)`:
    - Stan: `protocol`, `isLoading`, `error`, `isSaving`, `isUploading`.
    - Metody:
      - `saveDescription(description: string)` → `PUT /api/apartments/:id/protocols/:type`,
      - `uploadPhoto(file: File)` → `POST /api/apartments/:id/protocols/:type/photos`,
      - `deletePhoto(photoId: string)` → `DELETE /api/apartments/:id/protocols/:type/photos/:photoId`.
  - `useApartmentSettings(apartmentId)`:
    - Stan: `apartment`, `activeLease`, `leaseHistory`, `invitations`, `isLoading`, `error`.
    - Metody:
      - `updateApartment(UpdateApartmentCommand)`,
      - `createInvitation()`,
      - `endLease(EndLeaseCommand)`,
      - `deleteApartment()`.
    - Pod spodem wywołuje odpowiednie endpointy API (patrz sekcja Integracja API).

- **Brak globalnego store dla danych mieszkania:**
  - Po operacjach mutujących (zakończenie najmu, usunięcie mieszkania, edycja) stan jest odświeżany przez `refetch()` lub redirect (np. po usunięciu mieszkania).

## 7. Integracja API

Widok `/apartments/[id]` korzysta z następujących endpointów:

- **Podstawowe dane mieszkania:**
  - `GET /api/apartments/:id`
    - **Request:** `id` z URL.
    - **Response:** `ApartmentDetailsDTO`.
    - **Użycie:** SSR w `ApartmentDetailsPage` (Astro) oraz ewentualny refetch na froncie.

- **Opłaty:**
  - `GET /api/apartments/:id/charges`
    - **Response:** `ChargesListDTO`.
    - **Użycie:** `useApartmentCharges` → `ApartmentChargesTab` / `ChargeList`.

- **Protokoły:**
  - `GET /api/apartments/:id/protocols/:type`
    - `type`: `move_in` lub `move_out`.
    - **Response:** `ProtocolDTO`.
    - **Użycie:** `useProtocol` przy pierwszym wejściu na zakładkę.
  - `PUT /api/apartments/:id/protocols/:type`
    - **Body:** `CreateUpdateProtocolCommand` (`{ description: string }`).
    - **Response:** `ProtocolDTO` (zaktualizowany lub nowo utworzony).
  - `POST /api/apartments/:id/protocols/:type/photos`
    - **Body:** `multipart/form-data` z `file`.
    - **Response:** `UploadProtocolPhotoResponseDTO` (pojedyncze zdjęcie).
  - `DELETE /api/apartments/:id/protocols/:type/photos/:photoId`
    - **Response:** `204 No Content`.

- **Ustawienia mieszkania:**
  - `PATCH /api/apartments/:id`
    - **Body:** `UpdateApartmentCommand`.
    - **Response:** `ApartmentDetailsDTO` (zaktualizowane dane).
  - `DELETE /api/apartments/:id`
    - **Response:** `204 No Content` lub 400 z komunikatem biznesowym.

- **Najem (lease):**
  - `GET /api/apartments/:id/lease`
    - **Response:** `ActiveLeaseDTO` (lub 404 jeśli brak aktywnego najmu).
  - `GET /api/apartments/:id/leases`
    - **Response:** `LeaseHistoryDTO` (wszystkie najmy).
  - `POST /api/apartments/:id/lease/end`
    - **Body:** `EndLeaseCommand` (opcjonalne `notes`).
    - **Response:** zaktualizowany rekord najmu (`status: archived`).

- **Zaproszenia:**
  - `GET /api/apartments/:id/invitations`
    - **Response:** `InvitationListDTO`.
  - `POST /api/apartments/:id/invitations`
    - **Response:** `CreateInvitationResponseDTO` (w tym `invitation_url`).

Wszystkie wywołania API powinny używać standardowego wzorca obsługi błędów (status + `message`), z mapowaniem na toasty, stany błędów formularzy lub redirecty (`/403`, `/404`).

## 8. Interakcje użytkownika

- **Nawigacja do widoku (US‑018):**
  - Użytkownik (właściciel) klika kartę mieszkania (`ApartmentCard`) na `/dashboard`.
  - Następuje redirect do `/apartments/[id]`.
  - Widok ładuje się z zakładką **Opłaty** jako domyślną, breadcrumbs: "Dashboard > [Nazwa mieszkania]".

- **Zakładka "Opłaty":**
  - Owner:
    - widzi listę opłat zgrupowaną po miesiącach,
    - może kliknąć "Dodaj opłatę" → redirect do `/charges/new?apartmentId=...`,
    - może kliknąć konkretną opłatę → `/charges/[id]` (zarządzanie opłatą).
  - Tenant:
    - widzi identyczną listę w trybie read‑only,
    - kliknięcie na opłatę otwiera szczegóły opłaty (read‑only).

- **Zakładki "Protokół Odbioru" / "Protokół Zwrotu":**
  - Owner:
    - edytuje tekst protokołu,
    - dodaje zdjęcia (do 10), usuwa błędne,
    - otwiera zdjęcia w nowej karcie.
  - Tenant:
    - widzi opis i zdjęcia (read‑only),
    - może jedynie oglądać zdjęcia.

- **Zakładka "Ustawienia":**
  - Właściciel może:
    - edytować nazwę i adres mieszkania (`ApartmentForm`),
    - wygenerować link zapraszający, skopiować go i przekazać lokatorowi,
    - zobaczyć status lokatora (oczekujący, aktywny),
    - zakończyć najem (`Zakończ najem` z modalem potwierdzającym),
    - przejrzeć historię najemców,
    - usunąć mieszkanie (jeśli spełniony warunek braku najmów).
  - Lokator nie widzi zakładki "Ustawienia".

- **Responsywność:**
  - Na mobile zakładki są scrollowalne, lista opłat prezentowana jako pojedyncza kolumna, sekcje ustawień układane wertykalnie.

## 9. Warunki i walidacja

- **Warunki wynikające z API:**
  - Dostęp do zasobów:
    - Wiele endpointów (`GET /api/apartments/:id`, charges, protocols, leases) wymaga bycia właścicielem mieszkania lub lokatorem aktywnego najmu.
    - Naruszenie → API zwraca 403; interfejs powinien:
      - pokazać komunikat "Nie masz uprawnień do tej strony" i przekierować na `/403` lub `/dashboard`.
  - Aktywny najem:
    - `GET /api/apartments/:id/lease` może zwrócić 404: "Brak aktywnego najmu".
    - UI: sekcja "Lokator" pokazuje "Brak lokatora", przycisk "Zaproś lokatora" jest aktywny.
  - Usuwanie mieszkania:
    - `DELETE /api/apartments/:id` może zwrócić 400: "Nie można usunąć mieszkania z istniejącymi najmami...".
    - UI: przycisk "Usuń mieszkanie" jest wyłączony, jeśli `leaseHistory` nie jest puste; w przypadku niespodziewanego 400 → toast z komunikatem.
  - Generowanie linku zapraszającego:
    - `POST /api/apartments/:id/invitations` zwraca 400, jeśli mieszkanie ma aktywnego lokatora ("To mieszkanie ma już aktywnego lokatora").
    - UI: przycisk "Zaproś lokatora" może być disabled, jeśli `activeLease` istnieje.
  - Protokoły:
    - `GET /api/apartments/:id/protocols/:type` może zwrócić 404 ("Protokół nie został jeszcze utworzony") – UI pokazuje pusty formularz (owner) lub komunikat (tenant).
    - Upload zdjęć – 400/413 przy naruszeniu limitów (typ, rozmiar, liczba zdjęć).

- **Walidacja na poziomie komponentów:**
  - `ApartmentForm` (edycja mieszkania):
    - `name`: string, min 3 znaki, wymagane przy zmianie.
    - `address`: string, min 5 znaków, wymagane przy zmianie.
    - Walidacja Zod, błędy inline pod polami; przy błędach API (400 Validation Error) mapping na pola.
  - `ProtocolForm`:
    - `description`: nie może być pusty przy zapisie; brak limitu długości w API, ale warto ograniczyć np. do kilku tysięcy znaków (UX).
    - Zdjęcia: walidacja MIME type i rozmiaru po stronie klienta przed wysyłką (odrzucenie niepoprawnych plików z komunikatem).
  - `ChargeList` / `ChargeStatusBadge`:
    - Oznaczenie "Po terminie" na podstawie `is_overdue` obliczonego przez API.

- **Wpływ walidacji na stan UI:**
  - Błędy walidacji:
    - czerwone ramki, komunikaty pod polami,
    - przyciski Submit / "Zapisz" disabled, jeśli formularz ma błędy lub jest w trakcie wysyłania.
  - Błędy biznesowe (400):
    - wyświetlane jako toast z komunikatem z `message` (np. przy próbie usunięcia mieszkania lub wygenerowania zaproszenia przy aktywnym najmie).

## 10. Obsługa błędów

- **404 – zasób nie znaleziony:**
  - `GET /api/apartments/:id` → 404:
    - SSR: render strony z komunikatem "Mieszkanie nie zostało znalezione" + link do `/dashboard`,
    - alternatywnie redirect do `/404`.
  - `GET /api/apartments/:id/protocols/:type` → 404:
    - Owner: traktowane jako pusty protokół (formularz startowy),
    - Tenant: komunikat "Protokół nie został jeszcze uzupełniony".

- **401 – brak autoryzacji:**
  - Obsługiwane globalnie przez middleware (redirect do `/login?redirect=/apartments/[id]`).
  - Dodatkowo, przy fetchach z frontendu – w razie 401:
    - toast "Sesja wygasła. Zaloguj się ponownie.",
    - redirect do `/login?redirect=/apartments/[id]`.

- **403 – brak uprawnień:**
  - API (np. przy próbie dostępu do mieszkania, które nie należy do użytkownika).
  - UI:
    - redirect do `/403` lub `/dashboard`,
    - komunikat "Nie masz uprawnień do tej strony".

- **400 – błędy biznesowe:**
  - Usunięcie mieszkania z istniejącymi najmami,
  - Próba wygenerowania zaproszenia przy aktywnym najmie,
  - Przekroczenie limitu zdjęć w protokole.
  - UI:
    - toast z komunikatem `message`,
    - brak zmiany widoku / pozostawienie w aktualnym stanie.

- **500 – błąd serwera / błąd sieci:**
  - Toast "Wystąpił błąd serwera. Spróbuj ponownie." lub "Nie udało się połączyć z serwerem. Sprawdź połączenie internetowe."
  - Formularze pozostają wypełnione (brak utraty danych).

## 11. Kroki implementacji

1. **Dodanie strony routingu dla `/apartments/[id]`:**
   - Utwórz plik `src/pages/apartments/[id].astro`.
   - Ustaw `export const prerender = false;`.
   - Wykorzystaj `DashboardLayout.astro` jako layout.
   - W części serwerowej pobierz `apartmentId` z `Astro.params`, wywołaj `GET /api/apartments/:id` (lub bezpośrednio Supabase) i obsłuż ewentualne 404/403.
   - Skonfiguruj `Breadcrumbs` ("Dashboard" → `/dashboard`, `[Nazwa mieszkania]` → bieżąca strona).

2. **Stworzenie komponentu `ApartmentDetailsView`:**
   - W katalogu `src/components/features/apartments/` utwórz plik `apartment-details-view.tsx`.
   - Zaimplementuj propsy `ApartmentDetailsViewProps`.
   - Dodaj Shadcn `Tabs` z zakładkami "Opłaty", "Protokół Odbioru", "Protokół Zwrotu", "Ustawienia" (ostatnia tylko dla roli `owner`).
   - Zaimplementuj logikę synchronizacji zakładek z hash w URL.

3. **Implementacja zakładki `ApartmentChargesTab`:**
   - Utwórz komponent `ApartmentChargesTab` z propsami `ApartmentChargesTabProps`.
   - Zaimplementuj hook `useApartmentCharges(apartmentId)` w `src/components/hooks/` (lub `src/lib/services/`), który wywołuje `GET /api/apartments/:id/charges` i zarządza stanem ładowania/błędów.
   - Podłącz `ChargeList` (owner/tenant) oraz CTA "Dodaj opłatę" (owner → `/charges/new?apartmentId=...`).

4. **Implementacja zakładki `ApartmentProtocolTab`:**
   - Utwórz komponent `ApartmentProtocolTab` parametryzowany `type: 'move_in' | 'move_out'`.
   - Zaimplementuj hook `useProtocol(apartmentId, type)`:
     - `GET /api/apartments/:id/protocols/:type` przy pierwszym wejściu na zakładkę,
     - `PUT` dla zapisu opisu,
     - `POST` / `DELETE` dla zdjęć.
   - Połącz z `ProtocolForm` (owner) i `ProtocolView` (tenant) oraz `ProtocolPhotoGallery`.

5. **Implementacja zakładki `ApartmentSettingsTab`:**
   - Utwórz komponent `ApartmentSettingsTab` z propsami `ApartmentSettingsTabProps`.
   - Dodaj hook `useApartmentSettings(apartmentId)` pobierający:
     - `GET /api/apartments/:id` (dla najnowszych danych mieszkania),
     - `GET /api/apartments/:id/lease`,
     - `GET /api/apartments/:id/leases`,
     - `GET /api/apartments/:id/invitations`.
   - Zintegruj:
     - `ApartmentForm` (edycja mieszkania → `PATCH /api/apartments/:id`),
     - `InvitationLinkGenerator` (`POST /api/apartments/:id/invitations`),
     - przycisk "Zakończ najem" (`POST /api/apartments/:id/lease/end`),
     - `LeaseHistory` (`GET /api/apartments/:id/leases`),
     - przycisk "Usuń mieszkanie" (`DELETE /api/apartments/:id`), disabled jeśli istnieją najmy.

6. **Integracja z rolami użytkownika:**
   - Upewnij się, że rola (`owner` / `tenant`) jest dostępna w SSR (np. z `context.locals.user` lub `DashboardDTO`).
   - Przekaż `role` do `ApartmentDetailsView` i dalej do zakładek.
   - Ukryj zakładkę "Ustawienia" oraz wszystkie akcje mutujące dla roli `tenant`.

7. **Obsługa błędów i edge‑cases:**
   - Dodaj globalną obsługę 401/403/404/500 w hookach (toasty + ewentualne redirecty).
   - Zaimplementuj puste stany (brak opłat, brak protokołów, brak lokatora, brak historii najmów) zgodnie z PRD i `ui-plan.md`.

8. **Testy manualne scenariuszy (US‑016, US‑017, US‑018 oraz powiązane):**
   - US‑018: kliknięcie na `ApartmentCard` na `/dashboard` poprawnie przenosi do `/apartments/[id]` z zakładką "Opłaty".
   - US‑016: edycja nazw/adresu w zakładce "Ustawienia" aktualizuje dane w całej aplikacji (dashboard, breadcrumbs).
   - US‑017: przycisk "Usuń mieszkanie" jest niedostępny przy istniejących najmów; po spełnieniu warunków usuwa mieszkanie i redirectuje na `/dashboard`.
   - Dodatkowo: generowanie linku, zakończenie najmu, przegląd historii najmów, edycja protokołów i wyświetlanie ich dla lokatora.

9. **Dopracowanie UX i RWD:**
   - Upewnij się, że zakładki są wygodne w obsłudze na mobile (scrollowalne `TabsList`).
   - Sprawdź focus management (po otwarciu modali, po błędnych submitach).
   - Zadbaj o czytelne stany ładowania i błędów (spójne z resztą aplikacji).


