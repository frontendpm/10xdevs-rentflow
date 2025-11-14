## Plan implementacji widoku Dashboard właściciela

## 1. Przegląd

Widok **Dashboard właściciela** ma prezentować listę wszystkich mieszkań zalogowanego właściciela jako siatkę kart, z krótkim podsumowaniem sytuacji najmu i finansów dla każdego mieszkania. Jest to główny widok po zalogowaniu właściciela (po ukończeniu onboardingu) i punkt wejścia do zarządzania poszczególnymi mieszkaniami (przejście do `/apartments/[id]`) oraz do dodawania nowych mieszkań (CTA "Dodaj mieszkanie"). Widok musi być **SSR**, w pełni responsywny (mobile‑first), po polsku i zgodny z istniejącymi typami DTO (`DashboardDTO`, `DashboardOwnerDTO`) oraz endpointem `GET /api/dashboard`.

## 2. Routing widoku

- **Ścieżka:** `/dashboard`
- **Typ renderowania:** SSR (`prerender = false`)
- **Dostęp:** tylko użytkownicy zalogowani (middleware Astro + Supabase Auth)
- **Zachowanie w zależności od roli:**
  - `role === 'owner'` → render widoku **Dashboard właściciela** (ten plan)
  - `role === 'tenant'` → przekazanie danych do osobnego widoku **Dashboard lokatora** (już opisany w UI-planie; poza zakresem tego dokumentu)
- **Źródło danych:**
  - Serwerowa część strony (`dashboard.astro`) korzysta bezpośrednio z `getOwnerDashboard` / `getTenantDashboard` (jak w `src/pages/api/dashboard.ts`), bez dodatkowego `fetch` do `/api/dashboard`.

## 3. Struktura komponentów

Wysokopoziomowa struktura komponentów dla widoku właściciela:

- `src/pages/dashboard.astro`
  - używa `DashboardLayout.astro` (globalna nawigacja)
  - pobiera `DashboardDTO` po stronie serwera (Supabase + `dashboardService`)
  - serializuje i przekazuje dane do wyspy React:
    - `OwnerDashboardIsland` (React, w katalogu `src/components/features/dashboard/owner-dashboard.tsx`)
      - `OwnerDashboardHeader`
        - tytuł / krótki opis (opcjonalnie)
        - przycisk `Button` "Dodaj mieszkanie" (`href="/apartments/new"`)
      - `OwnerDashboardContent`
        - jeśli `apartments.length === 0` → `DashboardEmptyState` (bazuje na ogólnym `EmptyState`)
        - w przeciwnym razie → `ApartmentList` (grid kart)
          - wiele instancji `ApartmentCard`

Drzewo komponentów (uproszczone):

- `DashboardPage`
  - `DashboardLayout`
    - `OwnerDashboardIsland`
      - `OwnerDashboardHeader`
      - `OwnerDashboardContent`
        - `DashboardEmptyState` **lub**
        - `ApartmentList`
          - `ApartmentCard` (x N)

## 4. Szczegóły komponentów

### DashboardPage (`src/pages/dashboard.astro`)

- **Opis komponentu:** Strona Astro odpowiadająca za routing `/dashboard`, SSR i integrację z backendem. Odpowiada za pobranie danych dashboardu (owner/tenant), obsługę błędów oraz przekazanie poprawnie typowanych danych do odpowiedniej wyspy React.
- **Główne elementy:**
  - Import `DashboardLayout.astro`
  - Serwerowy import `getOwnerDashboard`, `getTenantDashboard` z `dashboardService`
  - Import typów `DashboardDTO`, `isDashboardOwnerDTO`, `isDashboardTenantDTO`
  - Sekcja `<DashboardLayout>` z osadzoną wyspą React (np. `<OwnerDashboardIsland dashboard={dashboardData} client:load />` dla właściciela)
- **Obsługiwane interakcje:**
  - Brak interakcji po stronie Astro (wszystkie akcje użytkownika są w wyspach React); strona tylko renderuje dane i layout.
