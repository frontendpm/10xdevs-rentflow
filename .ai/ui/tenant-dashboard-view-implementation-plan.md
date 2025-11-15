## Plan implementacji widoku Dashboard lokatora

## 1. Przegląd

Widok **Dashboard lokatora** jest głównym ekranem po zalogowaniu użytkownika z rolą `tenant`. Jego celem jest szybkie pokazanie **podsumowania finansowego** najmu (tekst w stylu „Łącznie do zapłaty: 2000 zł”) oraz zapewnienie **nawigacji** do trzech głównych sekcji: listy opłat, protokołu odbioru oraz protokołu zwrotu mieszkania. Widok jest **read-only**, całkowicie opiera się na danych z endpointu `GET /api/dashboard` (wariant `DashboardTenantDTO`) oraz musi być **SSR**, responsywny (mobile‑first) i w pełni zgodny z PRD (US‑044, US‑045–US‑049). Logika biznesowa salda jest po stronie backendu – frontend wyłącznie prezentuje wartości z `financial_summary`.

## 2. Routing widoku

- **Ścieżka:** `/dashboard`
- **Typ renderowania:** SSR (`export const prerender = false;`)
- **Dostęp:** tylko użytkownicy zalogowani (wymuszane przez `src/middleware/index.ts` i Supabase Auth)
- **Rozgałęzienie wg roli użytkownika:**
  - `role === 'owner'` → istniejący widok **Dashboard właściciela** (opisany w `dashboard-view-implementation-plan.md`)
  - `role === 'tenant'` → widok **Dashboard lokatora** (ten dokument)
- **Źródło danych:**
  - Strona `src/pages/dashboard.astro` powinna korzystać bezpośrednio z serwisu (np. `dashboardService.getDashboard`) z użyciem `context.locals.supabase` i `context.locals.user`, zamiast robić `fetch('/api/dashboard')`.
  - Dane z serwisu mają już kształt **`DashboardDTO`** z `src/types.ts`; po stronie UI używamy strażnika typu `isDashboardTenantDTO(dto)` aby wybrać ścieżkę lokatora.

## 3. Struktura komponentów

Wysokopoziomowa struktura dla wariantu lokatora:

- `src/pages/dashboard.astro`
  - używa layoutu `DashboardLayout.astro` (nawigacja globalna)
  - pobiera `DashboardDTO` po stronie serwera
  - jeśli `isDashboardTenantDTO(dto)`:
    - renderuje wyspę React: `TenantDashboardIsland` z props `dashboard={tenantDashboard}`
  - jeśli nie (np. właściciel) → deleguje do `OwnerDashboardIsland` (istniejące zachowanie)

- `src/components/features/dashboard/tenant-dashboard.tsx` (kontener React)
  - `TenantDashboardIsland`
    - mapuje `DashboardTenantDTO` → `TenantDashboardViewModel` (logika formatująca teksty)
    - renderuje:
      - `TenantSummaryCard`
      - `TenantDashboardSections` (karty nawigacyjne)

- `src/components/features/dashboard/tenant-summary-card.tsx`
  - `TenantSummaryCard`
    - prezentuje mieszkanie (nazwa, adres), właściciela oraz tekst „Łącznie do zapłaty: X zł”

- `src/components/features/dashboard/tenant-dashboard-sections.tsx`
  - `TenantDashboardSections`
    - siatka/kolekcja trzech kart
    - używa wspólnego komponentu prezentacyjnego `DashboardNavCard` (może być współdzielony z innymi widokami dashboardu)

- `src/components/features/dashboard/dashboard-nav-card.tsx`
  - `DashboardNavCard`
    - pojedyncza karta nawigacyjna oparta o `Card` (Shadcn/ui), z ikoną, tytułem, opisem i linkiem `href`

Drzewo komponentów (część lokatorska):

- `DashboardPage` (`dashboard.astro`)
  - `DashboardLayout`
    - `TenantDashboardIsland` (React)
      - `TenantSummaryCard`
      - `TenantDashboardSections`
        - `DashboardNavCard` („Lista opłat”)
        - `DashboardNavCard` („Protokół Odbioru”)
        - `DashboardNavCard` („Protokół Zwrotu”)

## 4. Szczegóły komponentów

### DashboardPage (`src/pages/dashboard.astro`) – wariant lokatora

