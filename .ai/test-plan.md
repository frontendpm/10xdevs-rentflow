## Plan testów – Rentflow MVP

### 1. Wprowadzenie i cele testowania

- **Cel główny**: Zweryfikować, że aplikacja Rentflow MVP spełnia wymagania z PRD, jest bezpieczna (RLS, uprawnienia ról), poprawnie obsługuje kluczowe przepływy (onboarding właściciela, zaproszenie lokatora, zarządzanie opłatami i protokołami) oraz działa stabilnie na docelowym stacku (Astro + React + Supabase).
- **Cele szczegółowe**:
  - **Zgodność funkcjonalna**: pokrycie testami wszystkich historyjek US-001–US-054 oraz rozszerzeń AUTH.
  - **Bezpieczeństwo danych**: potwierdzenie, że właściciele widzą tylko swoje mieszkania i dane finansowe, a lokatorzy wyłącznie dane swojego aktywnego najmu.
  - **Poprawność finansowa**: weryfikacja wyliczeń statusów opłat, sald, zaległości oraz ograniczeń edycji/usuwania.
  - **Niezawodność przepływów auth**: rejestracja, logowanie, reset hasła, wygaśnięcie sesji, działanie middleware Astro.
  - **Jakość UX/RWD**: aplikacja jest intuicyjna, responsywna (od 360px) i dostępna (WCAG 2.1 AA).

### 2. Zakres testów

- **W zakresie (MVP)**:
  - **Uwierzytelnianie i sesje**:
    - Rejestracja właściciela (`/register`, `RegisterOwnerForm`, integracja z Supabase Auth).
    - Rejestracja lokatora przez zaproszenie (`/register/tenant`, `TenantRegisterForm`, `/api/invitations/:token`/`accept`).
    - Logowanie (`/login`, `LoginForm`), wylogowanie (`logout()`).
    - Reset hasła (UI + backend + Supabase `recover` + `user`).
    - Middleware `src/middleware/index.ts` – ochrona tras SSR (np. `/dashboard`, `/onboarding`, `/apartments/[id]`).
  - **Onboarding właściciela**:
    - Widok `/onboarding`, kreator 2 kroków, brak możliwości wyjścia przed ukończeniem.
    - Tworzenie mieszkania (API `/api/apartments`, `ApartmentService.createApartment`).
    - Generowanie linku zapraszającego (`InvitationLinkGenerator`, `/api/apartments/:id/invitations`).
  - **Zarządzanie mieszkaniami i najmami**:
    - Dashboard właściciela (`/dashboard`, `OwnerDashboardIsland`, `getOwnerDashboard`).
    - Lista mieszkań (`ApartmentService.getApartmentsForOwner`).
    - Szczegóły mieszkania (`/apartments/[id]`, `getApartmentDetails`, zakładki).
    - Edycja i usuwanie mieszkań (`updateApartment`, `deleteApartment` + ograniczenia najmów).
    - Generowanie, walidacja, wykorzystanie linków (API `invitations`).
    - Zakończenie najmu, historia najmów (`/api/apartments/:id/lease/end`, `/api/apartments/:id/leases`).
  - **Opłaty i wpłaty**:
    - Lista opłat (`ChargesService.getChargesForApartment`, `/api/apartments/:id/charges`, grupowanie miesiącami).
    - Dodawanie/edycja/usuwanie opłat (API `charges`, reguły biznesowe, triggery DB).
    - Dodawanie/edycja/usuwanie wpłat (API `payments`, limity sumy).
    - Załączniki do opłat (upload, walidacja plików, kasowanie, signed URLs).
    - Widok właściciela vs widok lokatora (read-only).
  - **Protokoły**:
    - Protokół odbioru/zwrotu (`/api/apartments/:id/protocols/:type`, `ProtocolForm`, `ProtocolView`).
    - Zdjęcia protokołów (limit 10, walidacja plików, upload/delete).
  - **Dashboard lokatora**:
    - `/dashboard` w roli lokatora (`TenantDashboardIsland`, `getTenantDashboard`).
    - Dostęp do opłat, wpłat i protokołów wyłącznie dla aktywnego najmu.
  - **Warstwa API i RLS**:
    - Wszystkie endpointy z `src/pages/api/**` zgodnie z API planem (autoryzacja, walidacja Zod, obsługa błędów).
    - RLS w Supabase – próby nieautoryzowanego dostępu.
  - **Warstwa prezentacji**:
    - Layouty (`AuthLayout`, `DashboardLayout`, `OnboardingLayout`), breadcrumbs, menu użytkownika.
    - Responsywność i dostępność (kluczowe ekrany).

