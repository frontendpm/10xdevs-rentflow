# Plan testów dla endpointów zaproszeń

## Przegląd

Dokument opisuje scenariusze testowe dla 4 endpointów związanych z zaproszeniami:
1. POST /api/apartments/:id/invitations
2. GET /api/apartments/:id/invitations
3. GET /api/invitations/:token (publiczny)
4. POST /api/invitations/:token/accept

## Przygotowanie środowiska testowego

### Dane testowe

**Owner (właściciel):**
- Email: owner@test.pl
- Password: Test1234!
- Role: owner

**Apartment (mieszkanie):**
- Name: "Mieszkanie testowe"
- Address: "ul. Testowa 1, Warszawa"
- Owner: owner@test.pl

**Tenant (lokator - do rejestracji):**
- Email: tenant@test.pl
- Password: Test1234!
- Full name: "Jan Kowalski"

### Setup

1. Uruchom Supabase lokalnie lub użyj projektu testowego
2. Zastosuj wszystkie migracje z `/supabase/migrations/`
3. Zarejestruj właściciela (owner@test.pl)
4. Dodaj mieszkanie przez dashboard
5. Zapisz ID mieszkania do testów

## Testy endpointu: POST /api/apartments/:id/invitations

### Test 1: Utworzenie zaproszenia - sukces (201)

**Endpoint:** POST /api/apartments/:id/invitations

**Warunki wstępne:**
- Użytkownik zalogowany jako owner@test.pl
- Mieszkanie nie ma aktywnego lokatora

**Request:**
```bash
curl -X POST "http://localhost:4321/api/apartments/{apartment_id}/invitations" \
  -H "Authorization: Bearer {owner_jwt_token}" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik:**
- Status: 201 Created
- Response zawiera:
  - `id`: UUID
  - `apartment_id`: UUID mieszkania
  - `token`: UUID v4
  - `status`: "pending"
  - `invitation_url`: pełny URL (np. "http://localhost:4321/register/tenant?token=...")
  - `created_at`: timestamp

**Weryfikacja:**
- Token jest unikalny (UUID v4)
- URL zawiera token
- Status to "pending"

### Test 2: Automatyczne wygaszanie poprzednich zaproszeń

**Endpoint:** POST /api/apartments/:id/invitations

**Warunki wstępne:**
- Użytkownik zalogowany jako owner@test.pl
- Istnieje już jedno pending zaproszenie dla tego mieszkania

**Request:**
```bash
curl -X POST "http://localhost:4321/api/apartments/{apartment_id}/invitations" \
  -H "Authorization: Bearer {owner_jwt_token}" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik:**
- Status: 201 Created
- Nowe zaproszenie utworzone
- Poprzednie zaproszenie ma status "expired"

**Weryfikacja:**
```bash
# Sprawdź listę zaproszeń
curl -X GET "http://localhost:4321/api/apartments/{apartment_id}/invitations" \
  -H "Authorization: Bearer {owner_jwt_token}"

# Oczekiwane: 2 zaproszenia
# - Pierwsze: status = "expired"
# - Drugie: status = "pending"
```

### Test 3: Błąd - mieszkanie ma aktywnego lokatora (400)

**Endpoint:** POST /api/apartments/:id/invitations

**Warunki wstępne:**
- Użytkownik zalogowany jako owner@test.pl
- Mieszkanie ma już aktywny najem (lease.status = 'active')

**Request:**
```bash
curl -X POST "http://localhost:4321/api/apartments/{apartment_id}/invitations" \
  -H "Authorization: Bearer {owner_jwt_token}" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik:**
- Status: 400 Bad Request
- Response:
```json
{
  "error": "Bad Request",
  "message": "To mieszkanie ma już aktywnego lokatora"
}
```

### Test 4: Błąd - brak autoryzacji (401)

**Endpoint:** POST /api/apartments/:id/invitations

**Warunki wstępne:**
- Brak tokenu JWT w headerze

**Request:**
```bash
curl -X POST "http://localhost:4321/api/apartments/{apartment_id}/invitations" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik:**
- Status: 401 Unauthorized
- Response:
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