- **Opis komponentu:** Strona Astro obsługująca `/dashboard`, która na podstawie danych z serwisu dashboardowego wybiera, czy renderować wariant właściciela, czy lokatora. Dla roli `tenant` osadza wyspę `TenantDashboardIsland` z odpowiednio typowanymi propsami.
- **Główne elementy:**
  - Import layoutu `DashboardLayout.astro`
  - Import funkcji serwisowej (np. `getDashboard`) oraz typów `DashboardDTO`, `isDashboardTenantDTO`
  - Serwerowa logika pobrania dashboardu dla zalogowanego użytkownika (`context.locals.user.id`)
  - Warunkowy render:
    - jeśli `isDashboardTenantDTO(dashboard)` → `<TenantDashboardIsland dashboard={dashboard} client:load />`
    - jeśli `isDashboardOwnerDTO(dashboard)` → `<OwnerDashboardIsland dashboard={dashboard} client:load />`
- **Obsługiwane interakcje:** Brak po stronie Astro – cała interakcja jest w komponentach React; strona dostarcza tylko dane i layout.
- **Warunki walidacji:**
  - Sprawdzenie obecności `context.locals.user`; w przeciwnym razie redirect/odpowiedź 401 (spójnie z middleware i innymi stronami).
  - Sprawdzenie, czy serwis zwrócił poprawne `DashboardDTO`; jeśli nie, wyświetlenie prostego komunikatu o błędzie lub przekierowanie na `/403` / `/500`.
- **Typy:**
  - `DashboardDTO`, `DashboardTenantDTO`, `DashboardOwnerDTO` z `src/types.ts`
  - Funkcje strażnicze: `isDashboardTenantDTO`, `isDashboardOwnerDTO`
- **Propsy przekazywane do React:**
  - `TenantDashboardIsland`:
    - `dashboard: DashboardTenantDTO`

### TenantDashboardIsland (`src/components/features/dashboard/tenant-dashboard.tsx`)

- **Opis komponentu:** Główny kontener React dla widoku dashboardu lokatora. Odpowiada za mapowanie DTO na ViewModel, formatowanie tekstów, a następnie render kart podsumowania i nawigacji.
- **Główne elementy:**
  - Wywołanie funkcji/hooku `useTenantDashboardViewModel(dashboard)` w celu uzyskania `TenantDashboardViewModel`
  - Render:
    - sekcji nagłówkowo‑podsumowującej (`TenantSummaryCard`)
    - sekcji nawigacyjnej (`TenantDashboardSections`)
- **Obsługiwane interakcje:**
  - Brak bezpośrednich interakcji mutujących; kliknięcia w karty nawigacyjne delegowane są do `DashboardNavCard` (linki).
- **Warunki walidacji:**
  - Prosta walidacja kształtu danych (np. defensywne sprawdzenie, czy `viewModel.apartment` istnieje); w razie braku danych można pokazać fallback („Brak danych mieszkania”).
- **Typy:**
  - Wejściowy: `DashboardTenantDTO`
  - ViewModel: `TenantDashboardViewModel` (opisany w sekcji Typy)
  - Hook/funkcja mapująca: `useTenantDashboardViewModel(dashboard: DashboardTenantDTO): TenantDashboardViewModel`
- **Propsy:**
  - `dashboard: DashboardTenantDTO`

### TenantSummaryCard (`src/components/features/dashboard/tenant-summary-card.tsx`)

- **Opis komponentu:** Karta podsumowania finansowego lokatora. Wyświetla podstawowe informacje o mieszkaniu (nazwa, adres), właścicielu oraz zwięzłe podsumowanie salda w stylu „Łącznie do zapłaty: X zł”. Dodatkowo może pokazywać informację, czy część kwoty jest po terminie.
- **Główne elementy:**
  - Kontener `Card` (Shadcn/ui) lub prosta sekcja z klasami Tailwind (np. `rounded-lg border p-4 bg-card`).
  - Treść:
    - nagłówek z nazwą mieszkania `apartmentName`
    - podtytuł/adres `apartmentAddress`
    - informacja o właścicielu (np. „Właściciel: Jan Kowalski”)
    - główne podsumowanie finansowe:
      - duży tekst `totalDueLabel` (np. „Łącznie do zapłaty: 2 000 zł”)
      - pomocnicza linia z informacją o zaległościach, jeśli `hasOverdue === true` (np. „Część tej kwoty jest po terminie” w kolorze ostrzegawczym)
- **Obsługiwane interakcje:**
  - Brak; karta jest wyłącznie informacyjna (bez przycisków ani linków).