- **Obsługiwana walidacja:**
  - Walidacja roli na podstawie `dashboardData.role`:
    - jeśli `isDashboardOwnerDTO(dto)` → render `OwnerDashboardIsland`
    - jeśli `isDashboardTenantDTO(dto)` → render `TenantDashboardIsland`
    - w innym przypadku → log błędu i render prostego komunikatu o błędzie / redirect na `/403`
  - Walidacja istnienia danych: jeśli serwis zwróci błąd lub `null`, strona wyświetla prosty stan błędu (np. "Nie udało się załadować dashboardu").
- **Typy:**
  - `DashboardDTO`, `DashboardOwnerDTO`, `DashboardTenantDTO` z `src/types.ts`
  - Nowy typ lokalny dla propsów:
    - `OwnerDashboardIslandProps = { dashboard: DashboardOwnerDTO }`
- **Propsy:**
  - Astro nie przyjmuje props; przekazuje natomiast propsy do komponentu React:
    - `OwnerDashboardIsland`:
      - `dashboard: DashboardOwnerDTO`

### OwnerDashboardIsland (`src/components/features/dashboard/owner-dashboard.tsx`)

- **Opis komponentu:** Główny kontener React dla widoku dashboardu właściciela. Przyjmuje surowy `DashboardOwnerDTO`, mapuje go na ViewModel i deleguje renderowanie do komponentów prezentacyjnych (`OwnerDashboardHeader`, `OwnerDashboardContent`).
- **Główne elementy:**
  - Render nagłówka z przyciskiem "Dodaj mieszkanie"
  - Render zawartości:
    - jeśli brak mieszkań → `DashboardEmptyState`
    - jeśli są mieszkania → `ApartmentList` (grid kart)
- **Obsługiwane interakcje:**
  - Kliknięcie przycisku "Dodaj mieszkanie" → nawigacja do `/apartments/new` (link, nie formularz).
  - Kliknięcia w karty są obsługiwane wewnątrz `ApartmentCard` (link do `/apartments/[id]`).
- **Obsługiwana walidacja:**
  - Brak walidacji formularzy (widok tylko do odczytu); jedyna walidacja to obrona przed uszkodzonym DTO:
    - zabezpieczenie przed `dashboard.apartments` będącym `undefined` (fallback do pustej tablicy)
  - Mapowanie DTO → ViewModel jest odporne na brak `tenant` / `lease_status`.
- **Typy:**
  - `DashboardOwnerDTO`, `DashboardApartmentItem`, `DashboardStatistics`
  - Nowe typy ViewModel:
    - `OwnerDashboardViewModel`
    - `OwnerDashboardApartmentCardVM`
  - Opcjonalny hook:
    - `useOwnerDashboardViewModel(dashboard: DashboardOwnerDTO): OwnerDashboardViewModel`
- **Propsy:**
  - `dashboard: DashboardOwnerDTO`

### OwnerDashboardHeader

- **Opis komponentu:** Prosty nagłówek sekcji dashboardu właściciela z tytułem i przyciskiem CTA do dodawania mieszkań.
- **Główne elementy:**
  - Tekst nagłówka (np. `Twoje mieszkania`)
  - Krótki opis (opcjonalnie)
  - `Button` (Shadcn/ui) z `href="/apartments/new"`, wariant `primary`
- **Obsługiwane interakcje:**
  - Kliknięcie przycisku "Dodaj mieszkanie" → przejście do `/apartments/new`
- **Obsługiwana walidacja:**
  - Brak (brak formularzy).
- **Typy:**
  - Brak dodatkowych typów poza standardowymi propsami.
- **Propsy:**
  - (opcjonalnie) `statistics?: DashboardStatistics` – jeśli w przyszłości pokażemy globalne liczby (np. łączna kwota zaległości); w MVP można nie używać.

### OwnerDashboardContent

- **Opis komponentu:** Warstwa odpowiedzialna za wybór między pustym stanem a wyświetleniem listy mieszkań.
- **Główne elementy:**
  - Warunkowy render:
    - `if (vm.apartments.length === 0)` → `DashboardEmptyState`
    - `else` → `ApartmentList`