- **Poza zakresem (świadome wykluczenia z PRD)**:
  - Integracje płatnicze, subskrypcje, konta premium.
  - Zaawansowana analityka, raporty, eksporty CSV/PDF.
  - Powiadomienia email/SMS poza resetem hasła (Edge Functions).
  - Integracje z narzędziami analitycznymi (GA, Hotjar).

### 3. Strategia i typy testów

#### 3.1. Poziomy testów

- **Testy jednostkowe (unit)**:
  - Serwisy domenowe w `src/lib/services` (np. `ApartmentService`, `ChargesService`, `dashboardService`, `user.service`, `invitation.service`).
  - Funkcje pomocnicze (`file-validation`, `auth` utils, kalkulacje sald).
  - Schematy walidacyjne Zod (`validation/*`).
- **Testy integracyjne (backend)**:
  - API routes w `src/pages/api/**` z użyciem lokalnej instancji Supabase (lub mockowanego klienta) i realnych schematów DB.
  - Integracja z RLS (scenariusze właściciel vs lokator vs anon).
- **Testy komponentowe/integracyjne (frontend)**:
  - Reactowe formularze (logowanie, rejestracja, opłaty, wpłaty, protokoły) z React Testing Library.
  - Zachowanie form + walidacja + obsługa błędów API.
- **Testy E2E (end-to-end)**:
  - Pełne przepływy użytkownika w przeglądarce (Playwright): od rejestracji po zarządzanie opłatami.
- **Testy manualne eksploracyjne**:
  - W szczególności UI/UX, RWD, przypadki brzegowe, dostępność.

#### 3.2. Typy testów

- **Testy funkcjonalne**: zgodność z PRD i dokumentami `.ai` (PRD, api-plan, ui-plan, auth-spec).
- **Testy bezpieczeństwa (podstawowe)**:
  - Uprawnienia ról, próby eskalacji (lokator próbuje działań właściciela).
  - Dostęp do zasobów między różnymi właścicielami.
  - Dostęp do storage (załączniki, zdjęcia protokołów) przez signed URLs.
- **Testy wydajnościowe (lekkie)**:
  - Czas odpowiedzi kluczowych endpointów (dashboard, lista opłat) przy realistycznym wolumenie danych.
  - Podstawowe smoke tests k6 / Playwright (czas ładowania, brak regresji).
- **Testy użyteczności i RWD**:
  - Zachowanie na mobile (360px), tabletach, desktopie.
  - Czytelność statusów, komunikatów błędów, pustych stanów.
- **Testy dostępności**:
  - Klawiaturowa nawigacja, focus, role ARIA, kontrasty.

### 4. Priorytety testowe (wg ryzyka)

- **P0 – krytyczne ścieżki biznesowe**:
  - Rejestracja, logowanie, reset hasła i wylogowanie.
  - Onboarding właściciela (US-010–US-012).
  - Generowanie i wykorzystanie linków zapraszających, zakończenie najmu.
  - Uprawnienia: rozdział właściciel/lokator, RLS, middleware.
  - Dodawanie i prezentacja opłat oraz sald lokatora (dashboard).
- **P1 – wysokie ryzyko biznesowe/finansowe**:
  - Logika opłat i wpłat (statusy, sumy, ograniczenia edycji/usuwania).
  - Załączniki do opłat (w tym walidacja plików).
  - Protokoły i zdjęcia (limity, formaty, dostępność dla lokatora).
- **P2 – pozostałe funkcje**:
  - Historia najmów, szczegóły archiwalnych najmów.
  - Profile użytkowników (`/api/users/me`, aktualizacja `full_name`).
  - UX widoków pustych, toasty, komunikaty błędów.
