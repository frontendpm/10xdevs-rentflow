# Stack Technologiczny - Rentflow MVP

## Przegląd

Rentflow to aplikacja webowa (RWD) zbudowana w oparciu o nowoczesny stack technologiczny zapewniający szybkie dostarczenie MVP przy zachowaniu możliwości skalowalności.

## Frontend

### Astro
**Wersja:** Latest stable
**Zastosowanie:** Framework aplikacji webowej

**Uzasadnienie:**
- Zero JS domyślnie - szybkie ładowanie stron statycznych (logowanie, rejestracja, strony prawne)
- Partial hydration - interaktywność tylko tam, gdzie jest potrzebna
- Doskonała integracja z React dla komponentów wymagających interaktywności
- Built-in routing i obsługa statycznych stron
- Wsparcie dla TypeScript out-of-the-box

### React 19
**Zastosowanie:** Komponenty interaktywne

**Uzasadnienie:**
- Interaktywność tam, gdzie jest potrzebna (formularze, dashboardy, zarządzanie danymi)
- Doskonałe wsparcie ekosystemu (Shadcn/ui)
- Server Components i Actions dla lepszej wydajności
- Duża społeczność i łatwość rekrutacji deweloperów

**Przypadki użycia w Rentflow:**
- Formularze rejestracji/logowania z walidacją
- Dashboard właściciela (lista mieszkań)
- Panel zarządzania opłatami
- Upload i wyświetlanie plików
- Interaktywne modele potwierdzające

### TypeScript 5
**Zastosowanie:** Statyczne typowanie

**Uzasadnienie:**
- Wykrywanie błędów w czasie developmentu
- Lepsze wsparcie IDE (autocomplete, refactoring)
- Samodokumentujący się kod
- Łatwiejszy maintenance długoterminowo
- Integracja z Supabase (auto-generated types)

### Tailwind CSS 4
**Zastosowanie:** Stylowanie aplikacji

**Uzasadnienie:**
- Szybkie prototypowanie i rozwój UI
- Utility-first approach - mniej custom CSS
- Świetna integracja z Shadcn/ui
- Built-in responsywność (RWD)
- Mały rozmiar bundla (purge unused styles)
- Consistent design system

### Shadcn/ui
**Zastosowanie:** Biblioteka komponentów UI

**Uzasadnienie:**
- Dostępne komponenty (accessibility)
- Copy-paste approach - pełna kontrola nad kodem
- Oparte na Radix UI (dojrzałe primitives)
- Stylowane Tailwind CSS
- TypeScript support
- Nie zwiększa bundle size (tylko używane komponenty)

**Komponenty wykorzystane w projekcie:**
- Card (lista mieszkań)
- Form (wszystkie formularze)
- Dialog/Modal (potwierdzenia)
- Button, Input, Select
- Table (lista opłat)
- Tabs (protokoły)
- Toast (powiadomienia)

## Backend

### Supabase
**Zastosowanie:** Kompleksowe rozwiązanie backendowe (BaaS)

**Moduły wykorzystane:**

#### 1. Database (PostgreSQL)
**Uzasadnienie:**
- Managed PostgreSQL - bez zarządzania infrastrukturą
- Row Level Security (RLS) - bezpieczeństwo na poziomie bazy
- Real-time subscriptions (opcjonalnie dla przyszłych funkcji)
- Auto-generated TypeScript types
- Migracje wbudowane

**Schemat bazy:**
- `users` - właściciele i lokatorzy
- `apartments` - mieszkania
- `leases` - najem (aktywne i archiwalne)
- `charges` - opłaty
- `payments` - wpłaty
- `protocols` - protokoły odbioru/zwrotu
- `invitation_links` - linki zapraszające

#### 2. Authentication
**Uzasadnienie:**
- Email/Password authentication out-of-the-box
- Resetowanie hasła przez email
- Session management
- JWT tokens
- Bezpieczne hashowanie haseł (bcrypt)
- Email templates dla weryfikacji

**Funkcje wykorzystane:**
- Sign up (rejestracja właściciela)
- Sign in (logowanie)
- Password reset
- Session management
- Protected routes

#### 3. Storage
**Uzasadnienie:**
- Managed file storage (S3-compatible)
- Row Level Security dla plików
- CDN dla szybkiego dostępu
- Automatyczna optymalizacja obrazów
- Bezpieczne upload/download URLs

**Buckety:**
- `charge-attachments` - załączniki do opłat (PDF, JPG, PNG, max 5MB)
- `protocol-photos` - zdjęcia protokołów (JPG, PNG, max 5MB, max 10 per protocol)

**Polityki bezpieczeństwa:**
- Właściciel może upload/read/delete swoich plików
- Lokator może tylko read plików swojego mieszkania