- **Obsługiwane interakcje:**
  - Brak bezpośrednich; deleguje do dzieci.
- **Obsługiwana walidacja:**
  - Brak; opiera się na wcześniej przygotowanym ViewModelu.
- **Typy:**
  - `OwnerDashboardViewModel`
  - `OwnerDashboardApartmentCardVM[]`
- **Propsy:**
  - `viewModel: OwnerDashboardViewModel`

### ApartmentList (dashboardowa lista mieszkań)

- **Opis komponentu:** Prezentacyjna lista mieszkań w formie responsywnej siatki kart. Bazuje na danych przygotowanych dla widoku dashboardu (intent: szybki przegląd).
- **Główne elementy:**
  - `div` z klasami Tailwind grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
  - Render `ApartmentCard` dla każdego elementu `OwnerDashboardApartmentCardVM`
- **Obsługiwane interakcje:**
  - Brak własnych; kliknięcia obsługiwane w `ApartmentCard`.
- **Obsługiwana walidacja:**
  - Brak.
- **Typy:**
  - `OwnerDashboardApartmentCardVM[]`
- **Propsy:**
  - `apartments: OwnerDashboardApartmentCardVM[]`

### ApartmentCard (wersja dla dashboardu właściciela)

- **Opis komponentu:** Karta mieszkania renderowana na dashboardzie właściciela. Powinna być w całości klikalna, prowadzić do `/apartments/[id]` i prezentować podstawowe dane: nazwę, adres, status lokatora oraz saldo.
- **Główne elementy:**
  - `Card` (`Shadcn/ui`) opakowany linkiem `<a href={href}>`
  - Wnętrze:
    - `name` (np. `<h3>`)
    - `address` (mniejszy tekst)
    - wiersz ze statusem lokatora (np. badge/secondary text)
    - wiersz z saldem (np. pogrubiony tekst "Saldo: -2000 zł")
  - Atrybut view transition:
    - `transition:name={`apartment-${id}`}` na kontenerze (dla animacji przejścia do widoku szczegółów)
  - Hover states (Tailwind: `hover:shadow-md hover:-translate-y-0.5 transition`)
- **Obsługiwane interakcje:**
  - Kliknięcie na kartę (dowolne miejsce) → nawigacja do `/apartments/[id]`
- **Obsługiwana walidacja:**
  - Brak walidacji formularzy; jedynie prezentacja wcześniej wyliczonych stringów `tenantStatusLabel` i `balanceLabel`.
- **Typy:**
  - `OwnerDashboardApartmentCardVM`:
    - `id: string`
    - `name: string`
    - `address: string`
    - `tenantStatusLabel: string` (np. "Oczekuje na lokatora", "Lokator: Jan Kowalski")
    - `balanceLabel: string` (np. "Saldo: 0 zł", "Saldo: -2000 zł")
    - `isOverdue: boolean` (jeśli jakakolwiek część salda jest przeterminowana; do stylowania)
    - `href: string` (`/apartments/[id]`)
- **Propsy:**
  - `apartment: OwnerDashboardApartmentCardVM`

### DashboardEmptyState (bazuje na ogólnym `EmptyState`)

- **Opis komponentu:** Stan pustej listy mieszkań na dashboardzie właściciela, zgodny z PRD i UI-planem.
- **Główne elementy:**
  - Tytuł: "Nie dodałeś jeszcze żadnych mieszkań"
  - Krótki opis (opcjonalny, np. "Dodaj swoje pierwsze mieszkanie, aby zacząć korzystać z Rentflow.")
  - Ilustracja/ikona (jeśli dostępna w ogólnym `EmptyState`)
  - Przycisk/CTA `Button`:
    - tekst: "Dodaj swoje pierwsze mieszkanie"
    - `href="/apartments/new"`
- **Obsługiwane interakcje:**
  - Kliknięcie przycisku → nawigacja do `/apartments/new`
