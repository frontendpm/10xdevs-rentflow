# REST API Plan - Rentflow MVP

## 1. Overview

This document defines the REST API for Rentflow, a property rental management application. The API is built on **Astro + React** frontend with **Supabase** backend (PostgreSQL, Auth, Storage).

### Key Principles
- RESTful design with nested resources where appropriate
- Authentication via Supabase Auth (JWT tokens)
- Authorization via Supabase Row Level Security (RLS) policies
- Input validation via Zod schemas
- Standard HTTP status codes and error responses
- Polish language in all user-facing messages

### Base URL
```
Production: https://rentflow.pl/api
Development: http://localhost:4321/api
```

## 2. Authentication

### 2.1. Overview
Authentication is handled by **Supabase Auth** using email/password. Most API endpoints require a valid JWT token in the `Authorization` header.

### 2.2. Auth Flow
```
Authorization: Bearer <supabase-jwt-token>
```

### 2.3. Registration (Owner)
Handled directly by Supabase Auth:
```
POST https://<supabase-url>/auth/v1/signup
```

**Request Body:**
```json
{
  "email": "owner@example.com",
  "password": "securePassword123",
  "data": {
    "full_name": "Jan Kowalski",
    "role": "owner"
  }
}
```

### 2.4. Registration (Tenant)
Tenants register through invitation links. The process involves:
1. GET `/api/invitations/:token` - validate token and get apartment info
2. Supabase Auth signup with tenant role
3. POST `/api/invitations/:token/accept` - link tenant to apartment

### 2.5. Login
Handled directly by Supabase Auth:
```
POST https://<supabase-url>/auth/v1/token?grant_type=password
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### 2.6. Password Reset
Handled directly by Supabase Auth:
```
POST https://<supabase-url>/auth/v1/recover
```

## 3. Resources

### Main Resources and Database Tables

| Resource | Database Table | Description |
|----------|---------------|-------------|
| Users | `users` | Owner and tenant profiles |
| Apartments | `apartments` | Rental properties |
| Leases | `leases` | Active and archived tenancies |
| Invitations | `invitation_links` | One-time tenant invitation links |
| Charges | `charges` | Rent, bills, and other fees |
| Payments | `payments` | Payments made toward charges |
| Protocols | `protocols` | Move-in and move-out reports |
| Protocol Photos | `protocol_photos` | Photos documenting apartment condition |

## 4. API Endpoints

### 4.1. User Management

#### Get Current User Profile
```
GET /api/users/me
```

**Description:** Get authenticated user's profile with role and related data.

**Authorization:** Required (Owner or Tenant)

**Response 200:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "Jan Kowalski",
  "role": "owner",
  "created_at": "2025-01-12T10:00:00Z",
  "updated_at": "2025-01-12T10:00:00Z"
}
```

**Error 401:**
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

---

#### Update Current User Profile
```
PATCH /api/users/me
```

**Description:** Update current user's profile (full_name only).

**Authorization:** Required (Owner or Tenant)

**Request Body:**
```json
{
  "full_name": "Jan Nowak"
}
```

**Validation:**
- `full_name`: required, string, min 2 characters

**Response 200:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "Jan Nowak",
  "role": "owner",
  "updated_at": "2025-01-12T11:00:00Z"
}
```

**Error 400:**
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowe dane",
  "details": {
    "full_name": "Imię musi mieć co najmniej 2 znaki"
  }
}
```

---

### 4.2. Apartment Management

#### List Apartments
```
GET /api/apartments
```

**Description:** List all apartments owned by the authenticated owner. For tenants, returns the apartment of their active lease.

**Authorization:** Required (Owner or Tenant)

**Query Parameters:**
- `include_archived`: boolean (default: false) - include apartments with archived leases