### Test 5: Błąd - nie jesteś właścicielem (404)

**Endpoint:** POST /api/apartments/:id/invitations

**Warunki wstępne:**
- Użytkownik zalogowany jako inny owner (nie właściciel tego mieszkania)

**Request:**
```bash
curl -X POST "http://localhost:4321/api/apartments/{other_apartment_id}/invitations" \
  -H "Authorization: Bearer {other_owner_jwt_token}" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik:**
- Status: 404 Not Found
- Response:
```json
{
  "error": "Not Found",
  "message": "Mieszkanie nie zostało znalezione"
}
```

### Test 6: Błąd - nieprawidłowy UUID (400)

**Endpoint:** POST /api/apartments/:id/invitations

**Request:**
```bash
curl -X POST "http://localhost:4321/api/apartments/invalid-uuid/invitations" \
  -H "Authorization: Bearer {owner_jwt_token}" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik:**
- Status: 400 Bad Request
- Response zawiera walidację UUID

---

## Testy endpointu: GET /api/apartments/:id/invitations

### Test 7: Pobranie listy zaproszeń - sukces (200)

**Endpoint:** GET /api/apartments/:id/invitations

**Warunki wstępne:**
- Użytkownik zalogowany jako owner@test.pl
- Mieszkanie ma kilka zaproszeń (pending, expired, accepted)

**Request:**
```bash
curl -X GET "http://localhost:4321/api/apartments/{apartment_id}/invitations" \
  -H "Authorization: Bearer {owner_jwt_token}"
```

**Oczekiwany wynik:**
- Status: 200 OK
- Response:
```json
{
  "invitations": [
    {
      "id": "uuid",
      "token": "token-string",
      "status": "accepted",
      "accepted_by": {
        "id": "uuid",
        "full_name": "Jan Kowalski"
      },
      "created_at": "2025-01-15T10:00:00Z"
    },
    {
      "id": "uuid",
      "token": "token-string",
      "status": "expired",
      "created_at": "2025-01-10T10:00:00Z"
    },
    {
      "id": "uuid",
      "token": "token-string",
      "status": "pending",
      "created_at": "2025-01-12T10:00:00Z"
    }
  ]
}
```

**Weryfikacja:**
- Lista sortowana od najnowszych (created_at DESC)
- accepted zaproszenia mają pole `accepted_by`
- pending/expired nie mają `accepted_by`

### Test 8: Pusta lista zaproszeń (200)

**Endpoint:** GET /api/apartments/:id/invitations

**Warunki wstępne:**
- Użytkownik zalogowany jako owner@test.pl
- Mieszkanie nie ma żadnych zaproszeń

**Request:**
```bash
curl -X GET "http://localhost:4321/api/apartments/{apartment_id}/invitations" \
  -H "Authorization: Bearer {owner_jwt_token}"
```

**Oczekiwany wynik:**
- Status: 200 OK
- Response:
```json
{
  "invitations": []
}
```

### Test 9: Błąd - nie jesteś właścicielem (404)

**Endpoint:** GET /api/apartments/:id/invitations

**Warunki wstępne:**
- Użytkownik zalogowany jako inny owner

**Request:**
```bash
curl -X GET "http://localhost:4321/api/apartments/{other_apartment_id}/invitations" \
  -H "Authorization: Bearer {other_owner_jwt_token}"
```

**Oczekiwany wynik:**
- Status: 404 Not Found
- Response:
```json
{
  "error": "Not Found",
  "message": "Mieszkanie nie zostało znalezione"
}
```

---

## Testy endpointu: GET /api/invitations/:token (PUBLICZNY)

### Test 10: Walidacja pending token - sukces (200)