- **Obsługiwana walidacja:**
  - Brak.
- **Typy:**
  - Ewentualne użycie ogólnego typu `EmptyStateProps` (jak w globalnym komponencie pomocniczym).
- **Propsy:**
  - Można wykorzystać istniejący generyczny `EmptyState`:
    - `title: string`
    - `description?: string`
    - `actionLabel: string`
    - `actionHref: string`

## 5. Typy

### Istniejące typy (backend / API)

- **`DashboardApartmentItem`** (z `src/types.ts`):
  - `id: string`
  - `name: string`
  - `address: string`
  - `lease_status?: 'active' | 'archived' | ...` (enum `lease_status`)
  - `tenant?: { full_name: string }`
  - `financial_summary: SimplifiedFinancialSummary`
- **`SimplifiedFinancialSummary`**:
  - `total_unpaid: number`
  - `total_overdue: number`
- **`DashboardStatistics`**:
  - `total_apartments: number`
  - `active_leases: number`
  - `total_unpaid: number`
  - `total_overdue: number`
- **`DashboardOwnerDTO`**:
  - `role: 'owner'`
  - `apartments: DashboardApartmentItem[]`
  - `statistics: DashboardStatistics`
- **`DashboardDTO`**:
  - Unia `DashboardOwnerDTO | DashboardTenantDTO`

### Nowe typy ViewModel dla widoku

#### OwnerDashboardApartmentCardVM

Reprezentuje dane pojedynczej karty mieszkania na dashboardzie właściciela:

- **Pola:**
  - `id: string` – identyfikator mieszkania
  - `name: string` – nazwa mieszkania
  - `address: string` – adres mieszkania
  - `tenantStatusLabel: string` – gotowy do wyświetlenia status lokatora:
    - jeśli `lease_status === 'active'` i `tenant` istnieje → `"Lokator: {tenant.full_name}"`
    - w przeciwnym razie → `"Oczekuje na lokatora"`
  - `balanceLabel: string` – tekst salda:
    - `const totalDue = financial_summary.total_unpaid + financial_summary.total_overdue`
    - jeśli `totalDue === 0` → `"Saldo: 0 zł"`
    - jeśli `totalDue > 0` → `"Saldo: -${totalDue} zł"`
  - `isOverdue: boolean` – `financial_summary.total_overdue > 0`
  - `href: string` – ścieżka do szczegółów mieszkania (`/apartments/${id}`)

#### OwnerDashboardViewModel

Reprezentuje dane całego widoku dashboardu właściciela:

- **Pola:**
  - `apartments: OwnerDashboardApartmentCardVM[]`
  - `hasApartments: boolean` – skrót `apartments.length > 0`
  - (opcjonalnie) `statistics: DashboardStatistics` – jeśli w przyszłości wyświetlimy statystyki.

#### Hook `useOwnerDashboardViewModel`

Pomocniczy hook lub czysta funkcja do mapowania DTO → ViewModel:

- **Sygnatura:**
  - `function useOwnerDashboardViewModel(dashboard: DashboardOwnerDTO): OwnerDashboardViewModel`
- **Zachowanie:**
  - Mapuje `dashboard.apartments` na `OwnerDashboardApartmentCardVM[]` wg zasad opisanych powyżej.
  - Zapewnia stabilny kształt danych nawet przy brakujących polach (np. brak `tenant`).

## 6. Zarządzanie stanem

- **Poziom strony (`dashboard.astro`):**
  - Brak stanu klienta; dane są pobierane po stronie serwera i przekazywane jako propsy.
- **Poziom wyspy `OwnerDashboardIsland`:**
  - Widok jest **czytelniczy** (read-only) – nie wymaga mutacji danych ani zaawansowanego globalnego stanu.
  - Wystarczy lokalny stan/zmienne:
    - `const viewModel = useOwnerDashboardViewModel(dashboard);`
  - Brak potrzeby użycia dodatkowych bibliotek (React Query, global store) w MVP.