- **P3 – nice-to-have / post-MVP**:
  - Zaawansowane testy wydajnościowe, długotrwałe sesje.
  - Pełne pokrycie a11y, mikrointerakcje (animacje, transitions).

### 5. Scenariusze testowe dla kluczowych funkcjonalności

#### 5.1. Uwierzytelnianie i sesje

- **Rejestracja właściciela (US-001, US-AUTH-001)**:
  - Poprawna rejestracja z unikalnym e-mailem → auto-login → redirect do `/onboarding`.
  - Błędny email, zbyt krótkie hasło, niezgodne hasła, brak zgód → walidacja client-side + brak wywołań API.
  - Próba rejestracji istniejącego e-maila → komunikat „adres zajęty”.
- **Rejestracja lokatora przez link (US-002, US-043, US-050, US-051)**:
  - Ważny token: wyświetlenie danych mieszkania, poprawna rejestracja, auto-login, `POST /api/invitations/:token/accept`, redirect do `/dashboard`.
  - Nieważny/zużyty token: redirect na `/invitation-expired`, poprawny komunikat.
  - Wejście na `/register/tenant` bez tokenu → redirect na `/login` lub błąd zgodnie ze specyfikacją.
- **Logowanie (US-003)**:
  - Właściciel bez mieszkań → redirect `/onboarding`.
  - Właściciel z mieszkaniami → `/dashboard` (widok właściciela).
  - Lokator → `/dashboard` (widok lokatora).
  - Błędne dane → ogólny komunikat, brak ujawniania istnienia konta.
- **Reset hasła (US-005, US-006)**:
  - Poprawny format e-mail → `POST /api/auth/password/reset-request` → zawsze taki sam komunikat.
  - Link resetu: poprawny token → ustawienie nowego hasła, możliwość logowania nowym hasłem.
  - Wygasły token → komunikat/redirect na `/reset-password`.
- **Wylogowanie (US-004)**:
  - Wylogowanie z menu użytkownika: czyszczenie tokenów (localStorage, cookies), redirect na `/login`, brak dostępu do tras chronionych.
- **Middleware i wygasła sesja**:
  - Wejście na `/dashboard` bez tokenu → redirect na `/login?redirect=/dashboard`.
  - Token wygasły/niepoprawny → 401 z API, wymuszone ponowne logowanie.

#### 5.2. Onboarding właściciela

- **Kreator 2 kroków (US-010–US-012, US-AUTH-005)**:
  - Właściciel świeżo po rejestracji zawsze trafia na `/onboarding`, brak dostępu do `/dashboard` przed zakończeniem kreatora.
  - Krok 1: wymagane pola `name`, `address`, walidacja minimalnej długości; po sukcesie mieszkanie widoczne w `/dashboard`.
  - Krok 2: wygenerowanie linku → `POST /api/apartments/:id/invitations`, wyświetlenie URL, poprawne kopiowanie do schowka.
  - Próba odświeżenia strony między krokami, cofania → brak możliwości ominięcia procesu.

#### 5.3. Zarządzanie mieszkaniami i najmami

- **Dashboard właściciela (US-013–US-015)**:
  - Lista mieszkań zawiera: nazwę, adres, status lokatora, podsumowanie salda.
  - Pusty stan: poprawny komunikat i CTA „Dodaj swoje pierwsze mieszkanie”.
- **Edycja i usuwanie mieszkań (US-016, US-017, US-018, US-022)**:
  - Edycja nazwy/adresu odzwierciedla się we wszystkich widokach (dashboard, szczegóły, historia).
  - Usunięcie mieszkania bez najmów → sukces, brak w dashboardzie.
  - Próba usunięcia mieszkania z aktywnym lub archiwalnym najmem → blokada (disabled przycisk, tooltip, błąd API).
- **Generowanie i status zaproszeń (US-019, US-020, US-021)**:
  - Mieszkanie bez lokatora: aktywny przycisk „Zaproś lokatora”.
  - Po wygenerowaniu linku: status „Oczekuje na przyjęcie”, po rejestracji lokatora → status z danymi lokatora.
  - Zakończenie najmu: `POST /api/apartments/:id/lease/end` → lokator traci dostęp, najem trafia do historii, mieszkanie w stanie „Brak lokatora”.
  - Próba wygenerowania zaproszenia przy aktywnym najmie → blokada + komunikat.
