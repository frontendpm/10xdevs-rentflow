# Architektura UI dla Rentflow MVP

## 1. Przegląd struktury UI

Rentflow MVP składa się z dwóch głównych interfejsów użytkownika:

### Panel Właściciela
- Pełny dostęp CRUD do zarządzania mieszkaniami, lokatorami, opłatami i protokołami
- Dashboard z listą mieszkań jako kartami
- Obowiązkowy 2-etapowy onboarding po pierwszej rejestracji
- System zakładek dla szczegółów mieszkania (Opłaty, Protokół Odbioru, Protokół Zwrotu, Ustawienia)

### Panel Lokatora
- Dostęp tylko do odczytu (read-only)
- Dashboard z podsumowaniem finansowym
- Widok opłat, wpłat i protokołów swojego mieszkania
- Brak możliwości dodawania, edycji lub usuwania danych

### Kluczowe założenia architektury
- **Język:** Wyłącznie polski (PL)
- **Responsywność:** Mobile-first od 360px
- **Prostota:** "Maksymalnie dużo za maksymalnie prostą obsługę"
- **Bezpieczeństwo:** Supabase Auth + Row Level Security (RLS)
- **Accessibility:** WCAG 2.1 AA - keyboard navigation, ARIA, focus management
- **Rendering:** SSR dla widoków z danymi, static dla stron publicznych

---

## 2. Lista widoków

### 2.1. Widoki wspólne (Właściciel + Lokator)

#### `/login` - Strona logowania
**Typ:** Static
**Główny cel:** Umożliwienie zalogowania się do aplikacji
**Kluczowe informacje:**
- Formularz logowania (email, hasło)
- Link "Nie pamiętasz hasła?"
- Link do rejestracji właściciela

**Kluczowe komponenty:**
- `AuthLayout.astro` - layout bez globalnej nawigacji
- `LoginForm` (React) - formularz z walidacją
- `Input`, `Button` (Shadcn/ui)

**UX/Accessibility:**
- Autofocus na polu email
- Enter submittuje formularz
- Błędy walidacji inline pod polami
- Komunikat błędu ogólny: "Nieprawidłowy e-mail lub hasło"

**Bezpieczeństwo:**
- Supabase Auth
- HTTPS tylko
- Nie ujawniać czy email istnieje w systemie

**Integracja API:**
- `POST https://<supabase-url>/auth/v1/token?grant_type=password`

**Mapowanie User Stories:** US-003

---

#### `/register` - Rejestracja właściciela
**Typ:** Static
**Główny cel:** Umożliwienie założenia konta właściciela
**Kluczowe informacje:**
- Formularz rejestracji (Imię, Email, Hasło, Powtórz hasło)
- Checkbox "Akceptuję Regulamin i Politykę Prywatności" (z linkami)
- Po rejestracji: automatyczne logowanie + redirect do onboardingu

**Kluczowe komponenty:**
- `AuthLayout.astro`
- `RegisterForm` (React)
- `Input`, `Button`, `Checkbox` (Shadcn/ui)
- Linki do `/regulamin`, `/polityka-prywatnosci`

**Walidacja:**
- Email: unikalny, poprawny format
- Hasło: min 8 znaków
- Hasło i Powtórz hasło: identyczne
- Checkbox: wymagany

**UX/Accessibility:**
- Inline validation
- Czerwone ramki dla błędnych pól
- Komunikaty błędów pod polami
- Disabled button dopóki walidacja nie przejdzie

**Integracja API:**
- `POST https://<supabase-url>/auth/v1/signup`

**Mapowanie User Stories:** US-001

---

#### `/register/tenant?token=xxx` - Rejestracja lokatora
**Typ:** SSR (prerender = false)
**Główny cel:** Umożliwienie rejestracji lokatora przez link zapraszający
**Kluczowe informacje:**
- Walidacja tokenu przy załadowaniu strony
- Wyświetlenie informacji o mieszkaniu (nazwa, adres) z linku zapraszającego
- Formularz rejestracji (jak właściciel)
- Po rejestracji: automatyczne logowanie + redirect do dashboardu lokatora

**Kluczowe komponenty:**
- `AuthLayout.astro`
- `TenantRegisterForm` (React) - formularz + info o mieszkaniu
- Alert z informacją: "Zostałeś zaproszony do mieszkania [Nazwa] ([Adres])"

**Walidacja:**
- Token: sprawdzenie czy ważny (GET `/api/invitations/:token`)
- Formularz: jak dla właściciela

**UX/Accessibility:**
- Jeśli token nieważny: redirect na dedykowaną stronę błędu
- Komunikat: "Ten link zapraszający wygasł lub został już wykorzystany"

**Integracja API:**
- `GET /api/invitations/:token` - walidacja tokenu
- `POST https://<supabase-url>/auth/v1/signup` - rejestracja
- `POST /api/invitations/:token/accept` - powiązanie lokatora z mieszkaniem

**Mapowanie User Stories:** US-002, US-043, US-050

---

#### `/reset-password` - Resetowanie hasła (krok 1)
**Typ:** Static
**Główny cel:** Inicjacja procesu resetowania hasła
**Kluczowe informacje:**
- Formularz z jednym polem: Email
- Po submit: komunikat "Jeśli konto istnieje, link został wysłany"

**Kluczowe komponenty:**
- `AuthLayout.astro`
- `ResetPasswordForm` (React)

**Integracja API:**
- `POST https://<supabase-url>/auth/v1/recover`

**Mapowanie User Stories:** US-005

---

#### `/reset-password/confirm` - Resetowanie hasła (krok 2)
**Typ:** SSR
**Główny cel:** Ustawienie nowego hasła
**Kluczowe informacje:**
- Formularz: Nowe hasło, Powtórz nowe hasło
- Walidacja tokenu z URL
- Po submit: redirect na `/login` z komunikatem sukcesu

**Kluczowe komponenty:**
- `AuthLayout.astro`
- `NewPasswordForm` (React)

**Integracja API:**
- Supabase Auth (automatyczna walidacja tokenu)

**Mapowanie User Stories:** US-006

---

#### `/404` - Strona nie znaleziona
**Typ:** Static
**Główny cel:** Informacja o błędzie 404
**Kluczowe informacje:**
- Komunikat: "Strona nie znaleziona"
- Link do dashboardu lub strony głównej

**Kluczowe komponenty:**
- `BaseLayout.astro`
- Ilustracja/ikona błędu 404

---

#### `/403` - Brak uprawnień
**Typ:** Static
**Główny cel:** Informacja o braku dostępu
**Kluczowe informacje:**
- Komunikat: "Nie masz uprawnień do tej strony"
- Link do dashboardu

---

#### `/regulamin` - Regulamin
**Typ:** Static
**Główny cel:** Wyświetlenie regulaminu
**Kluczowe komponenty:**
- `BaseLayout.astro`
- Statyczna treść HTML

**Mapowanie User Stories:** US-008

---

#### `/polityka-prywatnosci` - Polityka Prywatności
**Typ:** Static
**Główny cel:** Wyświetlenie polityki prywatności
**Kluczowe komponenty:**
- `BaseLayout.astro`
- Statyczna treść HTML

**Mapowanie User Stories:** US-008

---

### 2.2. Widoki Właściciela

#### `/onboarding` - Kreator onboardingu
**Typ:** SSR
**Główny cel:** Przeprowadzenie nowego właściciela przez proces dodania pierwszego mieszkania i zaproszenia lokatora
**Kluczowe informacje:**
- **Krok 1/2:** Formularz dodawania mieszkania (Nazwa, Adres)
- **Krok 2/2:** Generowanie linku zapraszającego + kopiowanie do schowka
- Progress indicator: "Krok 1 z 2", "Krok 2 z 2"
- Brak możliwości opuszczenia kreatora (brak nawigacji globalnej)

**Kluczowe komponenty:**
- Dedykowany layout bez globalnej nawigacji
- `OnboardingWizard` (React) - multi-step form
- `ProgressIndicator` - wizualizacja kroków
- `ApartmentForm` - formularz mieszkania
- `InvitationLinkGenerator` - generowanie + kopiowanie linku

**UX/Accessibility:**
- Disabled przycisk "Dalej" dopóki formularz nie przejdzie walidacji
- Krok 2: Przycisk "Kopiuj" + tooltip "Skopiowano!"
- Komunikat instruktażowy: "Skopiuj link i wyślij go swojemu lokatorowi e-mailem lub SMS-em"
- Po zakończeniu: redirect na `/dashboard` + toast "Witaj w Rentflow!"

**Integracja API:**
- Krok 1: `POST /api/apartments` - dodanie mieszkania
- Krok 2: `POST /api/apartments/:id/invitations` - generowanie linku