- **Potencjalne przyszłe stany (opcjonalne, niekonieczne teraz):**
  - `statusFilter` (np. filtr mieszkań po statusie najmu)
  - `searchQuery` (wyszukiwanie po nazwie/adresie)
  - Ewentualne lazy loading / paginacja (stan strony).
- **Customowe hooki:**
  - Na tym etapie rekomendowany jest tylko prosty `useOwnerDashboardViewModel` (lub czysta funkcja), aby oddzielić logikę mapowania od komponentów prezentacyjnych.

## 7. Integracja API

- **Endpoint używany przez widok (pośrednio):** `GET /api/dashboard`
  - Zwraca `DashboardDTO` (owner/tenant).
  - Implementacja istnieje w `src/pages/api/dashboard.ts` i opiera się na:
    - `getOwnerDashboard(supabase, user.id)`
    - `getTenantDashboard(supabase, user.id)`
- **Strategia integracji w widoku:**
  - `dashboard.astro` nie wykonuje `fetch('/api/dashboard')`, tylko:
    - korzysta z tych samych usług (`getOwnerDashboard`, `getTenantDashboard`) po stronie serwera,
    - dzięki temu unika dodatkowego requestu HTTP i podwójnego pobierania danych.
  - Wyspa React (`OwnerDashboardIsland`) otrzymuje już kompletny `DashboardOwnerDTO` jako props.
- **Typy żądania i odpowiedzi:**
  - Żądanie:
    - Metoda: `GET`
    - Ścieżka: `/api/dashboard`
    - Nagłówki: `Authorization: Bearer <jwt>` (zarządzane przez Supabase + middleware)
  - Odpowiedź (w przypadku właściciela):
    - `DashboardOwnerDTO` (patrz sekcja typów)
- **Warunki API istotne dla widoku:**
  - `role` musi być `'owner'` – w przeciwnym razie UI nie może używać ścieżki właściciela i musi przekazać dane do widoku lokatora.
  - Tablica `apartments` może być pusta → konieczne poprawne zaimplementowanie `DashboardEmptyState`.

## 8. Interakcje użytkownika

- **Wejście na `/dashboard` jako właściciel:**
  - Middleware sprawdza sesję; jeśli brak → redirect na `/login`.
  - Serwer pobiera `DashboardOwnerDTO`.
  - Użytkownik widzi:
    - nagłówek,
    - przycisk "Dodaj mieszkanie",
    - siatkę kart mieszkań **lub** pusty stan.
- **Kliknięcie w kartę mieszkania (`ApartmentCard`):**
  - Oczekiwany rezultat: przejście do `/apartments/[id]` (widok szczegółowy mieszkania, zakładki itd.).
  - Dodatkowo: aktywuje animację View Transition (fade) między kartą a nagłówkiem szczegółów mieszkania.
- **Kliknięcie "Dodaj mieszkanie":**
  - Oczekiwany rezultat: przejście do `/apartments/new`, gdzie użytkownik wypełnia formularz (US‑015).
  - Po dodaniu mieszkania, widok `/apartments/new` powinien przekierować z powrotem na `/dashboard` (z toastem), gdzie nowe mieszkanie pojawi się jako kolejna karta.
- **Kliknięcie CTA w pustym stanie ("Dodaj swoje pierwsze mieszkanie"):**
  - Zachowanie identyczne jak wyżej – przejście do `/apartments/new`.

## 9. Warunki i walidacja