**Endpoint:** GET /api/invitations/:token

**Warunki wstępne:**
- Token istnieje i ma status "pending"
- **BRAK WYMAGANEJ AUTORYZACJI** (publiczny endpoint)

**Request:**
```bash
curl -X GET "http://localhost:4321/api/invitations/{valid_token}"
```

**Oczekiwany wynik:**
- Status: 200 OK
- Response:
```json
{
  "valid": true,
  "apartment": {
    "name": "Mieszkanie testowe",
    "address": "ul. Testowa 1, Warszawa"
  },
  "owner": {
    "full_name": "Jan Kowalski"
  }
}
```

**Weryfikacja:**
- Brak wymagania Authorization header
- Zwraca tylko podstawowe informacje (name, address, full_name)
- NIE zwraca email właściciela

### Test 11: Błąd - token wygasły (400)

**Endpoint:** GET /api/invitations/:token

**Warunki wstępne:**
- Token ma status "expired"

**Request:**
```bash
curl -X GET "http://localhost:4321/api/invitations/{expired_token}"
```

**Oczekiwany wynik:**
- Status: 400 Bad Request
- Response:
```json
{
  "error": "Invalid Token",
  "message": "Ten link zapraszający wygasł lub został już wykorzystany"
}
```

### Test 12: Błąd - token zaakceptowany (400)

**Endpoint:** GET /api/invitations/:token

**Warunki wstępne:**
- Token ma status "accepted"

**Request:**
```bash
curl -X GET "http://localhost:4321/api/invitations/{accepted_token}"
```

**Oczekiwany wynik:**
- Status: 400 Bad Request
- Response:
```json
{
  "error": "Invalid Token",
  "message": "Ten link zapraszający wygasł lub został już wykorzystany"
}
```

### Test 13: Błąd - token nie istnieje (400)

**Endpoint:** GET /api/invitations/:token

**Request:**
```bash
curl -X GET "http://localhost:4321/api/invitations/non-existent-token-12345"
```

**Oczekiwany wynik:**
- Status: 400 Bad Request
- Response:
```json
{
  "error": "Invalid Token",
  "message": "Ten link zapraszający wygasł lub został już wykorzystany"
}
```

**Security note:** Ten sam komunikat dla nieistniejącego i wygasłego tokenu (security by obfuscation)

---

## Testy endpointu: POST /api/invitations/:token/accept

### Test 14: Akceptacja zaproszenia - sukces (200)

**Endpoint:** POST /api/invitations/:token/accept

**Warunki wstępne:**
- Nowo zarejestrowany użytkownik (tenant@test.pl)
- Token pending
- User nie ma aktywnego lease
- Mieszkanie nie ma aktywnego lease

**Request:**
```bash
# 1. Najpierw zarejestruj nowego użytkownika przez Supabase Auth
# signup({ email: "tenant@test.pl", password: "Test1234!", data: { full_name: "Jan Kowalski", role: "tenant" }})

# 2. Zaakceptuj zaproszenie
curl -X POST "http://localhost:4321/api/invitations/{valid_token}/accept" \
  -H "Authorization: Bearer {tenant_jwt_token}" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik:**
- Status: 200 OK
- Response:
```json
{
  "lease": {
    "id": "uuid",
    "apartment_id": "uuid",
    "tenant_id": "uuid",
    "status": "active",
    "start_date": "2025-01-15",
    "created_at": "2025-01-15T10:00:00Z"
  }
}
```

**Weryfikacja:**
- Lease utworzony z status = "active"
- Lease.tenant_id = zalogowany user
- Lease.start_date = dzisiejsza data
- Invitation status zmieniony na "accepted"
- Invitation.accepted_by = tenant_id

**Sprawdzenie w bazie:**
```sql
-- Sprawdź lease
SELECT * FROM leases WHERE tenant_id = '{tenant_id}';