- **Warunki walidacji (logika UI):**
  - Jeśli `viewModel.totalDue === 0` → tekst typu „Łącznie do zapłaty: 0 zł” (bez podkreślania błędu).
  - Jeśli `hasOverdue` → zastosowanie innego koloru/Badge dla informacji o zaległościach.
  - Frontend **nie** przelicza salda – używa `financial_summary.total_due` z API.
- **Typy:**
  - Korzysta z `TenantDashboardViewModel`:
    - `apartmentName: string`
    - `apartmentAddress: string`
    - `ownerName: string`
    - `totalDueLabel: string`
    - `hasOverdue: boolean`
- **Propsy:**
  - `viewModel` lub bezpośrednio zdekomponowane pola, np.:
    - `apartmentName: string`
    - `apartmentAddress: string`
    - `ownerName: string`
    - `totalDueLabel: string`
    - `hasOverdue: boolean`

### TenantDashboardSections (`src/components/features/dashboard/tenant-dashboard-sections.tsx`)

- **Opis komponentu:** Sekcja zawierająca trzy karty nawigacyjne (lista opłat, protokół odbioru, protokół zwrotu). Każda karta jest w całości klikalna i prowadzi do odpowiedniego widoku szczegółowego w panelu mieszkania lokatora.
- **Główne elementy:**
  - Kontener z gridem Tailwind:
    - np. `grid grid-cols-1 md:grid-cols-3 gap-4`
  - Mapowanie tablicy `navCards` (z ViewModelu) na komponenty `DashboardNavCard`
    - „Lista opłat” → link do `/apartments/[id]` (zakładka „Opłaty” – domyślna)
    - „Protokół Odbioru” → link do `/apartments/[id]#protokol-odbioru`
    - „Protokół Zwrotu” → link do `/apartments/[id]#protokol-zwrotu`
- **Obsługiwane interakcje:**
  - Kliknięcie w dowolne miejsce karty:
    - nawigacja do odpowiedniego URL (za pomocą zwykłego `<a href={href}>` lub komponentu `Link`, jeśli używany).
- **Warunki walidacji:**
  - Brak walidacji formularzy – jedynie sprawdzenie, że `navCards` jest niepuste; w praktyce zawsze trzy elementy.
- **Typy:**
  - Korzysta z typu `TenantDashboardNavCardVM` (definicja w sekcji Typy).
- **Propsy:**
  - `cards: TenantDashboardNavCardVM[]`

### DashboardNavCard (`src/components/features/dashboard/dashboard-nav-card.tsx`)

- **Opis komponentu:** Reużywalna karta nawigacyjna w dashboardzie. Prezentuje ikonę, tytuł i opis sekcji, a cała karta jest linkiem do innego widoku. Może być wykorzystana zarówno przez dashboard lokatora, jak i potencjalne inne sekcje.
- **Główne elementy:**
  - `Card` (Shadcn/ui) opakowany w `<a href={href}>`
  - Header karty:
    - ikona (np. z lucide-react, zgodnie ze stackiem Shadcn/ui)
    - tytuł `title`
  - Body:
    - opis `description`
- **Obsługiwane interakcje:**
  - Kliknięcie → nawigacja do `href`
  - Stylowanie `hover` i `focus` (np. `hover:shadow-md`, `focus-visible:outline`), aby poprawić UX i dostępność.
- **Warunki walidacji:**
  - Brak.
- **Typy:**
  - `DashboardNavCardProps`:
    - `title: string`
    - `description: string`
    - `href: string`
    - `icon: React.ComponentType` lub nazwa ikony
- **Propsy:**
  - jak wyżej (`title`, `description`, `href`, `icon`)

## 5. Typy

### Istniejące typy (backend / API)

Z `src/types.ts`:

- **`DashboardTenantFinancialSummary`**
  - `total_due: number` – łączna kwota do zapłaty (zgodna z US‑044 – suma opłat „Do opłacenia” i brakującej kwoty z „Częściowo opłacone”)
  - `total_overdue: number` – łączna kwota po terminie
  - `upcoming_charges: UpcomingChargeInfo[]` – lista nadchodzących opłat (opcjonalnie używana w przyszłości)
- **`UpcomingChargeInfo`**
  - `id: string`
  - `amount: number`
  - `due_date: string` (ISO)
  - `type: Enums<'charge_type'>` (np. `rent`, `bill`, `other`)