- **Warunki po stronie interfejsu (bez formularzy na tym widoku):**
  - **Warunek roli:**
    - Widok właściciela powinien renderować się tylko, gdy `dashboard.role === 'owner'`.
    - Jeśli nie – należy przekazać dane do innego widoku (lokator) lub wyświetlić błąd/redirect (w praktyce rola jest gwarantowana przez backend + RLS, ale UI nie powinien zakładać błędnej wartości).
  - **Warunek pustej listy mieszkań:**
    - Jeśli `dashboard.apartments.length === 0` → render `DashboardEmptyState`.
    - W przeciwnym razie → render `ApartmentList`.
  - **Warunek statusu lokatora:**
    - Wartość `tenantStatusLabel` jest wyliczana z DTO:
      - `lease_status === 'active'` i jest `tenant` → lokator aktywny.
      - W innym wypadku → "Oczekuje na lokatora".
    - UI nie dokonuje dodatkowych zapytań – opiera się na danych `DashboardOwnerDTO`.
  - **Warunek wyliczenia salda:**
    - Dla każdej karty:
      - `totalDue = total_unpaid + total_overdue`
      - UI prezentuje saldo jako:
        - `"Saldo: 0 zł"` jeśli `totalDue === 0`
        - `"Saldo: -{totalDue} zł"` jeśli `totalDue > 0` (wartość zaokrąglona/formatowana do 2 miejsc)
    - `isOverdue = total_overdue > 0` – wykorzystywane np. do czerwonego koloru salda.
- **Wpływ warunków na stan interfejsu:**
  - Warunek roli wpływa na wybór drzewa komponentów.
  - Pusty stan wpływa na to, czy użytkownik widzi listę kart, czy komunikat zachęcający do dodania mieszkania.
  - Status lokatora i saldo wpływają tylko na teksty i stylowanie (brak logiki biznesowej po stronie klienta).

## 10. Obsługa błędów

- **Błędy autoryzacji (401):**
  - Obsługiwane głównie przez middleware:
    - brak sesji → redirect na `/login?redirect=/dashboard`.
  - Jeśli mimo to strona otrzyma brak `user` w `context.locals`, powinna:
    - zwrócić prostą odpowiedź 401 (lub redirect), zgodnie z podejściem w `api/dashboard.ts`.
- **Błędy serwera przy pobieraniu dashboardu:**
  - Wywołanie `getOwnerDashboard` może rzucić błąd (np. problem z bazą).
  - Strona:
    - loguje błąd do konsoli serwera,
    - zwraca prosty widok błędu (np. komunikat "Nie udało się załadować dashboardu. Spróbuj odświeżyć stronę lub skontaktuj się z pomocą (pomoc@rentflow.pl).").
- **Nieprawidłowa rola w `DashboardDTO`:**
  - Jeśli `role` ma inną wartość niż `'owner'` / `'tenant'`:
    - zalogować błąd,
    - można zwrócić 500 lub prosty widok błędu ("Nieprawidłowa rola użytkownika").
- **Błędy renderowania na kliencie (React):**
  - Komponenty prezentacyjne nie wykonują wywołań API ani nie modyfikują danych, więc typowe błędy to brakujące pola.
  - Mapowanie DTO → VM powinno mieć domyślne wartości (np. fallback na `"Oczekuje na lokatora"` i `"Saldo: 0 zł"`), by zminimalizować ryzyko runtime errors.

## 11. Kroki implementacji

1. **Przygotowanie struktury katalogów:**
   - Utworzyć katalog `src/components/features/dashboard/` (jeśli nie istnieje).
   - Upewnić się, że `DashboardLayout.astro` jest gotowy do użycia na `/dashboard`.
2. **Rozszerzenie typów w `src/types.ts`:**
   - Potwierdzić istnienie `DashboardOwnerDTO`, `DashboardApartmentItem`, `DashboardDTO`, `SimplifiedFinancialSummary`.
   - Dodać typy `OwnerDashboardApartmentCardVM` i `OwnerDashboardViewModel` (lub w osobnym module typów frontowych, jeśli taką konwencję stosuje projekt).
   - Dodać funkcję/hook `isDashboardOwnerDTO` jest już dostępny – wykorzystać go w implementacji strony.
3. **Implementacja pobierania danych w `src/pages/dashboard.astro`:**
   - Ustawić `export const prerender = false;`.
   - W bloku serwerowym:
     - pobrać `user` z `context.locals`,
     - na podstawie `user.id` pobrać `DashboardDTO` przez `getOwnerDashboard` / `getTenantDashboard` (re-use logiki z `api/dashboard.ts`),
     - w przypadku właściciela przekazać `dashboard` do wyspy `OwnerDashboardIsland`.
   - Dodać obsługę błędów (brak użytkownika, brak rekordu w bazie, wyjątki).