**Response 200 (Owner):**
```json
{
  "apartments": [
    {
      "id": "uuid",
      "name": "Kawalerka na Woli",
      "address": "ul. Złota 44, Warszawa",
      "created_at": "2025-01-12T10:00:00Z",
      "updated_at": "2025-01-12T10:00:00Z",
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

**Response 200 (Tenant):**
```json
{
  "apartments": [
    {
      "id": "uuid",
      "name": "Kawalerka na Woli",
      "address": "ul. Złota 44, Warszawa",
      "owner": {
        "full_name": "Jan Kowalski",
        "email": "jan@example.com"
      }
    }
  ]
}
```

---

#### Create Apartment
```
POST /api/apartments
```

**Description:** Create a new apartment (owner only).

**Authorization:** Required (Owner only)

**Request Body:**
```json
{
  "name": "Kawalerka na Woli",
  "address": "ul. Złota 44, Warszawa"
}
```

**Validation:**
- `name`: required, string, min 3 characters
- `address`: required, string, min 5 characters

**Response 201:**
```json
{
  "id": "uuid",
  "name": "Kawalerka na Woli",
  "address": "ul. Złota 44, Warszawa",
  "owner_id": "uuid",
  "created_at": "2025-01-12T10:00:00Z",
  "updated_at": "2025-01-12T10:00:00Z"
}
```

**Error 403:**
```json
{
  "error": "Forbidden",
  "message": "Tylko właściciele mogą dodawać mieszkania"
}
```

---

#### Get Apartment Details
```
GET /api/apartments/:id
```

**Description:** Get detailed information about a specific apartment.

**Authorization:** Required (Owner of apartment or Tenant with active lease)

**Response 200:**
```json
{
  "id": "uuid",
  "name": "Kawalerka na Woli",
  "address": "ul. Złota 44, Warszawa",
  "owner_id": "uuid",
  "created_at": "2025-01-12T10:00:00Z",
  "updated_at": "2025-01-12T10:00:00Z",
  "lease": {
    "id": "uuid",
    "status": "active",
    "start_date": "2025-01-01",
    "tenant_id": "uuid",
    "tenant": {
      "full_name": "Anna Kowalska",
      "email": "anna@example.com"
    }
  }
}
```

**Error 404:**
```json
{
  "error": "Not Found",
  "message": "Mieszkanie nie zostało znalezione"
}
```

---

#### Update Apartment
```
PATCH /api/apartments/:id
```

**Description:** Update apartment details (owner only).

**Authorization:** Required (Owner of apartment)

**Request Body:**
```json
{
  "name": "Mieszkanie na Woli",
  "address": "ul. Złota 44/10, Warszawa"
}
```

**Validation:**
- `name`: optional, string, min 3 characters
- `address`: optional, string, min 5 characters

**Response 200:**
```json
{
  "id": "uuid",
  "name": "Mieszkanie na Woli",
  "address": "ul. Złota 44/10, Warszawa",
  "owner_id": "uuid",
  "updated_at": "2025-01-12T11:00:00Z"
}
```

**Error 403:**
```json
{
  "error": "Forbidden",
  "message": "Nie masz uprawnień do edycji tego mieszkania"
}
```

---

#### Delete Apartment
```
DELETE /api/apartments/:id
```

**Description:** Delete an apartment (owner only). Only possible if there are no leases (active or archived).

**Authorization:** Required (Owner of apartment)

**Response 204:** No content

**Error 400:**
```json
{
  "error": "Bad Request",
  "message": "Nie można usunąć mieszkania z istniejącymi najmami. Najpierw usuń wszystkie najmy."
}
```

**Error 403:**
```json
{
  "error": "Forbidden",
  "message": "Nie masz uprawnień do usunięcia tego mieszkania"
}
```

---

#### Get Apartment Summary
```
GET /api/apartments/:id/summary
```

**Description:** Get apartment summary with financial overview (for owner dashboard).

**Authorization:** Required (Owner of apartment)

**Response 200:**
```json
{
  "apartment": {
    "id": "uuid",
    "name": "Kawalerka na Woli",
    "address": "ul. Złota 44, Warszawa"
  },
  "lease": {
    "id": "uuid",
    "status": "active",
    "tenant": {
      "full_name": "Anna Kowalska"
    }
  },
  "financial_summary": {
    "total_unpaid": 2000.00,
    "total_partially_paid": 500.00,
    "total_overdue": 1500.00,
    "upcoming_charges_count": 2
  }
}
```

---

### 4.3. Invitation Management

#### Create Invitation Link
```
POST /api/apartments/:apartmentId/invitations
```

**Description:** Generate a one-time invitation link for a tenant (owner only).

**Authorization:** Required (Owner of apartment)

**Business Rules:**
- Apartment must not have an active lease
- Previous invitation links for this apartment become expired

**Response 201:**
```json
{
  "id": "uuid",
  "apartment_id": "uuid",
  "token": "unique-token-string",
  "status": "pending",
  "invitation_url": "https://rentflow.pl/register/tenant?token=unique-token-string",
  "created_at": "2025-01-12T10:00:00Z"
}
```

**Error 400:**
```json
{
  "error": "Bad Request",
  "message": "To mieszkanie ma już aktywnego lokatora"
}
```

**Error 403:**
```json
{
  "error": "Forbidden",
  "message": "Nie masz uprawnień do zapraszania lokatorów do tego mieszkania"
}
```

---

#### List Invitation Links
```
GET /api/apartments/:apartmentId/invitations
```

**Description:** List invitation links for an apartment (owner only).

**Authorization:** Required (Owner of apartment)

**Response 200:**
```json
{
  "invitations": [
    {
      "id": "uuid",
      "token": "unique-token-string",
      "status": "accepted",
      "accepted_by": {
        "id": "uuid",
        "full_name": "Anna Kowalska"
      },
      "created_at": "2025-01-12T10:00:00Z"
    }
  ]
}
```

---

#### Validate Invitation Token (Public)
```
GET /api/invitations/:token
```

**Description:** Validate an invitation token and get apartment details for tenant registration.

**Authorization:** Public (no auth required)

**Response 200:**
```json
{
  "valid": true,
  "apartment": {
    "name": "Kawalerka na Woli",
    "address": "ul. Złota 44, Warszawa"
  },
  "owner": {
    "full_name": "Jan Kowalski"
  }
}
```

**Error 400:**
```json
{
  "error": "Invalid Token",
  "message": "Ten link zapraszający wygasł lub został już wykorzystany"
}
```

---

#### Accept Invitation
```
POST /api/invitations/:token/accept
```

**Description:** Accept an invitation and create a lease (called after tenant registers via Supabase Auth).

**Authorization:** Required (Authenticated user who just registered)

**Business Rules:**
- Token must be valid (pending status)
- User must not have an active lease already
- Creates a new lease with status "active"
- Marks invitation as "accepted"

**Response 200:**
```json
{
  "lease": {
    "id": "uuid",
    "apartment_id": "uuid",
    "tenant_id": "uuid",
    "status": "active",
    "start_date": "2025-01-12",
    "created_at": "2025-01-12T10:00:00Z"
  }
}
```

**Error 400:**
```json
{
  "error": "Bad Request",
  "message": "Twoje konto jest już przypisane do aktywnego najmu"
}
```

---

### 4.4. Lease Management

#### Get Active Lease
```
GET /api/apartments/:apartmentId/lease
```

**Description:** Get the active lease for an apartment.

**Authorization:** Required (Owner of apartment or Tenant of the lease)

**Response 200:**
```json
{
  "id": "uuid",
  "apartment_id": "uuid",
  "tenant_id": "uuid",
  "status": "active",
  "start_date": "2025-01-01",
  "notes": "Lokator preferuje kontakt przez email",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-01T10:00:00Z",
  "tenant": {
    "id": "uuid",
    "full_name": "Anna Kowalska",
    "email": "anna@example.com"
  }
}
```

**Error 404:**
```json
{
  "error": "Not Found",
  "message": "Brak aktywnego najmu dla tego mieszkania"
}
```

---

#### End Lease (Archive)
```
POST /api/apartments/:apartmentId/lease/end
```

**Description:** End the active lease (owner only). Archives the lease and removes tenant access.

**Authorization:** Required (Owner of apartment)

**Request Body:**
```json
{
  "notes": "Koniec umowy najmu"
}
```

**Business Rules:**
- Lease status changes from "active" to "archived"
- `archived_at` timestamp is set
- Tenant loses access to apartment data
- Apartment becomes available for a new tenant

**Response 200:**
```json
{
  "id": "uuid",
  "apartment_id": "uuid",
  "tenant_id": "uuid",
  "status": "archived",
  "start_date": "2025-01-01",
  "archived_at": "2025-01-12T10:00:00Z",
  "notes": "Koniec umowy najmu"
}
```

**Error 404:**
```json
{
  "error": "Not Found",
  "message": "Brak aktywnego najmu do zakończenia"
}
```

---

#### Get Lease History
```
GET /api/apartments/:apartmentId/leases
```

**Description:** Get all leases (active and archived) for an apartment (owner only).

**Authorization:** Required (Owner of apartment)

**Query Parameters:**
- `status`: string (optional) - filter by status (active, archived)

**Response 200:**
```json
{
  "leases": [
    {
      "id": "uuid",
      "status": "archived",
      "start_date": "2024-01-01",
      "archived_at": "2024-12-31T23:59:59Z",
      "tenant": {
        "full_name": "Piotr Nowak"
      }
    },
    {
      "id": "uuid",
      "status": "active",
      "start_date": "2025-01-01",
      "tenant": {
        "full_name": "Anna Kowalska"
      }
    }
  ]
}
```

---

### 4.5. Charge Management

#### List Charges
```
GET /api/apartments/:apartmentId/charges
```

**Description:** List charges for an apartment's active lease, grouped by month.

**Authorization:** Required (Owner of apartment or Tenant with active lease)

**Query Parameters:**
- `lease_id`: uuid (optional) - get charges for specific lease (for history view)
- `month`: string (optional) - filter by month (YYYY-MM format)
- `status`: string (optional) - filter by payment status (unpaid, partially_paid, paid)
- `overdue`: boolean (optional) - filter overdue charges

**Response 200:**
```json
{
  "charges_by_month": {
    "2025-01": [
      {
        "id": "uuid",
        "lease_id": "uuid",
        "amount": 2000.00,
        "due_date": "2025-01-10",
        "type": "rent",
        "comment": "Czynsz za styczeń 2025",
        "attachment_path": "apartment-uuid/charge-uuid.pdf",
        "attachment_url": "https://storage.supabase.co/...",
        "created_at": "2025-01-01T10:00:00Z",
        "payment_status": "partially_paid",
        "total_paid": 1000.00,
        "remaining_amount": 1000.00,
        "is_overdue": false
      }
    ],
    "2024-12": [
      {
        "id": "uuid",
        "amount": 2000.00,
        "due_date": "2024-12-10",
        "type": "rent",
        "payment_status": "paid",
        "total_paid": 2000.00,
        "remaining_amount": 0.00,
        "is_overdue": false
      }
    ]
  }
}
```

---

#### Create Charge
```
POST /api/apartments/:apartmentId/charges
```

**Description:** Create a new charge for the apartment's active lease (owner only).

**Authorization:** Required (Owner of apartment)

**Request Body:**
```json
{
  "amount": 2000.00,
  "due_date": "2025-02-10",
  "type": "rent",
  "comment": "Czynsz za luty 2025"
}
```

**Validation:**
- `amount`: required, number, must be > 0, max 2 decimal places
- `due_date`: required, date (ISO 8601)
- `type`: required, enum (rent, bill, other)
- `comment`: optional, string, max 300 characters

**Response 201:**
```json
{
  "id": "uuid",
  "lease_id": "uuid",
  "amount": 2000.00,
  "due_date": "2025-02-10",
  "type": "rent",
  "comment": "Czynsz za luty 2025",
  "attachment_path": null,
  "created_at": "2025-01-12T10:00:00Z",
  "payment_status": "unpaid",
  "total_paid": 0.00,
  "remaining_amount": 2000.00,
  "is_overdue": false
}
```

**Error 400:**
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowe dane",
  "details": {
    "amount": "Kwota musi być większa od 0"
  }
}
```