- **`DashboardTenantDTO`**
  - `role: 'tenant'`
  - `apartment: { id: string; name: string; address: string; owner: OwnerInfo }`
  - `financial_summary: DashboardTenantFinancialSummary`

Frontend **nie** powinien redefiniować tych typów, a jedynie importować je z `src/types.ts`.

### Nowe typy ViewModel

#### `TenantDashboardViewModel`

Reprezentuje dane potrzebne do renderowania dashboardu lokatora:

- **Pola:**
  - `apartmentId: string` – identyfikator mieszkania (do budowy URL-i)
  - `apartmentName: string` – nazwa mieszkania (np. „Kawalerka na Woli”)
  - `apartmentAddress: string` – adres mieszkania
  - `ownerName: string` – imię i nazwisko właściciela
  - `totalDue: number` – surowa kwota `financial_summary.total_due`
  - `totalOverdue: number` – surowa kwota `financial_summary.total_overdue`
  - `totalDueLabel: string` – sformatowany tekst, np.:
    - `"Łącznie do zapłaty: 0 zł"` jeśli `totalDue === 0`
    - `"Łącznie do zapłaty: 2 000 zł"` jeśli `totalDue > 0`
  - `hasOverdue: boolean` – `totalOverdue > 0`
  - `navCards: TenantDashboardNavCardVM[]` – definicja kart nawigacyjnych

#### `TenantDashboardNavCardVM`

Model pojedynczej karty nawigacyjnej:

- **Pola:**
  - `title: string` – np. „Lista opłat”, „Protokół Odbioru”, „Protokół Zwrotu”
  - `description: string` – krótki opis (np. „Zobacz wszystkie swoje opłaty i ich statusy”)
  - `href: string` – docelowy URL:
    - `"/apartments/" + apartmentId"` dla listy opłat (domyślna zakładka „Opłaty”)
    - `"/apartments/" + apartmentId + "#protokol-odbioru"`
    - `"/apartments/" + apartmentId + "#protokol-zwrotu"`
  - `icon: 'charges' | 'move_in' | 'move_out' | string` – identyfikator używanej ikony

### Hook/funkcja mapująca `useTenantDashboardViewModel`

- **Sygnatura:**
  - `function useTenantDashboardViewModel(dashboard: DashboardTenantDTO): TenantDashboardViewModel`
- **Zachowanie:**
  - Pobiera `apartment`, `financial_summary` z DTO.
  - Wylicza:
    - `totalDueLabel` na podstawie `total_due` (formatowanie liczby i dodanie sufiksu „zł”).
    - `hasOverdue = total_overdue > 0`.
    - `navCards` – trzy stałe definicje kart z poprawnie zbudowanymi `href` dla `apartment.id`.
  - Zapewnia domyślne wartości w przypadku braków (np. pusty string dla nazwy, `0` dla kwot), aby zminimalizować ryzyko błędów w UI.

## 6. Zarządzanie stanem

- **Poziom strony (`dashboard.astro`):**
  - Brak stanu klienta – dane pobierane po stronie serwera i przekazywane jako propsy.
- **Poziom `TenantDashboardIsland`:**
  - Widok jest w 100% **read-only** – brak akcji typu `POST/PATCH/DELETE`.
  - Wystarczy lokalne wyliczenie ViewModelu:
    - `const viewModel = useTenantDashboardViewModel(dashboard);`
  - Nie ma potrzeby używania globalnego store czy bibliotek typu React Query w tym widoku.
- **Custom hooki:**
  - `useTenantDashboardViewModel` – do mapowania DTO → ViewModel.
- **Przykładowy przepływ:**
  - Strona serwerowa pobiera `DashboardTenantDTO`.
  - `TenantDashboardIsland` wylicza `viewModel`.
  - Stan jest stały przez cały lifecycle komponentu (brak mutacji).

## 7. Integracja API

- **Endpoint główny:** `GET /api/dashboard`
  - Odpowiedź dla lokatora ma kształt `DashboardTenantDTO`.
  - Poziom autoryzacji: wymagany JWT (Supabase Auth) – obsługiwane przez middleware.
- **Integracja w widoku:**
  - `dashboard.astro` powinien wykorzystywać ten sam serwis, co `src/pages/api/dashboard.ts` (np. `getTenantDashboard`), ale bez robienia HTTP requestu:
    - `const dashboard = await getTenantDashboard(context.locals.supabase, context.locals.user.id);`
  - Nie ma potrzeby osobnych wywołań z przeglądarki – dane przekazywane są jako props do `TenantDashboardIsland`.