#### 4. Edge Functions (opcjonalnie)
**Potencjalne zastosowanie:**
- Wysyłanie emaili powitalnych
- Generowanie raportów
- Scheduled jobs (np. oznaczanie opóźnionych płatności)

## CI/CD i Hosting

### GitHub Actions
**Zastosowanie:** Pipeline CI/CD

**Pipeline stages:**
1. **Lint & Type Check**
   - ESLint
   - TypeScript compiler check
   - Prettier format check

2. **Build**
   - Astro build
   - Environment variables validation
   - Bundle size check

3. **Test** (opcjonalnie)
   - Unit tests (Vitest)
   - Integration tests
   - E2E tests (Playwright)

4. **Deploy**
   - Build Docker image
   - Push to registry
   - Deploy to DigitalOcean

**Triggery:**
- Push to `main` → deployment produkcyjny
- Pull request → preview deployment
- Tag `v*` → release production

### DigitalOcean
**Zastosowanie:** Hosting aplikacji

**Konfiguracja:**
- **Droplet:** Ubuntu 22.04 LTS
- **Rozmiar:** Basic ($12-24/mies, 2GB RAM)
- **Docker:** Konteneryzacja aplikacji
- **Nginx:** Reverse proxy + SSL (Let's Encrypt)

**Struktura deploymentu:**
```
/app
  - Dockerfile
  - docker-compose.yml
  - nginx.conf
```

**Dockerfile:**
- Multi-stage build (build + runtime)
- Node.js 20 Alpine (mały obraz)
- Astro production build
- PM2 dla process management

## Narzędzia deweloperskie

### Linting & Formatting
- **ESLint** - linting JavaScript/TypeScript
- **Prettier** - formatowanie kodu

### Testing (opcjonalnie dla MVP)
- **Vitest** - unit tests
- **Testing Library** - React component tests

### Environment Management
- `.env.local` - lokalne zmienne
- `.env.example` - template
- Supabase CLI - zarządzanie backendem lokalnie

## Zmienne środowiskowe

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

## Struktura projektu

```
/
├── .ai/                    # Dokumentacja projektu
│   ├── prd.md
│   └── tech-stack.md
├── src/
│   ├── components/         # React components
│   │   ├── ui/            # Shadcn/ui components
│   │   └── features/      # Feature components
│   ├── layouts/           # Astro layouts
│   ├── pages/             # Astro pages (routing)
│   ├── lib/               # Utilities
│   │   ├── supabase.ts   # Supabase client
│   │   └── utils.ts
│   ├── types/             # TypeScript types
│   └── styles/            # Global styles
├── public/                # Static assets
├── supabase/
│   ├── migrations/        # DB migrations
│   └── seed.sql          # Seed data
├── Dockerfile
├── docker-compose.yml
├── package.json
└── astro.config.mjs
```

## Bezpieczeństwo

### Frontend
- Input sanitization
- XSS protection (React escaping)
- CSRF tokens
- Secure headers (CSP)

### Backend (Supabase)
- Row Level Security (RLS)
  - Właściciel widzi tylko swoje mieszkania
  - Lokator widzi tylko swoje mieszkanie
- JWT authentication
- Prepared statements (SQL injection protection)
- Rate limiting (Supabase built-in)

### Storage
- File type validation (MIME type)
- File size limits (5MB)
- Virus scanning (opcjonalnie: ClamAV)
- Signed URLs (expiring links)

### Hosting
- HTTPS/SSL (Let's Encrypt)
- Firewall rules (ufw)
- Regular security updates
- Backup strategy

## Roadmap techniczny

### Faza 1: MVP (obecna)
✓ Astro + React + Supabase
✓ Email/Password auth
✓ Basic CRUD
✓ File uploads
✓ Docker deployment

### Faza 2: Post-MVP
- Email notifications (Edge Functions)
- Real-time updates (Supabase Realtime)
- Advanced analytics
- Mobile app (React Native)

### Faza 3: Scale
- CDN (Cloudflare)
- Caching layer (Redis)
- Load balancer
- Multiple regions

## Alternatywy rozważone

### Laravel (PHP) + React
**Odrzucone ponieważ:**
- Wymaga więcej DevOps (PHP + DB + Queue)
- Wolniejszy development dla MVP
- Mniejsza skalowalność long-term

### Next.js + Supabase
**Rozważone, ale:**
- Astro lepszy dla content-heavy pages
- Next.js overengineering dla prostego MVP

### Supabase vs własny backend
**Supabase wybrany bo:**
- Szybszy time-to-market
- Managed infrastructure
- Built-in features (auth, storage)
- Niższe koszty początkowe

## Kontakt techniczny

W przypadku pytań technicznych:
- Email: pomoc@rentflow.pl
- GitHub: [link do repo]