**Mapowanie User Stories:** US-010, US-011, US-012

---

#### `/dashboard` - Dashboard właściciela
**Typ:** SSR
**Główny cel:** Wyświetlenie listy mieszkań właściciela z kluczowymi informacjami finansowymi
**Kluczowe informacje:**
- Lista mieszkań jako karty (grid)
- Każda karta: Nazwa, Adres, Status lokatora, Saldo (np. "Saldo: -2000 zł")
- Przycisk "Dodaj mieszkanie"
- Empty state: "Nie dodałeś jeszcze żadnych mieszkań" + CTA

**Kluczowe komponenty:**
- `DashboardLayout.astro` - layout z globalną nawigacją
- `ApartmentCard` - karta mieszkania (klikalna)
- `EmptyState` - komunikat + ilustracja
- `Button` (Shadcn/ui)

**UX/Accessibility:**
- Karty klikalne (cała powierzchnia = link)
- Hover state dla kart
- Grid responsywny: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- View Transition: fade animacja przy przejściu do szczegółów

**Integracja API:**
- `GET /api/dashboard` - lista mieszkań z podsumowaniem

**Mapowanie User Stories:** US-013, US-014, US-015

---

#### `/apartments/new` - Dodawanie mieszkania
**Typ:** SSR
**Główny cel:** Dodanie nowego mieszkania (poza kreatorem onboardingu)
**Kluczowe informacje:**
- Formularz: Nazwa, Adres
- Breadcrumb: "Dashboard > Dodaj mieszkanie"

**Kluczowe komponenty:**
- `DashboardLayout.astro`
- `ApartmentForm` (React)
- `Breadcrumbs`

**UX/Accessibility:**
- Po submit: redirect na `/dashboard` + toast "Mieszkanie zostało dodane"

**Integracja API:**
- `POST /api/apartments`

**Mapowanie User Stories:** US-015

---

#### `/apartments/[id]` - Szczegóły mieszkania
**Typ:** SSR
**Główny cel:** Zarządzanie pojedynczym mieszkaniem
**Kluczowe informacje:**
- Breadcrumb: "Dashboard > [Nazwa mieszkania]"
- Zakładki: **Opłaty** (domyślna), **Protokół Odbioru**, **Protokół Zwrotu**, **Ustawienia**
- Globalna nawigacja: Logo (→ dashboard), Breadcrumb, Menu użytkownika

**Kluczowe komponenty:**
- `DashboardLayout.astro`
- `Tabs` (Shadcn/ui) - zakładki
- `Breadcrumbs`
- Komponenty dla każdej zakładki (zobacz poniżej)

**UX/Accessibility:**
- Zakładki scrollowalne na mobile
- Domyślna zakładka: Opłaty (URL: `/apartments/[id]`)
- Protokoły: `/apartments/[id]#protokol-odbioru`, `/apartments/[id]#protokol-zwrotu`
- Ustawienia: `/apartments/[id]#ustawienia`

**Integracja API:**
- `GET /api/apartments/:id` - dane mieszkania

**Mapowanie User Stories:** US-018

---

#### `/apartments/[id]` - Zakładka "Opłaty"
**Główny cel:** Wyświetlenie listy opłat dla mieszkania
**Kluczowe informacje:**
- Grupowanie opłat po miesiącach (stałe sekcje, nie accordion)
- Nagłówek miesiąca: "Listopad 2025"
- Lista opłat: Typ, Data wymagalności, Kwota, Status (Badge), "Po terminie" (jeśli dotyczy)
- Przycisk "Dodaj opłatę"
- Empty state: "Brak dodanych opłat" + CTA

**Kluczowe komponenty:**
- `ChargeList` - grupowanie po miesiącach
- `ChargeCard` - pojedyncza opłata (klikalna → szczegóły)
- `ChargeStatusBadge` - wizualizacja statusu:
  - "Do opłacenia" - gray
  - "Częściowo opłacone" - yellow
  - "Opłacone" - green
  - "Po terminie" - red

**UX/Accessibility:**
- Sortowanie malejące (najnowszy miesiąc na górze)
- Lazy loading dla długich list
- Mobile: karty zamiast tabeli
- Kliknięcie na opłatę → `/charges/[id]`

**Integracja API:**
- `GET /api/apartments/:id/charges` - lista opłat zgrupowana po miesiącach

**Mapowanie User Stories:** US-023, US-024

---

#### `/apartments/[id]` - Zakładka "Protokół Odbioru"
**Główny cel:** Edycja protokołu odbioru mieszkania
**Kluczowe informacje:**
- Textarea - opis i ustalenia (stan liczników, usterki)
- Galeria zdjęć (max 10)
- Counter: "3/10 zdjęć"
- Przycisk "Dodaj zdjęcia" (multiple file input)
- Przycisk "Zapisz" (dla textarea)

**Kluczowe komponenty:**
- `ProtocolForm` (React)
- `ProtocolPhotoGallery` - grid z thumbnails + ikona "Usuń" na każdym zdjęciu
- `FormTextarea`, `FormFileUpload`

**UX/Accessibility:**
- Autosave textarea po 2s bezczynności (debounce) lub przycisk "Zapisz"
- Drag-and-drop dla zdjęć (opcjonalny nice-to-have)
- Progress bar dla uploadu zdjęć
- Kliknięcie na zdjęcie → otwiera w nowej karcie
- Potwierdzenie usunięcia zdjęcia (inline confirm, nie modal)

**Integracja API:**
- `GET /api/apartments/:id/protocols/move_in` - pobranie protokołu
- `PUT /api/apartments/:id/protocols/move_in` - zapis treści
- `POST /api/apartments/:id/protocols/move_in/photos` - upload zdjęcia
- `DELETE /api/apartments/:id/protocols/move_in/photos/:photoId` - usunięcie

**Mapowanie User Stories:** US-037, US-038, US-039, US-040, US-041, US-042

---

#### `/apartments/[id]` - Zakładka "Protokół Zwrotu"
**Główny cel:** Edycja protokołu zwrotu mieszkania
**Kluczowe informacje:**
- Identyczna struktura jak "Protokół Odbioru"
- Endpoint API: `.../protocols/move_out`

**Mapowanie User Stories:** US-037, US-038, US-039, US-040, US-041, US-042

---

#### `/apartments/[id]` - Zakładka "Ustawienia"
**Główny cel:** Zarządzanie mieszkaniem i lokatorami
**Kluczowe informacje:**
- Sekcja "Edycja mieszkania": Nazwa, Adres + przycisk "Zapisz zmiany"
- Sekcja "Lokator":
  - Jeśli brak lokatora: Przycisk "Zaproś lokatora" → generowanie linku
  - Jeśli lokator aktywny: Imię, Email + przycisk "Zakończ najem"
- Sekcja "Historia najemców" (lista poprzednich najmów)
- Sekcja "Usuń mieszkanie" (przycisk destructive)

**Kluczowe komponenty:**
- `ApartmentForm` - edycja danych
- `InvitationLinkGenerator` - generowanie linku (jak w onboardingu)
- `LeaseHistory` - lista historycznych najmów
- `AlertDialog` (Shadcn/ui) - potwierdzenie zakończenia najmu i usunięcia mieszkania

**UX/Accessibility:**
- Zakończ najem: Modal z komunikatem "Zakończenie najmu spowoduje archiwizację danych i cofnięcie lokatorowi dostępu. Kontynuować?" + przyciski "Anuluj" / "Zakończ najem"
- Usuń mieszkanie: Disabled jeśli są jakiekolwiek najmy (aktywne lub archiwalne)
- Błąd: "Aby usunąć mieszkanie, najpierw zakończ najem i usuń lokatora"

**Integracja API:**
- `PATCH /api/apartments/:id` - edycja mieszkania
- `POST /api/apartments/:id/invitations` - generowanie linku
- `GET /api/apartments/:id/invitations` - lista linków
- `POST /api/apartments/:id/lease/end` - zakończenie najmu
- `GET /api/apartments/:id/leases` - historia najmów
- `DELETE /api/apartments/:id` - usunięcie mieszkania

**Mapowanie User Stories:** US-016, US-017, US-019, US-020, US-021, US-022

---

#### `/charges/new?apartmentId=xxx` - Dodawanie opłaty
**Typ:** SSR
**Główny cel:** Dodanie nowej opłaty dla mieszkania
**Kluczowe informacje:**
- Breadcrumb: "Dashboard > [Nazwa mieszkania] > Dodaj opłatę"
- Formularz: Kwota (PLN), Data wymagalności, Typ (select), Komentarz (max 300), Załącznik (opcjonalny)