- **Ograniczenie jednego najmu na lokatora (US-053)**:
  - Lokator z aktywnym najmem próbuje przyjąć nowe zaproszenie → błąd biznesowy i komunikat.

#### 5.4. Opłaty i wpłaty

- **Lista opłat właściciela (US-023, US-024, US-031, US-032)**:
  - Grupowanie po `YYYY-MM`, sortowanie malejące, poprawne statusy (unpaid, partially_paid, paid, overdue).
  - Pusty stan z CTA „Dodaj pierwszą opłatę”.
  - Oznaczenie „Po terminie” dla opłat po dacie wymagalności i nieopłaconych.
- **Dodawanie/edycja opłaty (US-025–US-029)**:
  - Walidacja: kwota > 0, poprawna data, typ z listy, komentarz ≤ 300 znaków, plik 1× (PDF/JPG/PNG, ≤5MB).
  - Błędny format pliku/rozmiar → błąd walidacji.
  - Edycja opłaty „częściowo opłaconej”: kwota nie może spaść poniżej sumy wpłat (błąd walidacji z DB + poprawne mapowanie na komunikat).
  - Opłata „opłacona”: brak możliwości edycji (disabled/ukryte przyciski) i usunięcia.
- **Usuwanie opłaty (US-030)**:
  - Opłata „unpaid”/„partially_paid”: potwierdzenie w modalu, usunięcie opłaty i powiązanych wpłat.
  - Opłata „paid”: przycisk „Usuń” niedostępny, próba przez API → błąd biznesowy.
- **Wpłaty (US-033–US-036)**:
  - Dodanie wpłaty: kwota > 0, ≤ pozostałej kwoty; po dodaniu status opłaty aktualizuje się do „częściowo opłaconej” lub „opłaconej”.
  - Edycja i usuwanie wpłat: sumy nie mogą przekroczyć kwoty opłaty; przeliczenie statusu po każdej operacji.
  - Lista wpłat sortowana po dacie płatności, poprawnie wyświetlana zarówno dla właściciela, jak i lokatora (read-only).
- **Załączniki do opłat (US-026, US-042)**:
  - Dodanie załącznika: poprawna ścieżka w storage, generacja signed URL, możliwość otwarcia w nowej karcie.
  - Zmiana załącznika: stary plik usuwany, nowy dodany.
  - Usunięcie załącznika: plik znika ze storage, w UI brak linku/ikonki.

#### 5.5. Protokoły i pliki

- **Protokoły odbioru/zwrotu (US-037–US-041)**:
  - Pusty protokół: widoczny textarea i przycisk „Dodaj zdjęcia”.
  - Zapis treści: treść zachowuje się po odświeżeniu; brak utraty danych.
  - Dodawanie zdjęć: tylko JPG/PNG, ≤5MB, maks. 10 zdjęć; przekroczenie limitu → błąd.
  - Usuwanie zdjęcia: potwierdzenie, zwolnienie miejsca w limicie, brak dead linków.
- **Widoczność dla lokatora (US-048, US-049)**:
  - Lokator widzi treść protokołu i zdjęcia, nie może ich modyfikować.
  - Puste protokoły → komunikat informacyjny.

#### 5.6. Widok lokatora

- **Dashboard lokatora (US-044)**:
  - Poprawne podsumowanie finansowe: suma `remaining_amount` dla opłat „unpaid” i „partially_paid”.
  - Prawidłowe dane mieszkania i właściciela.
- **Lista opłat i szczegóły (US-045–US-047)**:
  - Taka sama lista jak u właściciela, ale bez przycisków akcji.
  - Szczegóły opłaty: komentarz, załącznik, lista wpłat – wyłącznie odczyt.
- **Puste stany (US-049)**:
  - Gdy brak opłat lub protokołów → właściwy komunikat (bez CTA).

#### 5.7. Edge-case’y i bezpieczeństwo