**Error 404:**
```json
{
  "error": "Not Found",
  "message": "Brak aktywnego najmu dla tego mieszkania"
}
```

---

#### Get Charge Details
```
GET /api/charges/:id
```

**Description:** Get detailed information about a specific charge, including payments.

**Authorization:** Required (Owner of apartment or Tenant with active lease)

**Response 200:**
```json
{
  "id": "uuid",
  "lease_id": "uuid",
  "amount": 2000.00,
  "due_date": "2025-01-10",
  "type": "rent",
  "comment": "Czynsz za styczeń 2025",
  "attachment_path": "apartment-uuid/charge-uuid.pdf",
  "attachment_url": "https://storage.supabase.co/...",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-05T15:00:00Z",
  "payment_status": "partially_paid",
  "total_paid": 1000.00,
  "remaining_amount": 1000.00,
  "is_overdue": false,
  "payments": [
    {
      "id": "uuid",
      "amount": 1000.00,
      "payment_date": "2025-01-05",
      "created_at": "2025-01-05T15:00:00Z"
    }
  ]
}
```

---

#### Update Charge
```
PATCH /api/charges/:id
```

**Description:** Update charge details (owner only).

**Authorization:** Required (Owner of apartment)

**Request Body:**
```json
{
  "amount": 2100.00,
  "due_date": "2025-01-15",
  "type": "rent",
  "comment": "Czynsz za styczeń 2025 - zaktualizowana kwota"
}
```