-- Sprawdź invitation
SELECT * FROM invitation_links WHERE token = '{token}';
```

### Test 15: Błąd - token wygasły (400)

**Endpoint:** POST /api/invitations/:token/accept

**Warunki wstępne:**
- Token ma status "expired"

**Request:**
```bash
curl -X POST "http://localhost:4321/api/invitations/{expired_token}/accept" \
  -H "Authorization: Bearer {tenant_jwt_token}" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik:**
- Status: 400 Bad Request
- Response:
```json
{
  "error": "Bad Request",
  "message": "Ten link zapraszający wygasł lub został już wykorzystany"
}
```

### Test 16: Błąd - user ma już aktywny lease (400)

**Endpoint:** POST /api/invitations/:token/accept

**Warunki wstępne:**
- User już ma aktywny lease w innym mieszkaniu

**Request:**
```bash
curl -X POST "http://localhost:4321/api/invitations/{valid_token}/accept" \
  -H "Authorization: Bearer {tenant_with_lease_jwt_token}" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik:**
- Status: 400 Bad Request
- Response:
```json
{
  "error": "Bad Request",
  "message": "Twoje konto jest już przypisane do aktywnego najmu"
}
```

### Test 17: Race condition - dwóch użytkowników używa tego samego tokenu

**Endpoint:** POST /api/invitations/:token/accept

**Warunki wstępne:**
- Dwóch nowych użytkowników próbuje zaakceptować to samo zaproszenie jednocześnie

**Scenariusz:**
```bash
# User 1
curl -X POST "http://localhost:4321/api/invitations/{token}/accept" \
  -H "Authorization: Bearer {user1_jwt}" \
  -H "Content-Type: application/json" &

# User 2 (równolegle)
curl -X POST "http://localhost:4321/api/invitations/{token}/accept" \
  -H "Authorization: Bearer {user2_jwt}" \
  -H "Content-Type: application/json" &
```

**Oczekiwany wynik:**
- Pierwszy request: 200 OK (lease utworzony)
- Drugi request: 400 Bad Request (token już accepted LUB apartment ma lease)

**Weryfikacja:**
- Tylko jeden lease został utworzony
- Token ma status "accepted"
- Unique constraint na `leases(apartment_id) WHERE status='active'` zadziałał

### Test 18: Błąd - brak autoryzacji (401)

**Endpoint:** POST /api/invitations/:token/accept

**Request:**
```bash
curl -X POST "http://localhost:4321/api/invitations/{valid_token}/accept" \
  -H "Content-Type: application/json"
```

**Oczekiwany wynik:**
- Status: 401 Unauthorized
- Response:
```json
{
  "error": "Unauthorized",
  "message": "Brak autoryzacji"
}
```

---

## End-to-End Test: Kompletny flow zaproszenia

### Scenariusz: Właściciel zaprasza lokatora

**Krok 1: Owner tworzy mieszkanie**
```bash
# POST /api/apartments
# Response: { id: "apartment-uuid", ... }
```

**Krok 2: Owner generuje zaproszenie**
```bash
curl -X POST "http://localhost:4321/api/apartments/{apartment-uuid}/invitations" \
  -H "Authorization: Bearer {owner_jwt}"

# Response:
# {
#   "invitation_url": "http://localhost:4321/register/tenant?token=abc123..."
# }
```

**Krok 3: Przyszły lokator otwiera link i waliduje token**
```bash
curl -X GET "http://localhost:4321/api/invitations/abc123..."

# Response (200 OK):
# {
#   "valid": true,
#   "apartment": { "name": "...", "address": "..." },
#   "owner": { "full_name": "..." }
# }
```

**Krok 4: Lokator rejestruje się**
```javascript
// Frontend: Supabase Auth signup
await supabase.auth.signUp({
  email: "tenant@test.pl",
  password: "Test1234!",
  options: {
    data: {
      full_name: "Jan Kowalski",
      role: "tenant"
    }
  }
})
```

**Krok 5: Lokator akceptuje zaproszenie**
```bash
curl -X POST "http://localhost:4321/api/invitations/abc123.../accept" \
  -H "Authorization: Bearer {tenant_jwt}"