**Kluczowe komponenty:**
- `DashboardLayout.astro`
- `ChargeForm` (React)
- `FormInput`, `FormDatePicker`, `FormSelect`, `FormTextarea`, `FormFileUpload`

**Walidacja:**
- Kwota: >0, max 2 miejsca dziesiętne
- Data: wymagana
- Typ: wymagany (Czynsz/Rachunek/Inne)
- Komentarz: max 300 znaków
- Załącznik: 1 plik, PDF/JPG/PNG, max 5MB

**UX/Accessibility:**
- Po submit: redirect na `/apartments/[id]` + toast "Opłata została dodana"
- Preview załącznika: nazwa + ikona typu + przycisk "Usuń"

**Integracja API:**
- `POST /api/apartments/:id/charges` - dodanie opłaty
- `POST /api/charges/:id/attachment` - upload załącznika (jeśli jest)

**Mapowanie User Stories:** US-025, US-026

---

#### `/charges/[id]` - Szczegóły opłaty
**Typ:** SSR
**Główny cel:** Wyświetlenie i zarządzanie pojedynczą opłatą
**Kluczowe informacje:**
- Breadcrumb: "Dashboard > [Nazwa mieszkania] > Opłata #123"
- Przycisk "← Powrót"
- Dane opłaty: Kwota, Typ, Data wymagalności, Komentarz, Status (Badge)
- Załącznik (jeśli jest): nazwa + ikona + link do otwarcia (nowa karta)
- Sekcja "Wpłaty": lista wpłat (kwota, data) + suma + przycisk "Dodaj wpłatę"
- Przyciski akcji:
  - "Edytuj" (disabled jeśli status = "Opłacone")
  - "Usuń" (disabled jeśli status = "Opłacone")
  - "Dodaj wpłatę" (modal/drawer)

**Kluczowe komponenty:**
- `DashboardLayout.astro`
- `ChargeDetails` - wyświetlenie danych
- `PaymentList` - lista wpłat
- `PaymentForm` - formularz dodawania wpłaty (Dialog)
- `AlertDialog` - potwierdzenie usunięcia

**UX/Accessibility:**
- Edytuj: redirect na `/charges/[id]/edit`
- Usuń: modal potwierdzenia (jeśli ma wpłaty)
- Dodaj wpłatę: Dialog z formularzem (Kwota, Data)

**Integracja API:**
- `GET /api/charges/:id` - szczegóły opłaty + lista wpłat
- `DELETE /api/charges/:id` - usunięcie opłaty

**Mapowanie User Stories:** US-027, US-030, US-033, US-034

---

#### `/charges/[id]/edit` - Edycja opłaty
**Typ:** SSR
**Główny cel:** Edycja istniejącej opłaty
**Kluczowe informacje:**
- Breadcrumb: "Dashboard > [Nazwa mieszkania] > Edytuj opłatę"
- Formularz: jak w dodawaniu, wypełniony aktualnymi danymi
- Ograniczenia:
  - Nie można edytować jeśli status = "Opłacone"
  - Kwota nie może być niższa niż suma wpłat

**Kluczowe komponenty:**
- `DashboardLayout.astro`
- `ChargeForm` (React) - z danymi do edycji

**UX/Accessibility:**
- Po submit: redirect na `/charges/[id]` + toast "Opłata została zaktualizowana"
- Błąd walidacji kwoty: "Kwota opłaty nie może być niższa niż suma dokonanych wpłat (500.00 zł)"

**Integracja API:**
- `GET /api/charges/:id` - pobranie danych do edycji
- `PATCH /api/charges/:id` - zapis zmian

**Mapowanie User Stories:** US-027, US-028, US-029

---

#### Dialog "Dodaj wpłatę"
**Główny cel:** Dodanie wpłaty do opłaty
**Kluczowe informacje:**
- Modal/Dialog z formularzem
- Pola: Kwota, Data wpłaty
- Walidacja: kwota >0, nie może przekroczyć pozostałej kwoty do zapłaty

**Kluczowe komponenty:**
- `Dialog` (Shadcn/ui)
- `PaymentForm` (React)

**UX/Accessibility:**
- Focus trap w modalu
- Focus na pierwszym polu (Kwota) po otwarciu
- Po submit: zamknięcie modalu + refetch danych opłaty + toast "Wpłata została dodana"
- Automatyczne przeliczenie statusu opłaty

**Integracja API:**
- `POST /api/charges/:id/payments` - dodanie wpłaty

**Mapowanie User Stories:** US-033

---

### 2.3. Widoki Lokatora

#### `/dashboard` - Dashboard lokatora
**Typ:** SSR
**Główny cel:** Landing page lokatora z podsumowaniem finansowym
**Kluczowe informacje:**
- Nazwa i adres mieszkania
- Podsumowanie finansowe: "Łącznie do zapłaty: 2000 zł"
- Sekcje/karty prowadzące do:
  - Lista opłat
  - Protokół Odbioru
  - Protokół Zwrotu

**Kluczowe komponenty:**
- `DashboardLayout.astro`
- `TenantSummaryCard` - podsumowanie finansowe
- `Card` (Shadcn/ui) - karty z linkami do sekcji

**UX/Accessibility:**
- Karty klikalne
- Każda karta: ikona + tytuł + krótki opis
- Alternatywnie: zakładki jak właściciel, z dodatkową zakładką "Podsumowanie"

**Integracja API:**
- `GET /api/dashboard` - dane lokatora

**Mapowanie User Stories:** US-044

---

#### `/apartments/[id]` - Widok mieszkania lokatora
**Typ:** SSR
**Główny cel:** Dostęp do danych mieszkania (read-only)
**Kluczowe informacje:**
- Identyczna struktura jak właściciel
- Zakładki: **Opłaty**, **Protokół Odbioru**, **Protokół Zwrotu**
- Wszystkie dane tylko do odczytu
- Brak przycisków akcji (Dodaj, Edytuj, Usuń)

**Kluczowe komponenty:**
- `DashboardLayout.astro`
- `Tabs` (Shadcn/ui)
- Komponenty read-only dla każdej zakładki

**Mapowanie User Stories:** US-045, US-048

---

#### `/apartments/[id]` - Zakładka "Opłaty" (Lokator)
**Główny cel:** Wyświetlenie listy opłat (read-only)
**Kluczowe informacje:**
- Identyczna struktura jak właściciel
- Grupowanie po miesiącach, statusy, "Po terminie"
- Brak przycisku "Dodaj opłatę"
- Empty state: "Właściciel nie dodał jeszcze żadnych opłat"

**Kluczowe komponenty:**
- `ChargeList` - wersja read-only
- `ChargeCard` - bez akcji edycji/usunięcia

**Integracja API:**
- `GET /api/apartments/:id/charges` - lista opłat

**Mapowanie User Stories:** US-045, US-049

---

#### `/charges/[id]` - Szczegóły opłaty (Lokator)
**Typ:** SSR
**Główny cel:** Wyświetlenie szczegółów opłaty (read-only)
**Kluczowe informacje:**
- Wszystkie dane opłaty (jak właściciel)
- Komentarz właściciela
- Załącznik (do pobrania)
- Lista wpłat
- Brak przycisków akcji

**Kluczowe komponenty:**
- `DashboardLayout.astro`
- `ChargeDetails` - wersja read-only

**Integracja API:**
- `GET /api/charges/:id` - szczegóły opłaty

**Mapowanie User Stories:** US-046, US-047

---

#### `/apartments/[id]` - Zakładki "Protokół Odbioru/Zwrotu" (Lokator)
**Główny cel:** Wyświetlenie protokołów (read-only)
**Kluczowe informacje:**
- Textarea disabled (tylko do odczytu)
- Galeria zdjęć (klikalne, otwierają w nowej karcie)
- Brak przycisków "Dodaj zdjęcia", "Usuń"
- Empty state: "Protokół nie został jeszcze uzupełniony"

**Kluczowe komponenty:**
- `ProtocolView` - wersja read-only
- `ProtocolPhotoGallery` - bez akcji usuwania

**Integracja API:**
- `GET /api/apartments/:id/protocols/move_in` lub `.../move_out`

**Mapowanie User Stories:** US-048, US-049

---

## 3. Mapa podróży użytkownika

### 3.1. Podróż Właściciela

#### Scenariusz 1: Nowy właściciel (pierwszy raz)