4. **Stworzenie komponentu `OwnerDashboardIsland`:**
   - Plik `src/components/features/dashboard/owner-dashboard.tsx`.
   - Zaimplementować propsy `dashboard: DashboardOwnerDTO`.
   - Wewnątrz:
     - wywołać `const viewModel = useOwnerDashboardViewModel(dashboard);`
     - wyrenderować `OwnerDashboardHeader` i `OwnerDashboardContent viewModel={viewModel}`.
5. **Implementacja funkcji/hooku `useOwnerDashboardViewModel`:**
   - Dodać funkcję mapującą `DashboardOwnerDTO` → `OwnerDashboardViewModel`:
     - mapowanie `dashboard.apartments` na `OwnerDashboardApartmentCardVM[]` z wyliczeniem `tenantStatusLabel`, `balanceLabel`, `isOverdue`, `href`.
     - ustawienie `hasApartments` na podstawie długości tablicy.
6. **Stworzenie komponentów prezentacyjnych:**
   - `OwnerDashboardHeader`:
     - nagłówek + przycisk `Button` z `href="/apartments/new"`.
   - `OwnerDashboardContent`:
     - warunek `viewModel.hasApartments ? <ApartmentList ...> : <DashboardEmptyState />`.
   - `ApartmentList`:
     - siatka Tailwind: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`.
     - render `ApartmentCard` dla każdego `apartment` z VM.
   - `ApartmentCard`:
     - `Card` Shadcn opakowany w `<a href={apartment.href}>`.
     - View Transition: `transition:name={`apartment-${apartment.id}`}` na root.
     - Wyświetlenie nazwy, adresu, statusu lokatora i salda, z odpowiednim stylowaniem (kolor dla `isOverdue`).
7. **Implementacja `DashboardEmptyState`:**
   - Wykorzystać istniejący ogólny komponent `EmptyState` (z `src/components/...`), jeśli jest.
   - Ustawić teksty:
     - `title="Nie dodałeś jeszcze żadnych mieszkań"`
     - `actionLabel="Dodaj swoje pierwsze mieszkanie"`
     - `actionHref="/apartments/new"`.
8. **Stylowanie i RWD:**
   - Zastosować klasy Tailwind zgodne z UI-planem:
     - `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` dla listy.
     - Responsywne spacingi (`gap-4`, `p-4`, itd.).
     - Hover states kart (`hover:shadow-md`, `hover:-translate-y-0.5`, `transition`).
   - Sprawdzić działanie na szerokości ok. 360px (mobile).
9. **Integracja z nawigacją globalną:**
   - Upewnić się, że logo w `DashboardLayout.astro` kieruje na `/dashboard`.
   - Upewnić się, że breadcrumbs dla `/dashboard` nie pokazują dodatkowych segmentów (zgodnie z UI-planem).
10. **Testy manualne scenariuszy z User Stories (US‑013, US‑014, US‑015):**
    - Właściciel z istniejącymi mieszkaniami:
      - po zalogowaniu trafia na `/dashboard`,
      - widzi listę kart z poprawnymi statusami i saldami,
      - kliknięcie karty przenosi do `/apartments/[id]`.
    - Właściciel bez mieszkań:
      - widzi pusty stan z komunikatem i CTA,
      - kliknięcie CTA przenosi do `/apartments/new`,
      - po dodaniu mieszkania i powrocie na `/dashboard` karta jest widoczna.
    - Kliknięcie "Dodaj mieszkanie" z belki nagłówka: zachowanie jak wyżej.
11. **Kontrola jakości i dostępności:**
    - Sprawdzić focus states (cała karta powinna mieć czytelny outline przy fokusie).
    - Upewnić się, że teksty statusów i sald są po polsku i zrozumiałe.
    - Zweryfikować, że brak jest twardo zakodowanych tekstów po angielsku.