- **Wygaśnięcie linku zapraszającego (US-050)**: ponowne użycie, manipulacja tokenem, token o złym formacie.
- **Lokator po zakończeniu najmu (US-052)**: próba logowania, dostępu do danych, zachowanie UI.
- **RLS i role**:
  - Lokator nie może odczytać/zmienić danych innego lokatora lub mieszkania.
  - Właściciel nie widzi mieszkań innego właściciela, nawet przez bezpośrednie ID w URL.
  - Publiczny endpoint `/api/invitations/:token` zwraca wyłącznie minimalne dane, brak wycieku informacji o innych zasobach.

### 6. Środowisko testowe

- **Środowiska**:
  - **Dev lokalne**: Astro `npm run dev`, Supabase lokalne (CLI) z migracjami z `supabase/migrations`.
  - **Test/Staging** (zalecane): zbliżone do produkcji (DigitalOcean, Docker, Nginx), osobna baza Supabase, osobne buckety storage.
- **Konfiguracja**:
  - Oddzielne zmienne `.env.test` z kluczami Supabase (anon + service role) wskazujące na testowy projekt.
  - Buckety `charge-attachments` i `protocol-photos` dla środowiska testowego, z takimi samymi politykami RLS.
- **Dane testowe**:
  - Skrypt seedujący (SQL lub API) tworzący:
    - min. 2 właścicieli, 1–2 mieszkania na właściciela,
    - aktywne i archiwalne najmy, lokatorów,
    - opłaty w różnych statusach, z i bez załączników,
    - protokoły z różną liczbą zdjęć (0, 1, 10).
- **Zarządzanie danymi**:
  - Reset bazy przed suite E2E (rollback + reaplikacja migracji/seed).
  - Izolacja testów E2E (osobne konta użytkowników/maile na suite).

### 7. Narzędzia do testowania

- **Automatyczne testy jednostkowe/integracyjne**:
  - **Vitest** – testy TS serwisów, utili, Zod schematów.
  - **React Testing Library** – testy komponentów form, błędów walidacji, interakcji UI.
- **E2E**:
  - **Playwright** – testy przeglądarkowe, wsparcie dla wielu przeglądarek i mobile viewport.
- **API**:
  - **Postman/Insomnia** lub Playwright `request` – ręczne i automatyczne testy endpointów.
- **Jakość kodu**:
  - **ESLint**, **Prettier**, **TypeScript** – uruchamiane w CI przed testami.
- **Inne**:
  - **k6** (opcjonalnie) – lekki load test najważniejszych endpointów (dashboard, charges).
  - **axe-core** (w Playwright) – szybkie testy dostępności.

### 8. Harmonogram testów (wysokopoziomowy)

- **Faza 1 – Testy jednostkowe i API (Tydzień 1–2)**:
  - Pokrycie serwisów domenowych (Apartment, Charges, Dashboard, Invitation, User).
  - Testy walidacji Zod dla głównych endpointów.
  - API tests dla `users`, `apartments`, `invitations`, `charges`, `payments`, `protocols`, `dashboard`.
- **Faza 2 – Testy komponentowe UI (Tydzień 2–3)**:
  - Formularze auth, onboarding, opłaty, wpłaty, protokoły.
  - Sprawdzenie stanów błędów, loading, disabled przycisków.
- **Faza 3 – E2E ścieżek krytycznych (Tydzień 3–4)**:
  - Pełne przepływy właściciel + lokator (minimum: onboarding, rozliczenia, zakończenie najmu).
  - Scenariusze brzegowe (wygasły link, utrata dostępu lokatora).
- **Faza 4 – RWD, a11y, bezpieczeństwo (Tydzień 4)**:
  - Testy na mobile/desktop, kontrasty, klawiatura, podstawowe scenariusze bezpieczeństwa.
- **Faza 5 – Re-test i regresja (ciągłe)**:
  - Po każdym większym merge – smoke E2E + regresja P0/P1.

### 9. Kryteria akceptacji testów