```
START
  ↓
[/register] Rejestracja właściciela
  ↓ (submit formularza)
Supabase Auth → utworzenie konta
  ↓ (auto-login)
[/onboarding] Kreator onboardingu
  ↓
Krok 1/2: Dodaj mieszkanie (Nazwa, Adres)
  ↓ (submit)
POST /api/apartments → utworzenie mieszkania
  ↓
Krok 2/2: Wygeneruj link zapraszający
  ↓ (klik "Wygeneruj link")
POST /api/apartments/:id/invitations → link wygenerowany
  ↓ (klik "Kopiuj")
Link w schowku → właściciel wysyła link lokatorowi
  ↓ (klik "Zakończ")
Redirect na [/dashboard]
  ↓
[/dashboard] Widok listy mieszkań
  - Karta mieszkania: status "Oczekuje na lokatora"
KONIEC
```

#### Scenariusz 2: Dodanie opłaty i wpłaty

```
START: [/dashboard]
  ↓ (klik na kartę mieszkania)
[/apartments/[id]] Szczegóły mieszkania → zakładka "Opłaty"
  ↓ (klik "Dodaj opłatę")
[/charges/new?apartmentId=xxx] Formularz dodawania opłaty
  ↓ (wypełnienie: Kwota, Data, Typ, Komentarz, Załącznik)
  ↓ (submit)
POST /api/apartments/:id/charges → opłata utworzona
POST /api/charges/:id/attachment → upload załącznika (jeśli jest)
  ↓ (redirect + toast)
[/apartments/[id]] Zakładka "Opłaty"
  - Nowa opłata widoczna w liście, status "Do opłacenia"
  ↓ (lokator dokonuje wpłaty offline)
  ↓ (właściciel klika na opłatę)
[/charges/[id]] Szczegóły opłaty
  ↓ (klik "Dodaj wpłatę")
Dialog "Dodaj wpłatę" (Kwota, Data)
  ↓ (submit)
POST /api/charges/:id/payments → wpłata dodana
  ↓ (refetch + toast)
[/charges/[id]] Szczegóły opłaty
  - Status przeliczony: "Opłacone" (jeśli suma wpłat = kwota)
KONIEC
```

#### Scenariusz 3: Zakończenie najmu

```
START: [/apartments/[id]]
  ↓ (zakładka "Ustawienia")
Sekcja "Lokator": Anna Kowalska, anna@example.com
  ↓ (klik "Zakończ najem")
AlertDialog: "Zakończenie najmu spowoduje archiwizację danych i cofnięcie lokatorowi dostępu. Kontynuować?"
  ↓ (klik "Zakończ najem")
POST /api/apartments/:id/lease/end → najem zakończony
  ↓ (refetch + toast)
[/apartments/[id]] Zakładka "Ustawienia"
  - Status lokatora: "Brak lokatora"
  - Przycisk "Zaproś lokatora" aktywny
  - Historia najemców: Anna Kowalska dodana do listy
  ↓
Lokator traci dostęp do danych mieszkania
KONIEC
```

### 3.2. Podróż Lokatora

#### Scenariusz 1: Rejestracja przez link zapraszający

```
START
  ↓ (klik na link od właściciela)
[/register/tenant?token=xxx] Walidacja tokenu
  ↓ (GET /api/invitations/:token)
Token ważny → wyświetlenie formularza rejestracji
  - Informacja: "Zostałeś zaproszony do mieszkania [Nazwa] ([Adres])"
  ↓ (wypełnienie: Imię, Email, Hasło, Checkbox)
  ↓ (submit)
POST auth/signup → utworzenie konta lokatora
  ↓ (auto-login)
POST /api/invitations/:token/accept → powiązanie lokatora z mieszkaniem
  ↓ (redirect)
[/dashboard] Dashboard lokatora
  - Nazwa i adres mieszkania
  - Podsumowanie finansowe: "Łącznie do zapłaty: 0 zł"
KONIEC
```

#### Scenariusz 2: Przeglądanie opłat

```
START: [/dashboard] Dashboard lokatora
  ↓ (klik "Lista opłat")
[/apartments/[id]] Zakładka "Opłaty"
  - Lista opłat zgrupowana po miesiącach
  - Statusy, "Po terminie" (jeśli dotyczy)
  ↓ (klik na opłatę)
[/charges/[id]] Szczegóły opłaty (read-only)
  - Kwota, Typ, Data, Komentarz
  - Załącznik (klik → otwiera w nowej karcie)
  - Lista wpłat (jeśli są)
  ↓ (przycisk "← Powrót")
[/apartments/[id]] Zakładka "Opłaty"
KONIEC
```

#### Scenariusz 3: Przeglądanie protokołu

```
START: [/dashboard] Dashboard lokatora
  ↓ (klik "Protokół Odbioru")
[/apartments/[id]] Zakładka "Protokół Odbioru"
  - Treść protokołu (textarea disabled)
  - Galeria zdjęć (klikalne)
  ↓ (klik na zdjęcie)
Zdjęcie otwarte w nowej karcie
KONIEC
```

### 3.3. Podróże wspólne

#### Scenariusz: Logowanie

```
START
  ↓
[/login] Strona logowania
  ↓ (wypełnienie: Email, Hasło)
  ↓ (submit)
POST auth/token → JWT token
  ↓ (sprawdzenie roli użytkownika)
Middleware → GET /api/users/me
  ↓
Jeśli Owner → redirect na [/dashboard] (lista mieszkań)
Jeśli Tenant → redirect na [/dashboard] (podsumowanie lokatora)
KONIEC
```

#### Scenariusz: Resetowanie hasła

```
START
  ↓
[/login] → klik "Nie pamiętasz hasła?"
  ↓
[/reset-password] Formularz (Email)
  ↓ (submit)
POST auth/recover → email wysłany
  ↓ (komunikat)
"Jeśli konto istnieje, link został wysłany"
  ↓ (użytkownik klika link z emaila)
[/reset-password/confirm] Formularz (Nowe hasło, Powtórz)
  ↓ (submit)
Supabase Auth → hasło zmienione
  ↓ (redirect + toast)
[/login] "Hasło zostało zmienione. Zaloguj się ponownie."
KONIEC
```

---

## 4. Układ i struktura nawigacji

### 4.1. Nawigacja globalna (dla zalogowanych użytkowników)

#### Layout: `DashboardLayout.astro`

```
┌─────────────────────────────────────────────────────────┐
│ Header                                                  │
│ ┌───────────┬──────────────────────┬────────────────┐  │
│ │ Logo      │ Breadcrumbs          │ Menu użytk.    │  │
│ │ (→ dash)  │ Dashboard > [Nazwa]  │ ▼ Jan Kowalski │  │
│ └───────────┴──────────────────────┴────────────────┘  │
├─────────────────────────────────────────────────────────┤
│ Main Content                                            │
│                                                         │
│ [Zakładki / Treść widoku]                               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Footer                                                  │
│ Regulamin | Polityka Prywatności | pomoc@rentflow.pl   │
└─────────────────────────────────────────────────────────┘
```

**Elementy Header:**
- **Logo:** Kliknięcie → redirect na `/dashboard`
- **Breadcrumbs:** Hierarchia nawigacji (np. "Dashboard > Kawalerka na Woli > Opłata #123")
  - Każdy segment = link (poza ostatnim)
  - Mobile: zredukowane do "← [Ostatni segment]"
- **Menu użytkownika:** Dropdown (Shadcn `DropdownMenu`)
  - Imię użytkownika
  - Email
  - Link "Profil" (przyszłość - nie MVP)
  - Link "Wyloguj"

**Elementy Footer:**
- Linki do Regulaminu i Polityki Prywatności
- Email pomocy: `pomoc@rentflow.pl` (mailto:)

### 4.2. Nawigacja dla Właściciela

#### Dashboard (`/dashboard`)
```
Nawigacja: Logo | Menu użytkownika
Breadcrumb: [brak]
Akcje: Przycisk "Dodaj mieszkanie"
```

#### Szczegóły mieszkania (`/apartments/[id]`)
```
Nawigacja: Logo | Breadcrumb: "Dashboard > [Nazwa]" | Menu użytkownika
Zakładki (poziome):
  - Opłaty (domyślna)
  - Protokół Odbioru
  - Protokół Zwrotu
  - Ustawienia
Mobile: zakładki scrollowalne
```

#### Szczegóły opłaty (`/charges/[id]`)
```
Nawigacja: Logo | Breadcrumb: "Dashboard > [Nazwa] > Opłata #123" | Menu
Akcje:
  - Przycisk "← Powrót" (do listy opłat)
  - Przyciski: Edytuj, Usuń, Dodaj wpłatę
```

### 4.3. Nawigacja dla Lokatora

#### Dashboard (`/dashboard`)
```
Nawigacja: Logo | Menu użytkownika
Breadcrumb: [brak]
Sekcje/Karty:
  - Lista opłat → /apartments/[id]
  - Protokół Odbioru → /apartments/[id]#protokol-odbioru
  - Protokół Zwrotu → /apartments/[id]#protokol-zwrotu
```

