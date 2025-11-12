# Rentflow - AI Development Context

## Przegląd Projektu

Rentflow to aplikacja internetowa (RWD) w wersji MVP, zaprojektowana w celu radykalnego uproszczenia relacji między właścicielami mieszkań na wynajem a ich lokatorami.

### Główne cele
- Scentralizowane narzędzie do komunikacji
- Zarządzanie opłatami i wpłatami
- Przechowywanie kluczowej dokumentacji (protokoły zdawczo-odbiorcze)
- Maksymalna prostota obsługi ("Maksymalnie dużo za maksymalnie prostą obsługę")

### Role użytkowników
- **Właściciel**: Pełne uprawnienia do zarządzania mieszkaniem, lokatorami, opłatami i protokołami
- **Lokator**: Uprawnienia tylko do odczytu danych udostępnionych przez właściciela

## Stack Technologiczny

### Frontend
- **Astro 5**: Framework aplikacji webowej
  - Zero JS domyślnie dla stron statycznych
  - Partial hydration - interaktywność tylko tam, gdzie potrzebna
- **React 19**: Komponenty interaktywne
- **TypeScript 5**: Statyczne typowanie
- **Tailwind CSS 4**: Utility-first CSS framework
- **Shadcn/ui**: Biblioteka komponentów UI (copy-paste approach)

### Backend
- **Supabase**: Kompleksowe rozwiązanie backendowe (BaaS)
  - PostgreSQL Database z Row Level Security (RLS)
  - Authentication (Email/Password)
  - Storage (załączniki i zdjęcia)

### Hosting & CI/CD
- **DigitalOcean**: Hosting (Docker)
- **GitHub Actions**: Pipeline CI/CD

### Język
- **Wyłącznie język polski (PL)** w całej aplikacji

## Struktura Projektu

```
/
├── .ai/                    # Dokumentacja projektu
│   ├── prd.md             # Product Requirements Document
│   └── tech-stack.md      # Szczegóły stacku technologicznego
├── src/
│   ├── components/        # Komponenty (Astro + React)
│   │   ├── ui/           # Shadcn/ui components
│   │   └── hooks/        # Custom React hooks
│   ├── layouts/          # Astro layouts
│   ├── pages/            # Astro pages (routing)
│   │   └── api/          # API endpoints
│   ├── middleware/       # Astro middleware
│   │   └── index.ts      # Middleware setup
│   ├── db/               # Supabase clients and types
│   │   ├── supabase.client.ts
│   │   └── database.types.ts
│   ├── types.ts          # Shared types (Entities, DTOs)
│   ├── lib/              # Services and helpers
│   ├── assets/           # Static internal assets
│   └── styles/           # Global styles
├── public/               # Public assets
├── supabase/
│   ├── migrations/       # DB migrations
│   └── seed.sql         # Seed data
├── Dockerfile
├── docker-compose.yml
└── astro.config.mjs
```

## Zasady Kodowania

### Ogólne wytyczne
- Używaj feedbacku z linterów do poprawy kodu
- Priorytetyzuj obsługę błędów i przypadków brzegowych
- Obsługuj błędy na początku funkcji (early returns)
- Unikaj głęboko zagnieżdżonych if statements
- Umieszczaj "happy path" na końcu funkcji
- Unikaj niepotrzebnych else statements (if-return pattern)
- Używaj guard clauses dla warunków wstępnych
- Implementuj właściwe logowanie błędów
- Rozważ custom error types dla spójnej obsługi błędów

### Frontend (Astro + React)

#### Komponenty Astro
- Używaj komponentów Astro (.astro) dla statycznej treści i layoutów
- Implementuj React tylko gdy wymagana jest interaktywność
- Wykorzystuj View Transitions API dla płynnych przejść (ClientRouter)
- Używaj `export const prerender = false` dla API routes
- Waliduj input w API routes za pomocą Zod
- Wyciągaj logikę do serwisów w `src/lib/services`

#### Komponenty React
- Używaj functional components z hooks (nie class components)
- **NIGDY** nie używaj "use client" i innych dyrektyw Next.js (używamy React z Astro!)
- Wyciągaj logikę do custom hooks w `src/components/hooks`
- Używaj React.memo() dla kosztownych komponentów
- Wykorzystuj React.lazy() i Suspense dla code-splitting
- useCallback dla event handlers przekazywanych do child components
- useMemo dla kosztownych obliczeń
- useId() dla generowania unique IDs (accessibility)
- useOptimistic dla optimistic UI updates w formularzach
- useTransition dla non-urgent state updates

#### Stylowanie (Tailwind CSS)
- Używaj @layer directive dla organizacji stylów
- Używaj arbitrary values z square brackets dla one-off designs (np. `w-[123px]`)
- Implementuj konfigurację Tailwind dla customizacji theme
- Wykorzystuj theme() function w CSS
- Używaj dark: variant dla dark mode
- Responsive variants: sm:, md:, lg:, xl:, 2xl:
- State variants: hover:, focus-visible:, active:, disabled:

