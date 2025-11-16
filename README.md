# Rentflow

A modern web application designed to radically simplify the relationship between rental property owners and their tenants.

## Table of Contents

- [Project Description](#project-description)
- [Tech Stack](#tech-stack)
- [Getting Started Locally](#getting-started-locally)
- [Available Scripts](#available-scripts)
- [Project Scope](#project-scope)
- [Project Status](#project-status)
- [License](#license)

## Project Description

Rentflow is a responsive web application (RWD) in its MVP (Minimum Viable Product) version, designed to provide a centralized, easy-to-use tool for communication, payment management, and storage of key documentation (handover protocols) between landlords and tenants.

The application follows the principle of "maximum value with maximum simplicity," eliminating unnecessary features in favor of quick deployment and solving fundamental problems.

### User Roles

- **Owner**: Has full permissions to manage apartments, tenants, payments, and protocols
- **Tenant**: Has read-only access to data shared by the owner

### Key Features

- Centralized tracking of all charges (rent, utilities, other expenses)
- Transparent payment status system (managed by owner, visible to tenant)
- Central repository for bills (attachments) and protocols (text + photos)
- Simple tenant invitation and management system
- Manual payment tracking with automatic status calculation
- Handover and return protocol management with photo documentation

## Tech Stack

### Frontend

- **[Astro](https://astro.build/)** v5.13.7 - Modern web framework for building fast, content-focused websites with zero JS by default
- **[React](https://react.dev/)** v19.1.1 - UI library for interactive components
- **[TypeScript](https://www.typescriptlang.org/)** v5 - Type-safe JavaScript for better development experience
- **[Tailwind CSS](https://tailwindcss.com/)** v4.1.13 - Utility-first CSS framework for rapid UI development
- **[Shadcn/ui](https://ui.shadcn.com/)** - Accessible component library based on Radix UI, styled with Tailwind CSS

### Backend

- **[Supabase](https://supabase.com/)** - Comprehensive Backend-as-a-Service (BaaS) providing:
  - **PostgreSQL Database** with Row Level Security (RLS)
  - **Authentication** - Email/Password with password reset functionality
  - **Storage** - Managed file storage for attachments and photos (max 5MB per file)

### CI/CD & Hosting

- **GitHub Actions** - Automated CI/CD pipeline for linting, type checking, building, and deployment
- **DigitalOcean** - Application hosting using Docker containers
- **Docker** - Containerized deployment with Nginx as reverse proxy and SSL (Let's Encrypt)

### Development Tools

- **ESLint** v9.23.0 - JavaScript/TypeScript linting
- **Prettier** v5.2.5 - Code formatting
- **Husky** v9.1.7 - Git hooks for pre-commit checks
- **lint-staged** v15.5.0 - Run linters on staged files

### Testing

- **Vitest** - Fast unit test framework for TypeScript/JavaScript
- **React Testing Library** - Testing utilities for React components
- **Playwright** - End-to-end testing framework with cross-browser support
- **axe-core** - Accessibility testing engine (integrated with Playwright)

## Getting Started Locally

### Prerequisites

- **Node.js** v22.14.0 (as specified in [.nvmrc](.nvmrc))
- **npm** (comes with Node.js)
- **Supabase account** (for backend services)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd 10xdevs-rentflow
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

Create a `.env.local` file in the root directory (refer to [.env.example](.env.example) for the template):

```bash
# Supabase
PUBLIC_SUPABASE_URL=https://xxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# App
PUBLIC_APP_URL=http://localhost:4321
NODE_ENV=development
```

4. Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:4321`

### Database Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the database migrations located in [supabase/migrations/](supabase/migrations/)
3. Apply Row Level Security (RLS) policies as defined in the technical documentation

### File Storage Setup

Configure the following Supabase Storage buckets:
- `charge-attachments` - For payment bill attachments (PDF, JPG, PNG)
- `protocol-photos` - For protocol photos (JPG, PNG, max 10 per protocol)

## Available Scripts

### Development

- `npm run dev` - Start Astro development server with hot reload
- `npm run build` - Build the application for production
- `npm run preview` - Preview the production build locally
- `npm run astro` - Run Astro CLI commands

### Code Quality

- `npm run lint` - Run ESLint to check for code issues
- `npm run lint:fix` - Automatically fix ESLint issues where possible
- `npm run format` - Format code using Prettier

### Pre-commit Hooks

The project uses Husky and lint-staged to automatically:
- Run ESLint on `.ts`, `.tsx`, and `.astro` files
- Run Prettier on `.json`, `.css`, and `.md` files

## Project Scope

### Included Features (MVP)

**Authentication & User Management**
- Email/password registration and login
- Password reset via email
- Two-factor owner onboarding wizard (add apartment → invite tenant)

**Apartment Management (Owner)**
- Create, read, update, and delete apartments
- View apartment list as cards with status summaries
- Manage multiple apartments

**Tenant Management (Owner)**
- Generate one-time invitation links for tenants
- View tenant status (pending/active)
- End lease and archive tenant data
- View tenant history per apartment

**Payment Management (Owner)**
- Add charges with type (Rent/Bill/Other), amount, due date, comment, and optional attachment
- Track payments manually
- Automatic status calculation: "To Pay", "Partially Paid", "Paid"
- Automatic "Overdue" marking based on due date
- Charges grouped by month and sorted descending
- Edit and delete charges (with restrictions on paid charges)

**Protocol Management (Owner & Tenant)**
- Two fixed tabs: "Handover Protocol" and "Return Protocol"
- Text field for protocol descriptions
- Photo uploads (max 10 photos per protocol, max 5MB each)
- Owner has full edit access, tenant has read-only access

**Tenant Dashboard (Read-Only)**
- View all charges and their statuses
- View payment history
- View protocols and photos
- Balance summary

### Explicitly Excluded Features

- Premium accounts or paid features (100% free)
- Payment gateway integrations or bank connections
- Advanced analytics, reports, or data exports (CSV/PDF)
- Property management features (repairs, maintenance, defect reporting)
- Social login (Google, Facebook) or magic links
- Multi-language support (Polish only)
- Automatic notifications (email, push, SMS)
- Multiple tenants per apartment
- Analytics tools (Google Analytics, Hotjar)

## Project Status

**Current Phase:** MVP Development

### Development Roadmap

**Phase 1: MVP** (Current)
- Core authentication and user management
- Apartment and tenant management
- Payment tracking system
- Protocol management with photo uploads
- Docker deployment to DigitalOcean

**Phase 2: Post-MVP** (Future)
- Email notifications using Supabase Edge Functions
- Real-time updates using Supabase Realtime
- Advanced analytics and reporting
- Mobile application (React Native)

**Phase 3: Scale** (Long-term)
- CDN integration (Cloudflare)
- Caching layer (Redis)
- Load balancing
- Multi-region deployment

### Success Metrics

Due to the deliberate exclusion of analytics tools in the MVP, success criteria will be measured manually through direct SQL queries to the production database:

1. **Owner Onboarding**: 80% of registered owners invite a tenant within 7 days
2. **Active Payment Usage**: 50% of owners who invited a tenant actively track payments through the app (at least one charge marked as "Paid" within 2 months)

## License

MIT

---

## Support

For technical support or account management:
- **Email**: pomoc@rentflow.pl

## Legal

- [Terms of Service](./terms-of-service) (Static HTML page)
- [Privacy Policy](./privacy-policy) (Static HTML page)

## Additional Documentation

For detailed project information, see:
- [Product Requirements Document](.ai/prd.md) (Polish)
- [Technical Stack Documentation](.ai/tech-stack.md) (Polish)