- **Typy żądania i odpowiedzi:**
  - Żądanie:
    - Metoda: `GET`
    - Ścieżka: `/api/dashboard`
  - Odpowiedź:
    - `DashboardTenantDTO`:
      - `apartment`: dane mieszkania i właściciela
      - `financial_summary.total_due`: kwota zsumowanych opłat „Do opłacenia” + brakującej części „Częściowo opłacone”
      - `financial_summary.total_overdue`: część salda przeterminowana
- **Istotne warunki po stronie API:**
  - Jeśli użytkownik nie ma aktywnego najmu (np. US‑052), API może zwrócić błąd lub dane sygnalizujące brak mieszkania – UI musi to obsłużyć (np. komunikat „Najem dla tego mieszkania został zakończony…”).

## 8. Interakcje użytkownika

- **Wejście na `/dashboard` jako lokator:**
  - Po zalogowaniu (US‑003, US‑043) middleware kieruje lokatora na `/dashboard`.
  - Użytkownik widzi:
    - nazwę i adres mieszkania,
    - podsumowanie finansowe („Łącznie do zapłaty: X zł”),
    - trzy karty nawigacyjne do kluczowych sekcji.
- **Kliknięcie karty „Lista opłat”:**
  - Nawigacja do `/apartments/[id]` (zakładka „Opłaty”).
  - Oczekiwany rezultat: widok listy opłat (US‑045, US‑049) – read-only.
- **Kliknięcie karty „Protokół Odbioru”:**
  - Nawigacja do `/apartments/[id]#protokol-odbioru`.
  - Oczekiwany rezultat: zakładka protokołu odbioru z treścią i zdjęciami (US‑048).
- **Kliknięcie karty „Protokół Zwrotu”:**
  - Nawigacja do `/apartments/[id]#protokol-zwrotu`.
  - Oczekiwany rezultat: zakładka protokołu zwrotu (US‑048).
- **Nawigacja z nagłówka (logo, menu użytkownika):**
  - Logo → pozostaje na `/dashboard` (odświeżenie).
  - Menu użytkownika zawiera m.in. opcję „Wyloguj” (US‑004).

## 9. Warunki i walidacja

- **Warunek roli:**
  - Widok lokatora powinien renderować się tylko, gdy `dashboard.role === 'tenant'`.
  - W praktyce rola jest gwarantowana przez backend + RLS, ale UI musi obsłużyć sytuacje brzegowe (np. nieznana rola → prosty widok błędu).
- **Warunek obecności mieszkania:**
  - Jeśli z jakiegoś powodu `dashboard.apartment` jest `null`/`undefined` (np. najem zakończony – US‑052), UI powinien:
    - wyświetlić jasny komunikat (np. „Najem dla tego mieszkania został zakończony. Skontaktuj się z właścicielem.”) zamiast kart finansowych.
- **Warunki dla salda:**
  - UI nie przelicza salda – ufa `financial_summary.total_due`.
  - Walidacja na poziomie prezentacji:
    - jeśli `totalDue < 0` (niespodziewany stan) → fallback do `0` i log w konsoli (opcjonalnie).
    - jeśli `totalDue === 0` → neutralna prezentacja, bez alarmowego koloru.
  - `hasOverdue = totalOverdue > 0` → używane do warunkowego stylowania (np. czerwony tekst ostrzegawczy).
- **Warunki nawigacji:**
  - `apartmentId` musi być poprawnie ustawiony w `href` kart – brak id nie może generować uszkodzonych linków; lepiej ukryć karty i pokazać komunikat o błędzie.

## 10. Obsługa błędów

- **Błędy autoryzacji (401):**
  - Obsługiwane na poziomie middleware – niezalogowany użytkownik jest przekierowywany na `/login?redirect=/dashboard`.
- **Brak aktywnego najmu (US‑052):**
  - Jeśli API/serwis zwróci informację o braku aktywnego najmu:
    - dashboard może przyjąć specjalny kształt (np. brak `apartment`),
    - UI powinien pokazać komunikat „Najem dla tego mieszkania został zakończony. Skontaktuj się z właścicielem.” zamiast kart.