#### Widok mieszkania (`/apartments/[id]`)
```
Nawigacja: Logo | Breadcrumb: "Dashboard > [Nazwa]" | Menu
Zakładki (poziome):
  - Opłaty (domyślna)
  - Protokół Odbioru
  - Protokół Zwrotu
Wszystkie widoki read-only
```

### 4.4. Nawigacja dla stron publicznych

#### Layout: `AuthLayout.astro`

```
┌─────────────────────────────────────────────────────────┐
│ Header (opcjonalny - tylko logo wycentrowane)           │
├─────────────────────────────────────────────────────────┤
│ Main Content (wycentrowany)                             │
│                                                         │
│ [Formularz logowania/rejestracji]                       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Footer                                                  │
│ Regulamin | Polityka Prywatności                        │
└─────────────────────────────────────────────────────────┘
```

**Strony:**
- `/login`
- `/register`
- `/register/tenant?token=xxx`
- `/reset-password`
- `/reset-password/confirm`

### 4.5. Responsywność nawigacji

#### Desktop (≥768px)
- Pełna nawigacja pozioma
- Breadcrumbs rozwinięte
- Zakładki poziome

#### Mobile (<768px)
- Logo + Hamburger menu (Shadcn `Sheet`)
- Breadcrumbs zredukowane: "← [Ostatni segment]"
- Zakładki scrollowalne poziomo
- Menu użytkownika: kliknięcie otwiera drawer

---

## 5. Kluczowe komponenty

### 5.1. Komponenty układu (Layout)

#### `BaseLayout.astro`
- Bazowy layout dla wszystkich stron
- Zawiera: `<head>`, `<ViewTransitions />`, podstawowe style
- Używany przez: strony statyczne (404, regulamin)

#### `AuthLayout.astro`
- Layout dla stron autoryzacji (login, register)
- Brak globalnej nawigacji
- Wycentrowana karta z formularzem
- Footer z linkami do stron prawnych

#### `DashboardLayout.astro`
- Layout dla zalogowanych użytkowników
- Globalna nawigacja: Header (Logo, Breadcrumbs, Menu użytkownika) + Footer
- Slot dla treści głównej
- Middleware sprawdza sesję

### 5.2. Komponenty nawigacyjne

#### `Header.tsx` (React)
- Logo (link do dashboard)
- Breadcrumbs
- Menu użytkownika (DropdownMenu z Shadcn)

#### `Breadcrumbs.tsx` (React)
- Wyświetlanie hierarchii nawigacji
- Responsive: pełne na desktop, zredukowane na mobile
- Każdy segment = link (oprócz ostatniego)

#### `Footer.tsx` (React lub Astro)
- Linki do Regulaminu, Polityki Prywatności
- Email pomocy: `pomoc@rentflow.pl`

### 5.3. Komponenty formularzy (Reużywalne)

#### `FormInput.tsx`
- Input z label, error message, ikona (opcjonalna)
- Integracja z React Hook Form
- Props: name, label, type, placeholder, icon

#### `FormTextarea.tsx`
- Textarea z label, error message, counter (opcjonalny)
- Props: name, label, maxLength, rows

#### `FormSelect.tsx`
- Select dropdown z label, error message
- Props: name, label, options (array)

#### `FormDatePicker.tsx`
- Date picker (Shadcn Calendar + Popover)
- Props: name, label

#### `FormFileUpload.tsx`
- File input + preview (nazwa, ikona typu, przycisk usuń)
- Walidacja: MIME type, rozmiar
- Props: name, label, accept, maxSize, multiple
- Opcjonalny: drag-and-drop

### 5.4. Komponenty domenowe (Feature-specific)

#### Apartments

**`ApartmentCard.tsx`**
- Karta mieszkania na dashboardzie właściciela
- Props: apartment (nazwa, adres, status lokatora, saldo)
- Klikalna → redirect na `/apartments/[id]`
- Shadcn `Card` + hover state

**`ApartmentForm.tsx`**
- Formularz dodawania/edycji mieszkania
- Pola: Nazwa, Adres
- React Hook Form + Zod validation

**`ApartmentList.tsx`**
- Lista mieszkań (grid responsywny)
- Empty state: "Nie dodałeś jeszcze żadnych mieszkań" + CTA

#### Charges

**`ChargeCard.tsx`**
- Karta pojedynczej opłaty na liście
- Props: charge (typ, kwota, data, status)
- Klikalna → redirect na `/charges/[id]`
- Badge dla statusu

**`ChargeForm.tsx`**
- Formularz dodawania/edycji opłaty
- Pola: Kwota, Data, Typ, Komentarz, Załącznik
- React Hook Form + Zod

**`ChargeList.tsx`**
- Lista opłat zgrupowana po miesiącach
- Props: charges (array), readOnly (boolean)
- Stałe sekcje (nie accordion)
- Empty state dla właściciela: CTA, dla lokatora: komunikat

**`ChargeStatusBadge.tsx`**
- Badge z kolorem statusu
- Props: status ("unpaid", "partially_paid", "paid"), isOverdue (boolean)
- Kolory:
  - "Do opłacenia" - gray
  - "Częściowo opłacone" - yellow
  - "Opłacone" - green
  - "Po terminie" - red (destructive)

**`ChargeDetails.tsx`**
- Wyświetlenie szczegółów opłaty
- Props: charge, readOnly
- Sekcje: Dane opłaty, Załącznik (jeśli jest), Lista wpłat

#### Payments

**`PaymentForm.tsx`**
- Formularz dodawania/edycji wpłaty
- Pola: Kwota, Data
- React Hook Form + Zod
- Używany w Dialog

**`PaymentList.tsx`**
- Lista wpłat dla opłaty
- Props: payments (array), totalPaid, readOnly
- Wyświetla sumę wpłat

#### Protocols

**`ProtocolForm.tsx`**
- Formularz edycji protokołu (właściciel)
- Textarea + galeria zdjęć
- Props: protocolType ("move_in" | "move_out"), apartmentId

**`ProtocolView.tsx`**
- Widok protokołu (read-only dla lokatora)
- Props: protocol (description, photos)

**`ProtocolPhotoGallery.tsx`**
- Grid zdjęć protokołu
- Props: photos (array), readOnly, onDelete, onUpload
- Counter: "X/10 zdjęć"
- Thumbnail + ikona "Usuń" (jeśli !readOnly)
- Opcjonalny drag-and-drop

#### Leases

**`InvitationLinkGenerator.tsx`**
- Komponent generowania linku zapraszającego
- Przycisk "Wygeneruj link" → POST /api/apartments/:id/invitations
- Wyświetlenie linku + przycisk "Kopiuj" → schowek
- Tooltip "Skopiowano!"

**`LeaseHistory.tsx`**
- Lista historycznych najmów
- Props: leases (array)
- Każdy najem: Imię lokatora, daty, klik → widok archiwalny (read-only)

### 5.5. Komponenty UI (Shadcn/ui)

Kluczowe komponenty Shadcn używane w projekcie:

- **Button** - wszystkie akcje (submit, cancel, CTA)
- **Card, CardHeader, CardContent, CardFooter** - karty mieszkań, opłat
- **Dialog, AlertDialog** - modals, potwierdzenia
- **Form, FormField, FormItem, FormLabel, FormControl, FormMessage** - formularze
- **Input, Textarea** - pola formularzy
- **Select, SelectTrigger, SelectContent, SelectItem** - dropdowns
- **Tabs, TabsList, TabsTrigger, TabsContent** - zakładki szczegółów mieszkania
- **Badge** - statusy opłat
- **DropdownMenu** - menu użytkownika
- **Toast / Sonner** - powiadomienia
- **Tooltip** - podpowiedzi (np. "Skopiowano!")
- **Calendar, Popover** - date picker
- **Sheet** - mobile drawer (hamburger menu)
- **Separator** - wizualne oddzielenie sekcji
- **Skeleton** - loading states (opcjonalnie, decyzja: tylko spinner)

### 5.6. Komponenty pomocnicze

#### `EmptyState.tsx`
- Komponent dla pustych stanów
- Props: title, description, actionLabel, actionHref, illustration
- Wersje: dla właściciela (z CTA), dla lokatora (bez CTA)

#### `LoadingSpinner.tsx`
- Spinner dla stanów ładowania
- Props: size ("sm" | "md" | "lg"), text (opcjonalny)

#### `ErrorMessage.tsx`
- Wyświetlenie błędu API (toast lub inline)
- Props: error (message, details)