#### Accessibility (ARIA)
- Używaj ARIA landmarks (main, navigation, search)
- Stosuj odpowiednie ARIA roles dla custom elementów
- Ustawiaj aria-expanded i aria-controls dla expandable content
- Używaj aria-live regions dla dynamic content
- Implementuj aria-hidden dla decorative content
- Używaj aria-label lub aria-labelledby dla elementów bez visible text
- aria-describedby dla opisów form inputs
- aria-current dla wskazania current item
- Unikaj redundantnego ARIA (nie duplikuj semantyki native HTML)

### Backend & Database (Supabase)

#### Ogólne zasady
- Używaj Supabase dla wszystkich operacji backendowych
- Przestrzegaj wytycznych Supabase dla security i performance
- Waliduj dane wymieniane z backendem za pomocą Zod schemas
- **W Astro routes używaj supabase z `context.locals`**, nie importuj supabaseClient bezpośrednio
- Używaj typu `SupabaseClient` z `src/db/supabase.client.ts`, nie z `@supabase/supabase-js`

#### API Endpoints
- Używaj UPPERCASE format dla endpoint handlers (GET, POST)
- Dodaj `export const prerender = false` dla API routes
- Waliduj input za pomocą Zod
- Wyciągaj logikę biznesową do serwisów w `src/lib/services`

#### Migracje bazy danych
- Twórz pliki migracji w `supabase/migrations/`
- Format nazwy: `YYYYMMDDHHmmss_short_description.sql` (UTC time)
  - Przykład: `20240906123045_create_profiles.sql`
- Pisz cały SQL lowercase
- Dodawaj header comment z metadata (purpose, affected tables, considerations)
- Dodawaj obszerne komentarze dla każdego kroku migracji
- Komentuj wszystkie destructive commands (DROP, TRUNCATE, ALTER)
- **ZAWSZE** włączaj Row Level Security (RLS) dla nowych tabel
- Twórz granularne RLS Policies:
  - Osobne policy dla każdej operacji (select, insert, update, delete)
  - Osobne policy dla każdej roli Supabase (anon, authenticated)
  - NIE łącz policies nawet jeśli funkcjonalność jest taka sama
  - Dodawaj komentarze wyjaśniające rationale każdej policy
  - Dla public access policy może zwracać `true`

### Shadcn/ui Components

#### Lokalizacja i import
- Komponenty znajdują się w `src/components/ui`
- Import z aliasem `@/`:
  ```tsx
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription } from "@/components/ui/card"
  ```

#### Instalacja nowych komponentów
```bash
npx shadcn@latest add [component-name]
```

**WAŻNE**: Używaj `npx shadcn@latest`, NIE `npx shadcn-ui@latest` (wycofane)

#### Dostępne komponenty w projekcie
Lista komponentów do zainstalowania w razie potrzeby:
- Form, Button, Input, Select, Textarea
- Card, Table, Tabs
- Dialog, AlertDialog, Sheet, Popover
- Calendar, DatePicker
- Checkbox, Radio Group, Switch
- Accordion, Collapsible
- DropdownMenu, ContextMenu, NavigationMenu
- Toast/Sonner (notifications)
- Tooltip, HoverCard
- Progress, Slider
- Avatar, Badge, Separator
- ScrollArea, Skeleton

#### Styl projektu
- Wariant: "new-york"
- Kolor bazowy: "neutral"
- Używa CSS variables do tworzenia motywów

## Kluczowe Funkcjonalności (z PRD)

### Uwierzytelnianie
- Rejestracja i logowanie: email + hasło
- Wymagana akceptacja Regulaminu i Polityki Prywatności
- Funkcja resetowania hasła (przez email)
- Hasło: minimum 8 znaków

### Onboarding Właściciela
Po pierwszej rejestracji, obowiązkowy 2-etapowy kreator:
1. Dodaj Mieszkanie (Nazwa, Adres)
2. Zaproś Lokatora (jednorazowy link zapraszający)

### Zarządzanie Mieszkaniami (Właściciel)
- Dashboard: lista mieszkań jako "karty"
- CRUD mieszkań (Create, Read, Update, Delete)
- Usunięcie możliwe tylko gdy brak aktywnego/zarchiwizowanego lokatora

### Zarządzanie Najmem
- Generowanie unikalnego, jednorazowego linku zapraszającego
- **Ograniczenie**: jedno mieszkanie = jeden aktywny lokator
- Zakończenie najmu: archiwizacja danych, lokator traci dostęp