- **Błędy serwera (500) przy pobieraniu dashboardu:**
  - Serwerowe try/catch w `dashboard.astro`:
    - log błędu na backendzie,
    - prosty komunikat dla użytkownika (np. toast lub sekcja „Wystąpił błąd podczas ładowania danych. Spróbuj odświeżyć stronę.”).
- **Nieprawidłowa rola w DTO:**
  - Jeśli `role` ma inną wartość niż `owner`/`tenant`, strona powinna:
    - zalogować błąd,
    - pokazać ogólny komunikat błędu lub redirect na `/403`.
- **Błędy renderowania klienta:**
  - Dzięki defensywnemu mapowaniu w `useTenantDashboardViewModel` (domyślne wartości) ryzyko runtime errors jest minimalne.

## 11. Kroki implementacji

1. **Zweryfikuj istniejącą stronę `dashboard.astro`:**
   - Upewnij się, że strona ma `export const prerender = false;`.
   - Dodaj/wykorzystaj logikę pobrania `DashboardDTO` z serwisu (`dashboardService`) na podstawie `context.locals.user`.
   - Użyj `isDashboardTenantDTO` oraz `isDashboardOwnerDTO`, aby rozgałęzić render na `TenantDashboardIsland` i `OwnerDashboardIsland`.
2. **Dodaj typy ViewModel dla dashboardu lokatora w odpowiednim module (np. `src/components/features/dashboard/tenant-dashboard.types.ts`):**
   - Zdefiniuj `TenantDashboardViewModel` oraz `TenantDashboardNavCardVM` zgodnie z sekcją Typy.
3. **Zaimplementuj hook/funkcję `useTenantDashboardViewModel`:**
   - Przyjmuj `DashboardTenantDTO`, zwracaj `TenantDashboardViewModel`.
   - Zaimplementuj formatowanie `totalDueLabel` (liczby → string z „zł”) oraz budowę `navCards` z prawidłowymi `href`.
4. **Utwórz komponent `TenantDashboardIsland` (`src/components/features/dashboard/tenant-dashboard.tsx`):**
   - Przyjmuj props `dashboard: DashboardTenantDTO`.
   - Wewnątrz wywołuj `useTenantDashboardViewModel`.
   - Renderuj `<TenantSummaryCard ... />` oraz `<TenantDashboardSections ... />`.
5. **Utwórz komponent `TenantSummaryCard` (`tenant-summary-card.tsx`):**
   - Przyjmuj wartości z ViewModelu.
   - Zbuduj prostą kartę z nazwą, adresem, właścicielem oraz tekstem „Łącznie do zapłaty: X zł”.
   - Dodaj warunkowe wyróżnienie zaległości (`hasOverdue`).
6. **Utwórz komponent `TenantDashboardSections` (`tenant-dashboard-sections.tsx`):**
   - Przyjmuj `cards: TenantDashboardNavCardVM[]`.
   - Zastosuj grid: `grid grid-cols-1 md:grid-cols-3 gap-4`.
   - Renderuj trzy `DashboardNavCard` zgodnie z ViewModelem.
7. **Utwórz/lub wykorzystaj istniejący komponent `DashboardNavCard`:**
   - Zapewnij obsługę ikony, tytułu, opisu i linku `href`.
   - Dodaj odpowiednie stany `hover` i `focus-visible` dla dostępności.
8. **Podłącz nowe komponenty w `dashboard.astro`:**
   - Importuj `TenantDashboardIsland` i wykorzystaj go w gałęzi `tenant`.
9. **Przetestuj scenariusze z US‑044 i powiązanych:**
   - Lokator zaraz po rejestracji przez link:
     - po zaakceptowaniu zaproszenia i autologicowaniu widzi `/dashboard` z poprawnymi danymi (mieszkanie, „Łącznie do zapłaty: 0 zł”).
   - Lokator z opłatami (w tym częściowo opłaconymi i po terminie):
     - wartość `total_due` odzwierciedla sumę brakujących kwot,
     - jeśli część kwoty jest po terminie, widok sygnalizuje to (np. tekst o zaległościach).
   - Kliknięcia w karty:
     - „Lista opłat” → `Opłaty` mieszkania (read-only),
     - „Protokół Odbioru” / „Protokół Zwrotu” → odpowiednie zakładki.
10. **Sprawdź RWD i dostępność:**
    - Na małych ekranach (ok. 360px) karty układają się w jedną kolumnę.
    - Wszystkie elementy interaktywne mają widoczny focus.
    - Teksty są po polsku, bez twardo zakodowanych komunikatów po angielsku.