#### `ConfirmDialog.tsx`
- Wrapper dla AlertDialog z confirm/cancel
- Props: title, description, onConfirm, confirmLabel, cancelLabel

---

## 6. Zarządzanie stanem i integracja z API

### 6.1. Strategia zarządzania stanem

#### Globalny stan użytkownika
- **UserContext** (React Context API)
- Przechowuje: user (id, email, full_name, role), isAuthenticated
- Provider w `DashboardLayout.astro`
- Inicjalizacja: GET /api/users/me (middleware)

#### Lokalny stan komponentów
- React `useState` dla stanów UI (open/close modals, form inputs)
- React Hook Form dla stanów formularzy

#### Shared state między islands
- **Nano Stores** (zalecane przez Astro)
- Przypadki użycia: toast notifications, breadcrumb state

#### Brak optimistic updates
- Wszystkie operacje czekają na odpowiedź z API
- Loading states: disabled buttons + spinner

### 6.2. Strategia komunikacji z API

#### Fetch pattern
```typescript
// W React components
const handleSubmit = async (data) => {
  setIsLoading(true);
  try {
    const response = await fetch('/api/apartments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const result = await response.json();
    toast.success('Mieszkanie zostało dodane');
    router.push('/dashboard');
  } catch (error) {
    toast.error(error.message);
  } finally {
    setIsLoading(false);
  }
};
```

#### Refetch po akcjach
- Po dodaniu/edycji/usunięciu: refetch danych z API
- Używać `window.location.reload()` lub dedykowanego refetch z biblioteki (jeśli będzie)

### 6.3. Obsługa błędów API

#### Strategia zróżnicowana według typu błędu

**400 - Validation Error**
- Wyświetlenie inline pod polami formularza
- Zod errors z API → mapowanie na pola formularza
- Czerwone ramki + komunikaty pod polami

**401 - Unauthorized**
- Middleware → redirect na `/login?redirect=/current-path`
- Toast: "Sesja wygasła. Zaloguj się ponownie."

**403 - Forbidden**
- Redirect na `/403` (dedykowana strona)
- Komunikat: "Nie masz uprawnień do tej strony"

**404 - Not Found**
- Redirect na `/404` lub empty state (zależy od kontekstu)
- Komunikat: "Nie znaleziono zasobu"

**409 - Conflict**
- Toast notification z komunikatem biznesowym
- Przykład: "To mieszkanie ma już aktywnego lokatora"

**413 - Payload Too Large**
- Toast: "Rozmiar pliku nie może przekraczać 5MB"

**500 - Internal Server Error**
- Toast: "Wystąpił błąd serwera. Spróbuj ponownie lub skontaktuj się z pomocą (pomoc@rentflow.pl)"

### 6.4. Loading states

#### Formularze
- Submit button: disabled + spinner + "Zapisywanie..."
- Wszystkie pola disabled podczas submitu

#### Listy z lazy loading
- Spinner na dole listy podczas ładowania kolejnych danych

#### File upload
- Progress bar (0-100%)
- Disabled przycisk "Dodaj zdjęcia" podczas uploadu

#### Strony
- Brak skeleton screens (decyzja z session notes)
- Tylko spinner (jeśli potrzeba)

---

## 7. Responsywność i Accessibility

### 7.1. Breakpoints (Tailwind CSS)

```
sm:  640px   - małe tablety (portrait)
md:  768px   - tablety (landscape)
lg:  1024px  - małe laptopy
xl:  1280px  - desktopy
2xl: 1536px  - duże desktopy
```

### 7.2. Mobile-First Design (min. 360px)

#### Dashboard
- Karty mieszkań: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Single column na mobile

#### Lista opłat
- Desktop: tabela lub lista kart (2 kolumny)
- Mobile: karty (1 kolumna)

#### Formularze
- Wszystkie inputs: `w-full`
- Stack wertykalnie na mobile
- Przycisk submit: `w-full` na mobile

#### Nawigacja
- Desktop: pozioma (logo + breadcrumbs + menu)
- Mobile: logo + hamburger (Sheet) + menu drawer

#### Zakładki
- Desktop: poziome (pełne nazwy)
- Mobile: scrollowalne (TabsList z `overflow-x-auto`)

#### Modals
- Desktop: centered, max-width (lg, xl)
- Mobile: full screen (h-full, max-h-full)

#### Breadcrumbs
- Desktop: pełne ("Dashboard > Kawalerka > Opłata #123")
- Mobile: zredukowane ("← Opłata #123")

### 7.3. Accessibility (WCAG 2.1 AA)

#### Keyboard Navigation
- **Tab order:** logiczny (top-to-bottom, left-to-right)
- **Focus visible:** outline/ring dla wszystkich interaktywnych elementów
- **Enter:** submittuje formularze
- **Escape:** zamyka modals
- **Skip links:** "Pomiń do treści głównej" (hidden, visible on focus)

#### ARIA Landmarks
```html
<header role="banner">...</header>
<nav role="navigation">...</nav>
<main role="main">...</main>
<footer role="contentinfo">...</footer>
```

#### ARIA dla komponentów

**Modals (Dialog)**
```html
<div role="dialog" aria-labelledby="dialog-title" aria-describedby="dialog-description">
  <h2 id="dialog-title">Tytuł</h2>
  <p id="dialog-description">Opis</p>
</div>
```

**Buttons**
- Icon-only buttons: `aria-label="Usuń zdjęcie"`
- Loading state: `aria-busy="true"`, `aria-live="polite"` dla tekstu "Zapisywanie..."

**Form fields**
```html
<label for="email">Email</label>
<input id="email" aria-invalid="true" aria-describedby="email-error" />
<span id="email-error" role="alert">Nieprawidłowy format email</span>
```

**Live regions**
- Toast notifications: `aria-live="polite"`, `role="status"`
- Error messages: `role="alert"`

#### Focus Management

**Modals**
- Po otwarciu: focus na pierwszym interaktywnym elemencie (input lub przycisk "Anuluj")
- Focus trap: użytkownik nie może opuścić modala przez Tab
- Po zamknięciu: focus wraca do trigger element (Shadcn Dialog automatycznie)

**Form errors**
- Po submit z błędami: focus na pierwszym błędnym polu
- Announce error: screen reader odczytuje komunikat błędu

**Po submit sukcesu**
- Focus na success message (toast) lub pierwszy input (jeśli clear form)

#### Alt text i Labels

**Zdjęcia protokołów**
```html
<img src="..." alt="Zdjęcie 1 z protokołu odbioru - stan mieszkania" />
```

**Form inputs**
- Zawsze `<label>` powiązany z `<input>` (nie tylko placeholder)
- Dla icon-only buttons: `aria-label`

#### Screen Readers

**Loading states**
- Announce: "Zapisywanie..." (`aria-live="polite"`)
- Disabled submit button: `aria-disabled="true"`

**Dynamic content**
- Lista opłat po dodaniu nowej: `aria-live="polite"` dla komunikatu "Opłata została dodana"

**Empty states**
- Komunikat dostępny dla screen readers (nie tylko wizualnie)

---

## 8. Bezpieczeństwo UI

### 8.1. Autoryzacja (Middleware Astro)

#### Chronione routes
Wszystkie routes poza publicznymi wymagają autoryzacji:
```typescript
// src/middleware/index.ts
export const onRequest = async (context, next) => {
  const publicPaths = ['/login', '/register', '/reset-password', '/regulamin', '/polityka-prywatnosci', '/404'];

  if (publicPaths.includes(context.url.pathname)) {
    return next();
  }

  const session = await context.locals.supabase.auth.getSession();

  if (!session) {
    return context.redirect(`/login?redirect=${context.url.pathname}`);
  }

  return next();
};
```

#### Sprawdzanie roli
- Middleware pobiera `GET /api/users/me` → user.role
- Owner może dostać się do widoków właściciela
- Tenant może dostać się tylko do widoków read-only
- Próba dostępu Tenant do owner-only route → 403

### 8.2. Input Sanitization

#### Client-side
- React automatic escaping (XSS protection)
- Walidacja Zod przed wysłaniem do API
- File upload: MIME type validation (nie tylko extension)

#### Server-side
- Walidacja Zod w API routes
- Supabase prepared statements (SQL injection protection)

### 8.3. File Upload Security

#### Walidacja
- **MIME type:** sprawdzenie typu pliku (nie tylko rozszerzenia)
- **Rozmiar:** max 5MB dla pojedynczego pliku
- **Format:** tylko PDF/JPG/PNG (opłaty), JPG/PNG (protokoły)

#### Storage (Supabase)
- Buckety: `charge-attachments`, `protocol-photos`
- RLS policies:
  - Owner: upload/read/delete swoich plików
  - Tenant: read-only plików swojego mieszkania