- **Dla releasu MVP**:
  - 100% zdefiniowanych testów P0 uruchomionych i zaliczonych.
  - Min. 90% testów P1 zaliczonych (pozostałe zplanowane z jasno zdefiniowanymi workaroundami lub oznaczone jako post-MVP).
  - Brak otwartych defektów o ważności **Krytyczna** lub **Wysoka**; maksymalnie kilka średnich/niski z akceptacją biznesu.
  - Wszystkie scenariusze auth + onboarding + główne ścieżki właściciela i lokatora (wg PRD) przechodzą w E2E.
  - Brak naruszeń dostępu między właścicielami i lokatorami (udowodnione testami RLS).

### 10. Role i odpowiedzialności

- **QA / Test Engineer**:
  - Przygotowanie i utrzymanie planu testów, scenariuszy, danych testowych.
  - Implementacja automatycznych testów E2E, wspólnie z devami testów unit/integration.
  - Raportowanie i śledzenie defektów, wsparcie w ich reprodukcji.
- **Backend Developerzy (Supabase/ASTRO API)**:
  - Implementacja i utrzymanie testów jednostkowych i integracyjnych dla serwisów i endpointów.
  - Współpraca przy testach RLS i scenariuszach bezpieczeństwa.
- **Frontend Developerzy (Astro + React)**:
  - Implementacja testów komponentów i logiki UI (formularze, walidacje, redirecty).
  - Utrzymanie zgodności z UI-planem (layouty, stany błędów, RWD).
- **DevOps / Infra**:
  - Utrzymanie środowisk testowych/staging, automatyzacja w CI (lint, testy, build).
- **Product Owner / Biznes**:
  - Akceptacja scenariuszy testowych względem PRD.
  - Priorytetyzacja defektów, decyzje o akceptacji/rejecie releasu.

### 11. Procedury raportowania błędów

- **System zgłoszeń**: GitHub Issues / Jira (w zależności od ustaleń zespołu).
- **Minimalny zakres informacji w zgłoszeniu**:
  - **Tytuł**: krótki opis + obszar (np. „[Opłaty] Lokator widzi opłaty innego mieszkania”).
  - **Środowisko**: commit/tag, środowisko (local/test/prod), przeglądarka, urządzenie.
  - **Kroki reprodukcji**: sekwencja działań krok po kroku.
  - **Oczekiwany rezultat** vs **Rzeczywisty rezultat** (z cytatem komunikatów w języku polskim).
  - **Załączniki**: zrzuty ekranu, logi z konsoli/Network, ewentualnie zrzut odpowiedzi API.
  - **Powiązane wymagania**: ID user story (US-XXX), endpointy, komponenty.
- **Klasyfikacja ważności**:
  - **Krytyczna**: brak możliwości skorzystania z kluczowych ścieżek (rejestracja, logowanie, onboarding, dodawanie opłat) lub naruszenie bezpieczeństwa (dostęp do cudzych danych).
  - **Wysoka**: błędne dane finansowe, blokada istotnej funkcji (np. dodanie wpłaty), powtarzające się błędy 500.
  - **Średnia**: błędy UI, pojedyncze błędne komunikaty, problemy z RWD na niszowych rozdzielczościach.
  - **Niska**: literówki, kosmetyka, drobne niezgodności z designem.
- **Cykl życia zgłoszenia**:
  - `Nowe` → `Do analizy` → `W toku` → `Do testów` → `Zamknięte` (lub `Odrzucone` z uzasadnieniem).
  - Przy zamykaniu: informacja o wersji/commicie z fixem, link do PR.

### 12. Podsumowanie

- Plan testów dla Rentflow MVP koncentruje się na zapewnieniu bezpieczeństwa (RLS, role), poprawności finansowej (opłaty/wpłaty), niezawodnych przepływów auth/onboardingu oraz wysokiej jakości UX dla dwóch ról użytkowników.
- Testy są rozłożone na kilka poziomów (unit, integracyjne, E2E) i typów (funkcjonalne, bezpieczeństwa, RWD, a11y), z wyraźnie zdefiniowanymi priorytetami P0–P3.
- Zdefiniowane zostały konkretne scenariusze dla kluczowych funkcjonalności oraz jasne kryteria akceptacji, role w procesie i zasady raportowania defektów, co umożliwia przewidywalne i powtarzalne podejście do jakości przed release’em MVP.


