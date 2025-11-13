# API Endpoint Implementation Plan: GET /api/apartments

## 1. Przegląd punktu końcowego

Endpoint zwraca listę mieszkań dostępnych dla zalogowanego użytkownika. Dla właścicieli zwraca wszystkie ich mieszkania wraz z informacjami o aktywnym najmie i lokatorze. Dla lokatorów zwraca tylko mieszkanie, w którym aktualnie zamieszkują (z aktywnym najmem), wraz z informacjami o właścicielu.

**Kluczowe cechy:**
- Różne widoki dla właściciela i lokatora
- Opcjonalne dołączanie mieszkań z archiwalnymi najmami (tylko dla właściciela)
- Wykorzystanie RLS do zapewnienia bezpieczeństwa danych
- Automatyczne rozróżnienie roli użytkownika na podstawie auth.uid()

## 2. Szczegóły żądania

- **Metoda HTTP:** GET
- **Struktura URL:** `/api/apartments`
- **Parametry:**
  - **Wymagane:** brak
  - **Opcjonalne:**
    - `include_archived` (boolean, default: false) - czy dołączyć mieszkania z archiwalnymi najmami
- **Request Body:** nie dotyczy (GET)
- **Headers:**
  - `Authorization: Bearer <jwt-token>` (wymagany)

## 3. Wykorzystywane typy

**DTOs:**
```typescript
// Response type
export type ApartmentListDTO = {
  apartments: (ApartmentListItemOwnerDTO | ApartmentListItemTenantDTO)[];
};

// Owner view
export type ApartmentListItemOwnerDTO = Tables<'apartments'> & {
  lease?: LeaseInfo;
};

// Tenant view
export type ApartmentListItemTenantDTO = Pick<
  Tables<'apartments'>,
  'id' | 'name' | 'address'
> & {
  owner: OwnerInfo;
};

// Helper types
export type LeaseInfo = Pick<Tables<'leases'>, 'id' | 'status' | 'start_date'> & {
  tenant: TenantInfo;
};

export type TenantInfo = Pick<Tables<'users'>, 'id' | 'full_name' | 'email'>;
export type OwnerInfo = Pick<Tables<'users'>, 'id' | 'full_name' | 'email'>;
```

**Validation Schema (Zod):**
```typescript
const GetApartmentsQuerySchema = z.object({
  include_archived: z
    .string()
    .transform((val) => val === 'true')
    .optional()
    .default('false')
});
```

## 4. Szczegóły odpowiedzi

### Success Response (200) - Owner:
```json
{
  "apartments": [
    {
      "id": "uuid",
      "name": "Kawalerka na Woli",
      "address": "ul. Złota 44, Warszawa",
      "owner_id": "uuid",
      "created_at": "2025-01-12T10:00:00Z",
      "updated_at": "2025-01-12T10:00:00Z",
      "created_by": "uuid",
      "lease": {
        "id": "uuid",
        "status": "active",
        "start_date": "2025-01-01",
        "tenant": {
          "id": "uuid",
          "full_name": "Anna Kowalska",
          "email": "anna@example.com"
        }
      }
    }
  ]
}
```

### Success Response (200) - Tenant:
```json
{
  "apartments": [
    {
      "id": "uuid",
      "name": "Kawalerka na Woli",
      "address": "ul. Złota 44, Warszawa",
      "owner": {
        "id": "uuid",
        "full_name": "Jan Kowalski",
        "email": "jan@example.com"
      }
    }
  ]
}
```

### Error Responses:

**401 Unauthorized:**
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal Server Error",
  "message": "Wystąpił błąd serwera"
}
```

## 5. Przepływ danych

### Dla Owner:

1. **Walidacja query params** - parsowanie `include_archived`
2. **Pobranie user z context.locals** - sprawdzenie autoryzacji
3. **Pobranie roli użytkownika** z tabeli `users`
4. **Query do bazy:**
   ```sql
   SELECT
     a.*,
     l.id as lease_id,
     l.status as lease_status,
     l.start_date as lease_start_date,
     u.id as tenant_id,
     u.full_name as tenant_name,
     u.email as tenant_email
   FROM apartments a
   LEFT JOIN leases l ON l.apartment_id = a.id
     AND l.status = 'active'
   LEFT JOIN users u ON u.id = l.tenant_id
   WHERE a.owner_id = auth.uid()
   ORDER BY a.created_at DESC
   ```

   Jeśli `include_archived = true`, dodać również najmy ze statusem 'archived'

5. **Transformacja danych** - mapowanie wyników do `ApartmentListItemOwnerDTO[]`
6. **Zwrócenie odpowiedzi** jako `ApartmentListDTO`

### Dla Tenant:

1. **Walidacja query params** - parsowanie `include_archived` (ignorowane dla tenant)
2. **Pobranie user z context.locals** - sprawdzenie autoryzacji
3. **Pobranie roli użytkownika** z tabeli `users`
4. **Query do bazy:**
   ```sql
   SELECT
     a.id,
     a.name,
     a.address,
     u.id as owner_id,
     u.full_name as owner_name,
     u.email as owner_email
   FROM apartments a
   JOIN leases l ON l.apartment_id = a.id
   JOIN users u ON u.id = a.owner_id
   WHERE l.tenant_id = auth.uid()
     AND l.status = 'active'
   ```

5. **Transformacja danych** - mapowanie wyników do `ApartmentListItemTenantDTO[]`
6. **Zwrócenie odpowiedzi** jako `ApartmentListDTO`

## 6. Względy bezpieczeństwa

### Autoryzacja:
- **Wymagany JWT token** - sprawdzenie przez middleware Astro
- **RLS Policies** zapewniają automatyczną filtrację danych:
  - Owner widzi tylko swoje mieszkania (`owner_id = auth.uid()`)
  - Tenant widzi tylko mieszkanie z aktywnym najmem (`tenant_id = auth.uid() AND status = 'active'`)

### Walidacja:
- Walidacja query params za pomocą Zod
- Sanityzacja wartości boolean `include_archived`

### Data exposure:
- **Owner**: pełne dane mieszkania + dane lokatora (tylko imię, email)
- **Tenant**: ograniczone dane mieszkania (bez owner_id, created_by, timestamps) + dane właściciela (tylko imię, email)

### Rate limiting:
- Supabase built-in rate limiting (100 req/s per IP)

## 7. Obsługa błędów

### Scenariusze błędów:

| Kod | Scenariusz | Response |
|-----|-----------|----------|
| 401 | Brak tokenu JWT lub token nieprawidłowy | `{ "error": "Unauthorized", "message": "Brak autoryzacji" }` |
| 400 | Nieprawidłowy format query param | `{ "error": "Validation Error", "message": "Nieprawidłowe parametry" }` |
| 500 | Błąd połączenia z bazą danych | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` |
| 500 | Nieoczekiwany błąd podczas transformacji danych | `{ "error": "Internal Server Error", "message": "Wystąpił błąd serwera" }` |