- Signed URLs z expiration dla bezpiecznego dostępu

### 8.4. HTTPS i Cookies

#### Produkcja
- **HTTPS tylko** (Let's Encrypt)
- **Secure cookies:** HttpOnly, Secure, SameSite=Strict
- **CSRF protection:** Astro built-in

#### CORS
```javascript
const corsOptions = {
  origin: process.env.PUBLIC_APP_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
```

---

## 9. View Transitions

### 9.1. Konfiguracja

#### Layout z View Transitions
```astro
---
// DashboardLayout.astro
import { ViewTransitions } from 'astro:transitions';
---

<html>
  <head>
    <ViewTransitions />
  </head>
  <body>
    <slot />
  </body>
</html>
```

### 9.2. Animowane przejścia (200-300ms)

#### Dashboard → Szczegóły mieszkania
```astro
<!-- Dashboard: karta mieszkania -->
<div transition:name={`apartment-${apartment.id}`}>
  <ApartmentCard apartment={apartment} />
</div>

<!-- Szczegóły mieszkania -->
<div transition:name={`apartment-${apartment.id}`}>
  <h1>{apartment.name}</h1>
</div>
```
- Efekt: smooth fade/slide

#### Lista opłat → Szczegóły opłaty
```astro
<div transition:name={`charge-${charge.id}`}>
  <ChargeCard charge={charge} />
</div>
```

#### Przełączanie zakładek
- Zakładki z `transition:animate="slide"`
- Subtelna animacja przy zmianie contentu

### 9.3. Instant (bez animacji)

#### Submit formularzy + redirects
```typescript
// Po submit formularza
router.push('/dashboard'); // instant redirect
```

#### Nawigacja wstecz
- Przycisk "← Powrót" → instant (bez animacji)

#### Logowanie/wylogowanie
- Redirect po login/logout → instant

---

## 10. Przypadki brzegowe i stany błędów

### 10.1. Empty States

#### Właściciel

**Brak mieszkań (Dashboard)**
- Komunikat: "Nie dodałeś jeszcze żadnych mieszkań"
- Ilustracja/ikona
- Przycisk: "Dodaj swoje pierwsze mieszkanie"

**Brak opłat (Lista opłat)**
- Komunikat: "Brak dodanych opłat"
- Przycisk: "Dodaj pierwszą opłatę"

**Pusty protokół**
- Bezpośrednio formularz (textarea + "Dodaj zdjęcia")
- Brak osobnego empty state

#### Lokator

**Brak opłat**
- Komunikat: "Właściciel nie dodał jeszcze żadnych opłat"
- Brak przycisku (read-only)

**Pusty protokół**
- Komunikat: "Protokół nie został jeszcze uzupełniony"
- Brak formularza

### 10.2. Wygasły link zapraszający

#### Scenariusz
- Lokator klika na link, który został już użyty lub wygasł
- GET `/api/invitations/:token` → 400 Invalid Token

#### UI
- Redirect na dedykowaną stronę: `/invitation-expired`
- Komunikat: "Ten link zapraszający wygasł lub został już wykorzystany"
- Instrukcja: "Poproś właściciela o wygenerowanie nowego linku zapraszającego"
- Przycisk: "Wróć do strony głównej"

**Mapowanie User Stories:** US-050

### 10.3. Próba rejestracji lokatora bez linku

#### Scenariusz
- Użytkownik wpisuje URL `/register/tenant` bez parametru `?token=xxx`

#### UI
- Redirect na `/login` lub `/404`
- Komunikat: "Nieprawidłowy link zapraszający"

**Mapowanie User Stories:** US-051

### 10.4. Utrata dostępu przez lokatora

#### Scenariusz
- Właściciel zakończył najem (POST `/api/apartments/:id/lease/end`)
- Lokator próbuje się zalogować

#### UI
- Middleware sprawdza aktywny najem
- Jeśli brak: komunikat na dashboardzie lokatora
- "Najem dla tego mieszkania został zakończony. Skontaktuj się z właścicielem."
- Brak dostępu do danych mieszkania

**Mapowanie User Stories:** US-052, US-597

### 10.5. Ograniczenie: jeden lokator na mieszkanie

#### Scenariusz 1: Właściciel próbuje zaprosić drugiego lokatora
- Przycisk "Zaproś lokatora" disabled
- Tooltip: "To mieszkanie ma już aktywnego lokatora"
- Konieczne zakończenie najmu przed nowym zaproszeniem

#### Scenariusz 2: Lokator próbuje przyjąć drugie zaproszenie
- Lokator klika nowy link zapraszający
- POST `/api/invitations/:token/accept` → 400 Bad Request
- Toast: "Twoje konto jest już przypisane do aktywnego najmu. Aby przyjąć nowe zaproszenie, poprzedni najem musi zostać zakończony przez właściciela."

**Mapowanie User Stories:** US-053

### 10.6. Ograniczenia edycji opłaty

#### Scenariusz 1: Edycja opłaty "Opłacone"
- Przycisk "Edytuj" disabled lub ukryty
- Tooltip: "Nie można edytować w pełni opłaconej opłaty"

#### Scenariusz 2: Zmniejszenie kwoty poniżej sumy wpłat
- Formularz edycji: walidacja pola "Kwota"
- Błąd inline: "Kwota opłaty nie może być niższa niż suma dokonanych wpłat (500.00 zł)"

**Mapowanie User Stories:** US-028, US-029

### 10.7. Usunięcie mieszkania z najmami

#### Scenariusz
- Właściciel próbuje usunąć mieszkanie, które ma aktywnego lub archiwalnego lokatora
- DELETE `/api/apartments/:id` → 400 Bad Request

#### UI
- Przycisk "Usuń mieszkanie" disabled
- Tooltip: "Aby usunąć mieszkanie, najpierw zakończ najem i usuń lokatora"

**Mapowanie User Stories:** US-017

### 10.8. Limit zdjęć w protokole

#### Scenariusz
- Właściciel próbuje dodać 11. zdjęcie do protokołu
- POST `/api/apartments/:id/protocols/:type/photos` → 400 Bad Request

#### UI
- Przycisk "Dodaj zdjęcia" disabled jeśli counter = 10/10
- Tooltip: "Nie można dodać więcej niż 10 zdjęć do protokołu"
- Komunikat błędu (jeśli mimo to próba uploadu): Toast "Nie można dodać więcej niż 10 zdjęć do protokołu"

**Mapowanie User Stories:** US-040

### 10.9. Wygasła sesja

#### Scenariusz
- Użytkownik jest zalogowany, ale JWT token wygasł
- API zwraca 401 Unauthorized

#### UI
- Modal: "Sesja wygasła. Zaloguj się ponownie."
- Przycisk: "Zaloguj ponownie" → redirect na `/login?redirect=/current-path`

### 10.10. Błąd serwera (500)

#### Scenariusz
- Nieoczekiwany błąd po stronie backendu
- API zwraca 500 Internal Server Error

#### UI
- Toast: "Wystąpił błąd serwera. Spróbuj ponownie lub skontaktuj się z pomocą (pomoc@rentflow.pl)"
- Formularz pozostaje wypełniony (użytkownik nie traci danych)

---

## 11. Mapowanie User Stories na widoki UI

### Uwierzytelnianie i Dostęp

| User Story | Widoki | Komponenty | Endpointy API |
|------------|--------|------------|---------------|
| US-001: Rejestracja Właściciela | `/register` | `RegisterForm`, `Checkbox` | `POST auth/signup` |
| US-002: Rejestracja Lokatora | `/register/tenant?token=xxx` | `TenantRegisterForm`, Alert | `GET /api/invitations/:token`, `POST auth/signup`, `POST /api/invitations/:token/accept` |
| US-003: Logowanie | `/login` | `LoginForm` | `POST auth/token` |
| US-004: Wylogowanie | Menu użytkownika → "Wyloguj" | `DropdownMenu` | Supabase Auth |
| US-005: Inicjacja resetowania hasła | `/reset-password` | `ResetPasswordForm` | `POST auth/recover` |
| US-006: Ustawienie nowego hasła | `/reset-password/confirm` | `NewPasswordForm` | Supabase Auth |
| US-007: Walidacja formularzy | Wszystkie formularze | React Hook Form + Zod | - |
| US-008: Strony prawne | `/regulamin`, `/polityka-prywatnosci` | Statyczne HTML | - |
| US-009: Pomoc | Footer: `pomoc@rentflow.pl` | `Footer` | - |

### Onboarding Właściciela

| User Story | Widoki | Komponenty | Endpointy API |
|------------|--------|------------|---------------|
| US-010: Kreator onboardingu | `/onboarding` | `OnboardingWizard`, `ProgressIndicator` | - |
| US-011: Krok 1 - Dodaj mieszkanie | `/onboarding` krok 1/2 | `ApartmentForm` | `POST /api/apartments` |
| US-012: Krok 2 - Zaproś lokatora | `/onboarding` krok 2/2 | `InvitationLinkGenerator` | `POST /api/apartments/:id/invitations` |

### Zarządzanie Mieszkaniami

| User Story | Widoki | Komponenty | Endpointy API |
|------------|--------|------------|---------------|
| US-013: Lista mieszkań | `/dashboard` | `ApartmentList`, `ApartmentCard` | `GET /api/dashboard` |
| US-014: Pusty stan | `/dashboard` (brak mieszkań) | `EmptyState` | - |
| US-015: Dodanie mieszkania | `/apartments/new` | `ApartmentForm` | `POST /api/apartments` |
| US-016: Edycja mieszkania | `/apartments/[id]` → zakładka Ustawienia | `ApartmentForm` | `PATCH /api/apartments/:id` |
| US-017: Usunięcie mieszkania | `/apartments/[id]` → zakładka Ustawienia | `AlertDialog` | `DELETE /api/apartments/:id` |
| US-018: Szczegóły mieszkania | `/apartments/[id]` | `Tabs` | `GET /api/apartments/:id` |

### Zarządzanie Najmem

| User Story | Widoki | Komponenty | Endpointy API |
|------------|--------|------------|---------------|
| US-019: Generowanie linku (panel) | `/apartments/[id]` → Ustawienia | `InvitationLinkGenerator` | `POST /api/apartments/:id/invitations` |
| US-020: Status lokatora | `/apartments/[id]` → Ustawienia | Sekcja "Lokator" | `GET /api/apartments/:id/lease` |
| US-021: Zakończenie najmu | `/apartments/[id]` → Ustawienia | `AlertDialog` | `POST /api/apartments/:id/lease/end` |
| US-022: Historia najemców | `/apartments/[id]` → Ustawienia | `LeaseHistory` | `GET /api/apartments/:id/leases` |

### Zarządzanie Opłatami

| User Story | Widoki | Komponenty | Endpointy API |
|------------|--------|------------|---------------|
| US-023: Lista opłat | `/apartments/[id]` → zakładka Opłaty | `ChargeList`, `ChargeCard` | `GET /api/apartments/:id/charges` |
| US-024: Pusty stan opłat | `/apartments/[id]` → Opłaty (brak) | `EmptyState` | - |
| US-025: Dodanie opłaty | `/charges/new?apartmentId=xxx` | `ChargeForm` | `POST /api/apartments/:id/charges` |
| US-026: Walidacja opłaty | `/charges/new`, `/charges/[id]/edit` | React Hook Form + Zod | - |
| US-027: Edycja opłaty | `/charges/[id]/edit` | `ChargeForm` | `PATCH /api/charges/:id` |
| US-028: Ograniczenie edycji (opłacone) | `/charges/[id]` | Disabled button | - |
| US-029: Ograniczenie kwoty | `/charges/[id]/edit` | Zod validation | - |
| US-030: Usunięcie opłaty | `/charges/[id]` | `AlertDialog` | `DELETE /api/charges/:id` |
| US-031: Automatyczny status | Wszystkie widoki opłat | `ChargeStatusBadge` | API (computed) |
| US-032: "Po terminie" | Wszystkie widoki opłat | `ChargeStatusBadge` (red) | API (computed) |
| US-033: Dodanie wpłaty | `/charges/[id]` → Dialog | `PaymentForm`, `Dialog` | `POST /api/charges/:id/payments` |
| US-034: Lista wpłat | `/charges/[id]` | `PaymentList` | `GET /api/charges/:id` (included) |
| US-035: Edycja wpłaty | `/charges/[id]` → lista wpłat | `PaymentForm` (inline edit) | `PATCH /api/payments/:id` |
| US-036: Usunięcie wpłaty | `/charges/[id]` → lista wpłat | Inline confirm | `DELETE /api/payments/:id` |

### Zarządzanie Protokołami

| User Story | Widoki | Komponenty | Endpointy API |
|------------|--------|------------|---------------|
| US-037: Zakładki protokołów | `/apartments/[id]` | `Tabs` | - |
| US-038: Pusty protokół | `/apartments/[id]` → Protokół Odbioru/Zwrotu | `ProtocolForm` (pusty) | - |
| US-039: Edycja treści | `/apartments/[id]` → Protokół Odbioru/Zwrotu | `FormTextarea` | `PUT /api/apartments/:id/protocols/:type` |
| US-040: Dodawanie zdjęć | `/apartments/[id]` → Protokół Odbioru/Zwrotu | `ProtocolPhotoGallery`, `FormFileUpload` | `POST /api/apartments/:id/protocols/:type/photos` |
| US-041: Usuwanie zdjęć | `/apartments/[id]` → Protokół Odbioru/Zwrotu | Ikona "Usuń" w galerii | `DELETE /api/apartments/:id/protocols/:type/photos/:photoId` |
| US-042: Wyświetlanie plików | Wszystkie widoki z załącznikami | Link (nowa karta) | Supabase Storage signed URL |

### Widok Lokatora

| User Story | Widoki | Komponenty | Endpointy API |
|------------|--------|------------|---------------|
| US-043: Rejestracja przez link | `/register/tenant?token=xxx` | `TenantRegisterForm` | `GET /api/invitations/:token`, `POST /api/invitations/:token/accept` |
| US-044: Dashboard lokatora | `/dashboard` | `TenantSummaryCard` | `GET /api/dashboard` |
| US-045: Lista opłat (read-only) | `/apartments/[id]` → Opłaty | `ChargeList` (readOnly) | `GET /api/apartments/:id/charges` |
| US-046: Szczegóły opłaty (read-only) | `/charges/[id]` | `ChargeDetails` (readOnly) | `GET /api/charges/:id` |
| US-047: Widok wpłat (read-only) | `/charges/[id]` | `PaymentList` (readOnly) | `GET /api/charges/:id` |
| US-048: Protokoły (read-only) | `/apartments/[id]` → Protokoły | `ProtocolView` | `GET /api/apartments/:id/protocols/:type` |
| US-049: Pusty stan (lokator) | Wszystkie widoki lokatora (brak danych) | `EmptyState` (bez CTA) | - |

### Przypadki Brzegowe

| User Story | Widoki | Komponenty | Endpointy API |
|------------|--------|------------|---------------|
| US-050: Wygasły link | `/invitation-expired` | Komunikat + link | `GET /api/invitations/:token` (400) |
| US-051: Rejestracja bez linku | `/register/tenant` → redirect | - | - |
| US-052: Utrata dostępu lokatora | `/dashboard` (lokator) | Komunikat | Middleware check |
| US-053: Jeden lokator | Toast notification | - | `POST /api/invitations/:token/accept` (400) |
| US-054: Responsywność | Wszystkie widoki | RWD (Tailwind) | - |

---

## 12. Podsumowanie

Architektura UI dla Rentflow MVP została zaprojektowana z myślą o:

1. **Prostocie użytkowania:** "Maksymalnie dużo za maksymalnie prostą obsługę"
   - Minimalistyczny interfejs
   - Jasna hierarchia informacji
   - Empty states z CTA (właściciel) lub komunikatami (lokator)

2. **Rozdzieleniu ról:** Właściciel (CRUD) vs Lokator (read-only)
   - Wspólne komponenty z props `readOnly`
   - Różne dashboardy i przepływy

3. **Responsywności:** Mobile-first od 360px
   - Grid responsywny dla kart
   - Hamburger menu na mobile
   - Zakładki scrollowalne

4. **Dostępności:** WCAG 2.1 AA
   - Keyboard navigation
   - ARIA landmarks i attributes
   - Focus management

5. **Bezpieczeństwie:**
   - Middleware sprawdza autoryzację
   - RLS policies w Supabase
   - Input sanitization (Zod + React escaping)

6. **Integracji z API:**
   - Brak optimistic updates
   - Loading states (spinner + disabled buttons)
   - Obsługa błędów (inline, toast, dedykowane strony)

7. **Skalowalności:**
   - Reużywalne komponenty formularzy
   - Shared Zod schemas
   - Nano Stores dla shared state

Dokument zawiera kompletną mapę wszystkich widoków, komponentów i przepływów użytkownika, gotową do implementacji zgodnie ze stackiem: Astro 5 + React 19 + TypeScript 5 + Tailwind CSS 4 + Shadcn/ui + Supabase.