# Response (200 OK):
# {
#   "lease": {
#     "id": "lease-uuid",
#     "status": "active",
#     ...
#   }
# }
```

**Krok 6: Weryfikacja - lokator widzi swoje mieszkanie**
```bash
curl -X GET "http://localhost:4321/api/apartments" \
  -H "Authorization: Bearer {tenant_jwt}"

# Response:
# {
#   "apartments": [
#     {
#       "id": "apartment-uuid",
#       "name": "...",
#       "address": "...",
#       "owner": { ... }
#     }
#   ]
# }
```

**Krok 7: Weryfikacja - owner widzi lokatora**
```bash
curl -X GET "http://localhost:4321/api/apartments/{apartment-uuid}" \
  -H "Authorization: Bearer {owner_jwt}"

# Response zawiera:
# {
#   "lease": {
#     "tenant": {
#       "id": "tenant-uuid",
#       "full_name": "Jan Kowalski",
#       "email": "tenant@test.pl"
#     }
#   }
# }
```

---

## Checklist weryfikacji

### Bezpieczeństwo
- [ ] GET /api/invitations/:token działa bez Authorization header (publiczny)
- [ ] POST /api/invitations/:token/accept wymaga Authorization header
- [ ] RLS policies dla anon role działają poprawnie
- [ ] Token validation nie ujawnia czy token istnieje czy wygasł (ten sam komunikat)
- [ ] Nie ujawnia email właściciela w publicznym endpoincie

### Business logic
- [ ] Automatyczne wygaszanie poprzednich zaproszeń działa
- [ ] Nie można utworzyć zaproszenia dla mieszkania z aktywnym lokatorem
- [ ] Nie można zaakceptować wygasłego/accepted tokenu
- [ ] Unique constraint na aktywny lease per apartment działa
- [ ] Unique constraint na aktywny lease per tenant działa
- [ ] start_date ustawia się na dzisiejszą datę

### Data integrity
- [ ] Invitation status zmienia się na "accepted" po akceptacji
- [ ] Invitation.accepted_by jest ustawione na tenant_id
- [ ] Lease jest utworzony z poprawnymi danymi
- [ ] Race condition jest obsłużony (tylko jeden lease)

### Performance
- [ ] Zapytania z JOINami działają szybko (< 100ms)
- [ ] Lista zaproszeń sortuje się po created_at DESC

---

## Notatki o testowaniu manualnym

### Narzędzia
- **cURL** - do prostych requestów
- **Postman/Insomnia** - do bardziej złożonych scenariuszy
- **Supabase Studio** - do weryfikacji danych w bazie
- **Browser DevTools** - do debugowania frontend integration

### Tipsy
1. Zapisuj JWT tokeny w zmiennych środowiskowych:
   ```bash
   export OWNER_TOKEN="eyJhbGc..."
   export TENANT_TOKEN="eyJhbGc..."
   ```

2. Używaj `jq` do formatowania JSON:
   ```bash
   curl ... | jq '.'
   ```

3. Sprawdzaj logi Astro podczas testów:
   ```bash
   npm run dev
   # Obserwuj console.error w terminie
   ```

4. Resetuj dane testowe między testami:
   ```sql
   DELETE FROM invitation_links WHERE apartment_id = '{test_apartment_id}';
   DELETE FROM leases WHERE apartment_id = '{test_apartment_id}';
   ```

---

## Raportowanie błędów

Jeśli test nie przechodzi, zbierz:
1. Request (metoda, URL, headers, body)
2. Response (status, body)
3. Logi z serwera (console.error)
4. Stan bazy danych przed i po requestcie
5. Wersja środowiska (Node, Astro, Supabase)