### Logging:
```typescript
console.error('GET /api/apartments error:', {
  userId: user.id,
  error: error.message,
  stack: error.stack
});
```

## 8. Rozważania dotyczące wydajności

### Optymalizacje:

1. **Indeksy bazy danych:**
   - `idx_apartments_owner_id` - dla filtrowania mieszkań właściciela
   - `idx_leases_apartment_id` - dla JOIN z leases
   - `idx_leases_tenant_id` - dla filtrowania najmu lokatora
   - `idx_leases_status` - dla filtrowania aktywnych najmów

2. **LEFT JOIN optimization:**
   - Używamy LEFT JOIN dla leases, aby zwrócić również mieszkania bez aktywnego lokatora

3. **Limit wyników:**
   - Dla MVP nie implementujemy paginacji
   - W przyszłości rozważyć `LIMIT` i `OFFSET` lub cursor-based pagination

4. **Caching:**
   - Dla MVP brak cachingu
   - Post-MVP: rozważyć cache na 1 minutę dla dashboard data

### Potencjalne wąskie gardła:

- **N+1 queries** - unikamy poprzez użycie JOIN zamiast osobnych zapytań
- **Large datasets** - dla użytkowników z wieloma mieszkaniami może być wolne (post-MVP: pagination)

## 9. Etapy wdrożenia

### Krok 1: Utworzenie validation schema
```typescript
// src/lib/validation/apartments.validation.ts
import { z } from 'zod';

export const GetApartmentsQuerySchema = z.object({
  include_archived: z
    .string()
    .transform((val) => val === 'true')
    .optional()
    .default('false')
});
```

### Krok 2: Utworzenie apartment service
```typescript
// src/lib/services/apartment.service.ts
import type { SupabaseClient } from '@/db/supabase.client';
import type {
  ApartmentListItemOwnerDTO,
  ApartmentListItemTenantDTO
} from '@/types';

export class ApartmentService {
  constructor(private supabase: SupabaseClient) {}

  async getApartmentsForOwner(
    userId: string,
    includeArchived: boolean
  ): Promise<ApartmentListItemOwnerDTO[]> {
    // Implementation
  }

  async getApartmentsForTenant(
    userId: string
  ): Promise<ApartmentListItemTenantDTO[]> {
    // Implementation
  }
}
```

### Krok 3: Implementacja API route
```typescript
// src/pages/api/apartments/index.ts
export const prerender = false;

export async function GET(context: APIContext) {
  // 1. Get user from context.locals
  // 2. Validate query params
  // 3. Get user role
  // 4. Call appropriate service method
  // 5. Return response
}
```

### Krok 4: Implementacja metod serwisu

**getApartmentsForOwner:**
1. Query z LEFT JOIN do leases i users
2. Filtrowanie po owner_id (RLS)
3. Opcjonalne dołączenie archived leases
4. Transformacja do DTO

**getApartmentsForTenant:**
1. Query z INNER JOIN do leases i users
2. Filtrowanie po tenant_id i status='active' (RLS)
3. Transformacja do DTO

### Krok 5: Obsługa błędów
1. Try-catch dla wszystkich operacji bazodanowych
2. Logowanie błędów z kontekstem
3. Zwracanie odpowiednich kodów statusu

### Krok 6: Testy
1. Test dla owner z mieszkaniami (z i bez lokatora)
2. Test dla owner bez mieszkań
3. Test dla tenant z aktywnym najmem
4. Test dla tenant bez aktywnego najmu
5. Test dla include_archived=true
6. Test dla nieautoryzowanego dostępu
7. Test walidacji query params

### Krok 7: Dokumentacja
1. JSDoc dla funkcji serwisu
2. Komentarze w kodzie dla skomplikowanych query
3. Aktualizacja API documentation (jeśli istnieje)

---

**Priorytet:** Wysoki (kluczowy endpoint dla dashboard)
**Szacowany czas:** 4-6 godzin
**Zależności:** Middleware autoryzacji, typy DTO