### Zarządzanie Opłatami (Właściciel)
Pola opłaty:
- Kwota (PLN, >0)
- Data wymagalności
- Typ: "Czynsz", "Rachunek", "Inne"
- Komentarz (max 300 znaków)
- Załącznik (opcjonalnie, 1 plik: PDF/JPG/PNG, max 5MB)

Lista opłat:
- Grupowanie po miesiącach (wg daty wymagalności)
- Sortowanie malejące (najnowsze na górze)

### Zarządzanie Wpłatami (Właściciel)
Właściciel ręcznie dodaje wpłaty do opłat.

Automatyczne obliczanie statusu:
- "Do opłacenia" (suma wpłat = 0)
- "Częściowo opłacone" (0 < suma wpłat < kwota opłaty)
- "Opłacone" (suma wpłat = kwota opłaty)
- "Po terminie" (data wymagalności minęła + status != "Opłacone")

Ograniczenia:
- Nie można edytować opłaty ze statusem "Opłacone"
- Nie można edytować kwoty opłaty na wartość niższą niż suma wpłat

### Protokoły (Właściciel i Lokator)
Dwie stałe zakładki:
- "Protokół Odbioru"
- "Protokół Zwrotu"

Każdy protokół:
- Jedno pole tekstowe (textarea)
- Do 10 zdjęć (każde max 5MB, PDF/JPG/PNG)
- Właściciel: pełen dostęp do edycji
- Lokator: tylko odczyt

### Widok Lokatora
- Wszystkie dane tylko do odczytu (Read-Only)
- Dostęp do opłat, wpłat i protokołów
- Brak możliwości dodawania/edycji/usuwania

## Storage (Supabase)

### Buckety
- `charge-attachments`: załączniki do opłat (PDF/JPG/PNG, max 5MB)
- `protocol-photos`: zdjęcia protokołów (JPG/PNG, max 5MB, max 10 per protocol)

### Polityki bezpieczeństwa (RLS)
- Właściciel: upload/read/delete swoich plików
- Lokator: tylko read plików swojego mieszkania

## Bezpieczeństwo

### Frontend
- Input sanitization
- XSS protection (React escaping)
- CSRF tokens
- Secure headers (CSP)

### Backend
- Row Level Security (RLS)
- Właściciel widzi tylko swoje mieszkania
- Lokator widzi tylko swoje mieszkanie
- JWT authentication
- Prepared statements (SQL injection protection)
- Rate limiting (Supabase built-in)

### Storage
- File type validation (MIME type)
- File size limits (5MB)
- Signed URLs (expiring links)

## Granice MVP

Świadomie wykluczone z zakresu MVP:
- Płatności i plany premium
- Integracje płatnicze z bankami
- Analityka i raporty (wykresy, CSV/PDF export)
- Zaawansowane zarządzanie nieruchomościami
- Logowanie społecznościowe (Google, Facebook)
- Wsparcie języka angielskiego
- Automatyczne powiadomienia (email, push, SMS)
- Wielu lokatorów na jedno mieszkanie
- Google Analytics / Hotjar

## Zmienne Środowiskowe

```bash
# Supabase
PUBLIC_SUPABASE_URL=https://xxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# App
PUBLIC_APP_URL=https://rentflow.pl
NODE_ENV=production

# Email (Supabase SMTP)
SMTP_HOST=smtp.supabase.io
SMTP_PORT=587
```

## Schemat Bazy Danych

Główne tabele:
- `users` - właściciele i lokatorzy
- `apartments` - mieszkania
- `leases` - najem (aktywne i archiwalne)
- `charges` - opłaty
- `payments` - wpłaty
- `protocols` - protokoły odbioru/zwrotu
- `invitation_links` - linki zapraszające

## Metryki Sukcesu

Mierzone ręcznie przez zapytania SQL (brak Google Analytics w MVP):

1. **Wdrożenie Właścicieli**: 80% właścicieli zaprosiło lokatora w ciągu 7 dni
2. **Aktywne Wykorzystanie**: 50% właścicieli rozlicza się przez aplikację (co najmniej 1 opłata "Opłacone" w ciągu 2 miesięcy)

## Kontakt

- Email pomocy technicznej: pomoc@rentflow.pl
- Wszystkie teksty prawne (Regulamin, Polityka Prywatności) jako statyczne strony Astro

## Ważne przypomnienia dla AI

1. **Zawsze język polski** w UI, komunikatach, komentarzach dla użytkownika
2. **Nie używaj dyrektyw Next.js** ("use client") - to React z Astro!
3. **Supabase przez context.locals** w Astro routes
4. **RLS dla każdej nowej tabeli** - granularne policies
5. **Maksymalna prostota** - MVP eliminuje zbędne funkcje
6. **Read-only dla lokatora** - zero możliwości edycji
7. **Jedno mieszkanie = jeden lokator** - twarde ograniczenie