**Validation:**
- `amount`: optional, number, must be > 0, must be >= total_paid
- `due_date`: optional, date (ISO 8601)
- `type`: optional, enum (rent, bill, other)
- `comment`: optional, string, max 300 characters

**Business Rules:**
- Cannot edit if payment_status is "paid" (enforced by DB trigger)
- Amount cannot be less than total payments made (enforced by DB trigger)

**Response 200:**
```json
{
  "id": "uuid",
  "amount": 2100.00,
  "due_date": "2025-01-15",
  "type": "rent",
  "comment": "Czynsz za styczeń 2025 - zaktualizowana kwota",
  "updated_at": "2025-01-12T10:00:00Z",
  "payment_status": "partially_paid",
  "total_paid": 1000.00,
  "remaining_amount": 1100.00
}
```

**Error 400 (Fully Paid):**
```json
{
  "error": "Bad Request",
  "message": "Nie można edytować w pełni opłaconej opłaty"
}
```

**Error 400 (Amount Too Low):**
```json
{
  "error": "Bad Request",
  "message": "Kwota opłaty nie może być niższa niż suma dokonanych wpłat (1000.00 zł)"
}
```

---

#### Delete Charge
```
DELETE /api/charges/:id
```

**Description:** Delete a charge (owner only).

**Authorization:** Required (Owner of apartment)

**Business Rules:**
- Cannot delete if payment_status is "paid"
- Deleting a charge also deletes all associated payments (cascade)

**Response 204:** No content

**Error 400:**
```json
{
  "error": "Bad Request",
  "message": "Nie można usunąć w pełni opłaconej opłaty"
}
```

---

#### Upload Charge Attachment
```
POST /api/charges/:id/attachment
```

**Description:** Upload an attachment file for a charge (owner only).

**Authorization:** Required (Owner of apartment)

**Request:** multipart/form-data
- `file`: File (PDF, JPG, or PNG, max 5MB)

**Validation:**
- File type: PDF, JPG, PNG only (MIME type check)
- File size: max 5MB
- Only 1 attachment per charge (replaces existing)

**Response 200:**
```json
{
  "id": "uuid",
  "attachment_path": "apartment-uuid/charge-uuid.pdf",
  "attachment_url": "https://storage.supabase.co/..."
}
```

**Error 400 (Invalid File):**
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowy format pliku. Dozwolone: PDF, JPG, PNG"
}
```

**Error 413 (File Too Large):**
```json
{
  "error": "Payload Too Large",
  "message": "Rozmiar pliku nie może przekraczać 5MB"
}
```

---

#### Delete Charge Attachment
```
DELETE /api/charges/:id/attachment
```

**Description:** Delete the attachment file for a charge (owner only).

**Authorization:** Required (Owner of apartment)

**Response 204:** No content

**Error 404:**
```json
{
  "error": "Not Found",
  "message": "Brak załącznika do usunięcia"
}
```

---

### 4.6. Payment Management

#### List Payments for Charge
```
GET /api/charges/:chargeId/payments
```

**Description:** List all payments for a specific charge.

**Authorization:** Required (Owner of apartment or Tenant with active lease)

**Response 200:**
```json
{
  "payments": [
    {
      "id": "uuid",
      "charge_id": "uuid",
      "amount": 500.00,
      "payment_date": "2025-01-05",
      "created_at": "2025-01-05T15:00:00Z",
      "updated_at": "2025-01-05T15:00:00Z"
    },
    {
      "id": "uuid",
      "amount": 500.00,
      "payment_date": "2025-01-10",
      "created_at": "2025-01-10T12:00:00Z"
    }
  ],
  "total": 1000.00
}
```

---

#### Add Payment to Charge
```
POST /api/charges/:chargeId/payments
```

**Description:** Add a payment to a charge (owner only).

**Authorization:** Required (Owner of apartment)

**Request Body:**
```json
{
  "amount": 1000.00,
  "payment_date": "2025-01-05"
}
```

**Validation:**
- `amount`: required, number, must be > 0
- `payment_date`: required, date (ISO 8601)

**Business Rules:**
- Total payments cannot exceed charge amount (enforced by DB trigger)
- Payment amount cannot exceed remaining charge amount

**Response 201:**
```json
{
  "id": "uuid",
  "charge_id": "uuid",
  "amount": 1000.00,
  "payment_date": "2025-01-05",
  "created_at": "2025-01-05T15:00:00Z"
}
```

**Error 400:**
```json
{
  "error": "Bad Request",
  "message": "Suma wpłat (2500.00 zł) nie może przekroczyć kwoty opłaty (2000.00 zł)"
}
```

---

#### Update Payment
```
PATCH /api/payments/:id
```

**Description:** Update payment details (owner only).

**Authorization:** Required (Owner of apartment)

**Request Body:**
```json
{
  "amount": 1200.00,
  "payment_date": "2025-01-06"
}
```

**Validation:**
- `amount`: optional, number, must be > 0
- `payment_date`: optional, date (ISO 8601)

**Business Rules:**
- Total payments (after update) cannot exceed charge amount

**Response 200:**
```json
{
  "id": "uuid",
  "charge_id": "uuid",
  "amount": 1200.00,
  "payment_date": "2025-01-06",
  "updated_at": "2025-01-12T10:00:00Z"
}
```

---

#### Delete Payment
```
DELETE /api/payments/:id
```

**Description:** Delete a payment (owner only).

**Authorization:** Required (Owner of apartment)

**Response 204:** No content

---

### 4.7. Protocol Management

#### Get Protocol
```
GET /api/apartments/:apartmentId/protocols/:type
```

**Description:** Get a protocol (move_in or move_out) for the apartment's active lease.

**Authorization:** Required (Owner of apartment or Tenant with active lease)

**Path Parameters:**
- `type`: enum (move_in, move_out)

**Response 200:**
```json
{
  "id": "uuid",
  "lease_id": "uuid",
  "type": "move_in",
  "description": "Stan liczników:\n- Prąd: 12345 kWh\n- Woda: 678 m³\n\nUsterki:\n- Brak",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-01T10:00:00Z",
  "photos": [
    {
      "id": "uuid",
      "file_path": "apartment-uuid/protocol-uuid/photo1.jpg",
      "file_url": "https://storage.supabase.co/...",
      "uploaded_at": "2025-01-01T10:00:00Z"
    }
  ]
}
```

**Error 404:**
```json
{
  "error": "Not Found",
  "message": "Protokół nie został jeszcze utworzony"
}
```

---

#### Create or Update Protocol
```
PUT /api/apartments/:apartmentId/protocols/:type
```

**Description:** Create a new protocol or update existing one (owner only).

**Authorization:** Required (Owner of apartment)

**Path Parameters:**
- `type`: enum (move_in, move_out)

**Request Body:**
```json
{
  "description": "Stan liczników:\n- Prąd: 12345 kWh\n- Woda: 678 m³"
}
```

**Validation:**
- `description`: required, string

**Response 200 (Update):**
```json
{
  "id": "uuid",
  "lease_id": "uuid",
  "type": "move_in",
  "description": "Stan liczników:\n- Prąd: 12345 kWh\n- Woda: 678 m³",
  "updated_at": "2025-01-12T10:00:00Z"
}
```

**Response 201 (Create):**
```json
{
  "id": "uuid",
  "lease_id": "uuid",
  "type": "move_in",
  "description": "Stan liczników:\n- Prąd: 12345 kWh\n- Woda: 678 m³",
  "created_at": "2025-01-12T10:00:00Z"
}
```

**Error 404:**
```json
{
  "error": "Not Found",
  "message": "Brak aktywnego najmu dla tego mieszkania"
}
```

---

#### Upload Protocol Photo
```
POST /api/apartments/:apartmentId/protocols/:type/photos
```

**Description:** Upload a photo to a protocol (owner only).

**Authorization:** Required (Owner of apartment)

**Path Parameters:**
- `type`: enum (move_in, move_out)

**Request:** multipart/form-data
- `file`: File (JPG or PNG, max 5MB)

**Validation:**
- File type: JPG, PNG only (MIME type check)
- File size: max 5MB per photo
- Max 10 photos per protocol (enforced by DB trigger)

**Response 201:**
```json
{
  "id": "uuid",
  "protocol_id": "uuid",
  "file_path": "apartment-uuid/protocol-uuid/photo1.jpg",
  "file_url": "https://storage.supabase.co/...",
  "uploaded_at": "2025-01-12T10:00:00Z"
}
```

**Error 400 (Limit Reached):**
```json
{
  "error": "Bad Request",
  "message": "Nie można dodać więcej niż 10 zdjęć do protokołu"
}
```

**Error 400 (Invalid File):**
```json
{
  "error": "Validation Error",
  "message": "Nieprawidłowy format pliku. Dozwolone: JPG, PNG"
}
```

**Error 413:**
```json
{
  "error": "Payload Too Large",
  "message": "Rozmiar pliku nie może przekraczać 5MB"
}
```

---

#### Delete Protocol Photo
```
DELETE /api/apartments/:apartmentId/protocols/:type/photos/:photoId
```

**Description:** Delete a photo from a protocol (owner only).

**Authorization:** Required (Owner of apartment)

**Path Parameters:**
- `type`: enum (move_in, move_out)
- `photoId`: uuid

**Response 204:** No content

**Error 404:**
```json
{
  "error": "Not Found",
  "message": "Zdjęcie nie zostało znalezione"
}
```

---

### 4.8. Dashboard

#### Get Dashboard Data
```
GET /api/dashboard
```

**Description:** Get dashboard data based on user role. For owners: list of apartments with summaries. For tenants: apartment info and financial summary.

**Authorization:** Required (Owner or Tenant)

**Response 200 (Owner):**
```json
{
  "role": "owner",
  "apartments": [
    {
      "id": "uuid",
      "name": "Kawalerka na Woli",
      "address": "ul. Złota 44, Warszawa",
      "lease_status": "active",
      "tenant": {
        "full_name": "Anna Kowalska"
      },
      "financial_summary": {
        "total_unpaid": 2000.00,
        "total_overdue": 0.00
      }
    }
  ],
  "statistics": {
    "total_apartments": 1,
    "active_leases": 1,
    "total_unpaid": 2000.00,
    "total_overdue": 0.00
  }
}
```

**Response 200 (Tenant):**
```json
{
  "role": "tenant",
  "apartment": {
    "id": "uuid",
    "name": "Kawalerka na Woli",
    "address": "ul. Złota 44, Warszawa",
    "owner": {
      "full_name": "Jan Kowalski",
      "email": "jan@example.com"
    }
  },
  "financial_summary": {
    "total_due": 2000.00,
    "total_overdue": 0.00,
    "upcoming_charges": [
      {
        "id": "uuid",
        "amount": 2000.00,
        "due_date": "2025-02-10",
        "type": "rent"
      }
    ]
  }
}
```

---

## 5. Error Responses

### Standard Error Format
All errors follow this format:

```json
{
  "error": "Error Type",
  "message": "User-friendly error message in Polish",
  "details": {} // Optional, for validation errors
}
```

### HTTP Status Codes

| Status Code | Description | Example Use Case |
|------------|-------------|------------------|
| 200 | OK | Successful GET, PATCH |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Validation error, business rule violation |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | User doesn't have permission |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource (e.g., active lease already exists) |
| 413 | Payload Too Large | File size exceeds limit |
| 422 | Unprocessable Entity | Invalid request format |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |

---

## 6. Authentication & Authorization

### 6.1. Authentication Flow

1. **User Registration (Owner)**
   - User registers via Supabase Auth
   - Trigger creates profile in `users` table with role='owner'
   - User is redirected to onboarding wizard

2. **User Registration (Tenant)**
   - User receives invitation link
   - User validates token: GET `/api/invitations/:token`
   - User registers via Supabase Auth with role='tenant'
   - User accepts invitation: POST `/api/invitations/:token/accept`
   - Lease is created automatically

3. **Login**
   - User logs in via Supabase Auth
   - JWT token is returned
   - Frontend stores token and includes it in all API requests

### 6.2. Authorization Rules

#### Owner Permissions
- Full CRUD on their own apartments
- Full CRUD on leases for their apartments
- Full CRUD on charges, payments, protocols for their apartments
- Can generate invitation links
- Can end leases (archive)

#### Tenant Permissions
- Read-only access to their active lease's apartment
- Read-only access to charges and payments
- Read-only access to protocols
- Cannot create, update, or delete anything

### 6.3. RLS Implementation

All authorization is enforced by **Supabase Row Level Security (RLS) policies**:

- Each table has RLS enabled
- Separate policies for SELECT, INSERT, UPDATE, DELETE
- Separate policies for `authenticated` and `anon` roles
- Policies check `auth.uid()` against owner_id or tenant_id
- API routes rely on RLS; no additional auth checks needed in most cases

### 6.4. Public Endpoints

Only these endpoints are accessible without authentication:
- GET `/api/invitations/:token` - Validate invitation token

---

## 7. Validation & Business Logic

### 7.1. Input Validation

All API endpoints use **Zod schemas** for input validation:

#### Common Validations
- Email: valid email format
- Password: minimum 8 characters
- Amount: number > 0, max 2 decimal places
- Date: ISO 8601 format (YYYY-MM-DD)
- Comment: max 300 characters
- File: PDF/JPG/PNG only, max 5MB

#### Example Zod Schema (Charge)
```typescript
const createChargeSchema = z.object({
  amount: z.number().positive().multipleOf(0.01),
  due_date: z.string().datetime(),
  type: z.enum(['rent', 'bill', 'other']),
  comment: z.string().max(300).optional()
});
```

### 7.2. Business Logic Rules

#### Lease Management
1. **One active lease per apartment**
   - Enforced by unique index: `idx_one_active_lease_per_apartment`
   - Validated before creating invitation link

2. **One active lease per tenant**
   - Enforced by unique index: `idx_one_active_lease_per_tenant`
   - Validated before accepting invitation

3. **Apartment deletion**
   - Only possible if no leases exist (active or archived)
   - Enforced by database trigger: `prevent_apartment_deletion_with_leases`

#### Charge & Payment Logic
1. **Charge edit restrictions**
   - Cannot edit if payment_status = 'paid'
   - Cannot reduce amount below total_paid
   - Enforced by database trigger: `check_charge_edit_constraints`

2. **Payment sum validation**
   - Total payments cannot exceed charge amount
   - Enforced by database trigger: `check_payment_sum`

3. **Payment status calculation**
   - Automatically computed by `charges_with_status` view
   - Status: unpaid (0), partially_paid (0 < paid < amount), paid (paid >= amount)
   - Overdue: due_date < today AND status != paid

#### Protocol Logic
1. **Max 2 protocols per lease**
   - One move_in, one move_out
   - Enforced by unique constraint: `(lease_id, type)`

2. **Max 10 photos per protocol**
   - Enforced by database trigger: `check_protocol_photos_limit`

#### File Upload
1. **Charge attachments**
   - 1 file per charge (replaces existing)
   - Max 5MB
   - PDF, JPG, PNG only

2. **Protocol photos**
   - Max 10 photos per protocol
   - Max 5MB per photo
   - JPG, PNG only

### 7.3. Data Integrity

#### Cascading Deletes
- Delete apartment → deletes invitation_links (CASCADE)
- Delete lease → deletes charges, protocols (CASCADE)
- Delete charge → deletes payments (CASCADE)
- Delete protocol → deletes protocol_photos (CASCADE)

#### Restricted Deletes
- Cannot delete apartment if leases exist (RESTRICT via trigger)
- Cannot delete user if they own apartments (RESTRICT)
- Cannot delete user if they are a tenant in a lease (RESTRICT)

---

## 8. Performance & Optimization

### 8.1. Database Indexes

All foreign keys have indexes for efficient JOINs:
- `apartments.owner_id`
- `leases.apartment_id`, `leases.tenant_id`
- `charges.lease_id`
- `payments.charge_id`
- `protocols.lease_id`
- `protocol_photos.protocol_id`

Additional indexes for filtering:
- `charges.due_date DESC` (for sorting)
- `charges.type` (for filtering)
- `leases.status` (for filtering active leases)

### 8.2. Pagination

List endpoints support pagination via query parameters:
- `limit`: number of items per page (default: 50, max: 100)
- `offset`: number of items to skip
- `cursor`: for cursor-based pagination (future implementation)

Example:
```
GET /api/apartments/uuid/charges?limit=20&offset=0
```

### 8.3. Caching Strategy

- Static content: cached by CDN
- User-specific data: no caching (always fresh)
- Dashboard data: could be cached for 1 minute (future optimization)

### 8.4. Rate Limiting

Supabase provides built-in rate limiting:
- 100 requests per second per IP
- Higher limits for authenticated users

---

## 9. Security Considerations

### 9.1. Input Sanitization
- All user input is validated via Zod schemas
- SQL injection prevented by Supabase prepared statements
- XSS prevented by React's automatic escaping

### 9.2. File Upload Security
- MIME type validation (not just extension)
- File size limits strictly enforced
- Files stored in Supabase Storage with RLS policies
- Signed URLs with expiration for secure access

### 9.3. Authentication Security
- JWT tokens with expiration
- HTTPS only (enforced by hosting)
- Password hashing via Supabase Auth (bcrypt)
- Email verification for password reset

### 9.4. Authorization Security
- All data access controlled by RLS policies
- No data leakage between owners
- Tenants cannot access other tenants' data
- Archived lease data inaccessible to former tenants

### 9.5. CORS Configuration
```javascript
const corsOptions = {
  origin: process.env.PUBLIC_APP_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
```

---

## 10. Testing Strategy

### 10.1. Unit Tests
- Zod schema validation
- Business logic functions
- Utility functions

### 10.2. Integration Tests
- API endpoint tests with mock Supabase client
- Test all success cases
- Test all error cases
- Test authorization scenarios

### 10.3. E2E Tests (Playwright)
- Complete user flows:
  - Owner onboarding
  - Tenant registration via invitation
  - Creating charges and payments
  - Uploading files
  - Ending lease

---

## 11. Implementation Notes

### 11.1. Tech Stack Integration

#### Astro API Routes
```typescript
// src/pages/api/apartments/index.ts
export const prerender = false;

export async function GET(context: APIContext) {
  const supabase = context.locals.supabase;
  const user = context.locals.user;

  // Implementation
}
```

#### Supabase Client
```typescript
// Use context.locals.supabase in API routes
const { data, error } = await context.locals.supabase
  .from('apartments')
  .select('*')
  .eq('owner_id', user.id);
```

#### Type Safety
```typescript
// All types generated from database schema
import type { Database } from '@/db/database.types';
type Apartment = Database['public']['Tables']['apartments']['Row'];
```

### 11.2. Error Handling Pattern

```typescript
try {
  // Validate input
  const validated = schema.parse(requestBody);

  // Business logic
  const result = await service.doSomething(validated);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
} catch (error) {
  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({
      error: 'Validation Error',
      message: 'Nieprawidłowe dane',
      details: error.flatten()
    }), { status: 400 });
  }

  // Handle other errors
  console.error('API Error:', error);
  return new Response(JSON.stringify({
    error: 'Internal Server Error',
    message: 'Wystąpił błąd serwera'
  }), { status: 500 });
}
```

---

## 12. Future Enhancements (Post-MVP)

### 12.1. Notifications
- Email notifications for upcoming charges
- Email notifications for overdue payments
- Implemented via Supabase Edge Functions

### 12.2. Real-time Updates
- Use Supabase Realtime for live updates
- Notify owner when tenant views a charge
- Notify tenant when owner adds a payment

### 12.3. Advanced Analytics
- Dashboard with charts (monthly income, payment trends)
- Export to PDF/CSV
- Financial reports

### 12.4. Webhooks
- Integration with external systems
- Accounting software integration

---

## 13. Appendix

### 13.1. Complete Endpoint List

| Method | Endpoint | Auth | Role |
|--------|----------|------|------|
| GET | /api/users/me | Yes | Any |
| PATCH | /api/users/me | Yes | Any |
| GET | /api/apartments | Yes | Any |
| POST | /api/apartments | Yes | Owner |
| GET | /api/apartments/:id | Yes | Owner/Tenant |
| PATCH | /api/apartments/:id | Yes | Owner |
| DELETE | /api/apartments/:id | Yes | Owner |
| GET | /api/apartments/:id/summary | Yes | Owner |
| POST | /api/apartments/:id/invitations | Yes | Owner |
| GET | /api/apartments/:id/invitations | Yes | Owner |
| GET | /api/invitations/:token | No | Public |
| POST | /api/invitations/:token/accept | Yes | Any |
| GET | /api/apartments/:id/lease | Yes | Owner/Tenant |
| POST | /api/apartments/:id/lease/end | Yes | Owner |
| GET | /api/apartments/:id/leases | Yes | Owner |
| GET | /api/apartments/:id/charges | Yes | Owner/Tenant |
| POST | /api/apartments/:id/charges | Yes | Owner |
| GET | /api/charges/:id | Yes | Owner/Tenant |
| PATCH | /api/charges/:id | Yes | Owner |
| DELETE | /api/charges/:id | Yes | Owner |
| POST | /api/charges/:id/attachment | Yes | Owner |
| DELETE | /api/charges/:id/attachment | Yes | Owner |
| GET | /api/charges/:id/payments | Yes | Owner/Tenant |
| POST | /api/charges/:id/payments | Yes | Owner |
| PATCH | /api/payments/:id | Yes | Owner |
| DELETE | /api/payments/:id | Yes | Owner |
| GET | /api/apartments/:id/protocols/:type | Yes | Owner/Tenant |
| PUT | /api/apartments/:id/protocols/:type | Yes | Owner |
| POST | /api/apartments/:id/protocols/:type/photos | Yes | Owner |
| DELETE | /api/apartments/:id/protocols/:type/photos/:photoId | Yes | Owner |
| GET | /api/dashboard | Yes | Any |

---

## 14. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-12 | Initial API plan based on db-plan.md and prd.md |

---

**Document Status:** Ready for Implementation
**Last Updated:** 2025-01-12
**Author:** AI Development Assistant
