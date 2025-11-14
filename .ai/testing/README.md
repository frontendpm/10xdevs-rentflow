# Testy dla endpointów zaproszeń

## Przegląd

Katalog zawiera:
1. **invitation-endpoints-test-plan.md** - szczegółowy plan testów manualnych (18 scenariuszy)
2. **invitation-smoke-test.sh** - automatyczny smoke test (5 podstawowych testów)

## Szybki start: Smoke test

### Przygotowanie

1. Uruchom aplikację lokalnie:
```bash
npm run dev
```

2. Zaloguj się jako właściciel i skopiuj JWT token z DevTools:
   - Otwórz `/login` w przeglądarce
   - Zaloguj się
   - Otwórz DevTools → Application → Local Storage → `sb-<project>-auth-token`
   - Skopiuj `access_token`

3. Utwórz mieszkanie i skopiuj jego ID:
   - Otwórz `/dashboard`
   - Dodaj nowe mieszkanie
   - Skopiuj UUID z URL lub z API response

4. Ustaw zmienne środowiskowe:
```bash
export OWNER_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
export APARTMENT_ID="e4a2c4b0-1234-5678-9abc-def012345678"
export BASE_URL="http://localhost:4321"  # opcjonalne
```

### Uruchomienie

```bash
cd .ai/testing
./invitation-smoke-test.sh
```

### Oczekiwany output

```
╔════════════════════════════════════════════╗
║   Invitation Endpoints Smoke Test         ║
╚════════════════════════════════════════════╝

BASE_URL: http://localhost:4321
APARTMENT_ID: e4a2c4b0-1234-5678-9abc-def012345678
OWNER_TOKEN: eyJhbGciOiJIUzI1NiI...

========================================
TEST 1: POST /api/apartments/:id/invitations
========================================

✓ Status: 201 Created
Token: abc123-def456-...
URL: http://localhost:4321/register/tenant?token=abc123...

========================================
TEST 2: GET /api/apartments/:id/invitations
========================================

✓ Status: 200 OK
Liczba zaproszeń: 1

========================================
TEST 3: GET /api/invitations/:token (publiczny)
========================================

✓ Status: 200 OK
✓ Endpoint publiczny działa (bez Authorization header)
Valid: true
Apartment: Mieszkanie testowe
Owner: Jan Kowalski

========================================
TEST 4: GET /api/invitations/:token (nieistniejący token)
========================================

✓ Status: 400 Bad Request (oczekiwany)
Message: Ten link zapraszający wygasł lub został już wykorzystany

========================================
TEST 5: POST /api/apartments/:id/invitations (bez autoryzacji)
========================================

✓ Status: 401 Unauthorized (oczekiwany)
Message: Brak autoryzacji

========================================
PODSUMOWANIE
========================================

Testy zaliczone: 5
Testy niezaliczone: 0

✓ Wszystkie testy przeszły pomyślnie!
```

## Testy manualne

Dla pełnej weryfikacji funkcjonalności, uruchom testy manualne opisane w `invitation-endpoints-test-plan.md`.

### Scenariusze testowe

1. **POST /api/apartments/:id/invitations** (6 testów)
   - Utworzenie zaproszenia
   - Automatyczne wygaszanie poprzednich zaproszeń
   - Błędy: aktywny lokator, brak autoryzacji, nieprawidłowy UUID

2. **GET /api/apartments/:id/invitations** (3 testy)
   - Lista zaproszeń (wszystkie statusy)
   - Pusta lista
   - Błąd: brak uprawnień

3. **GET /api/invitations/:token** (4 testy) - **PUBLICZNY**
   - Walidacja pending token
   - Błędy: wygasły, zaakceptowany, nieistniejący token

4. **POST /api/invitations/:token/accept** (5 testów)
   - Akceptacja zaproszenia
   - Race condition (dwóch użytkowników)
   - Błędy: wygasły token, user ma lease, brak autoryzacji

5. **End-to-End flow** (1 test)
   - Kompletny przepływ od utworzenia mieszkania do akceptacji przez lokatora

### Narzędzia

- **cURL** - do prostych requestów
- **Postman/Insomnia** - do bardziej złożonych scenariuszy
- **Supabase Studio** - weryfikacja danych w bazie

### Przydatne komendy

```bash
# Formatowanie JSON output
curl ... | jq '.'

# Zapisywanie tokenów
export OWNER_TOKEN="..."
export TENANT_TOKEN="..."

# Resetowanie danych testowych
psql $DATABASE_URL -c "DELETE FROM invitation_links WHERE apartment_id = '...'"
```

## Weryfikacja polityk RLS

### Test polityk dla `anon` role

```bash
# Powinno działać (publiczny dostęp)
curl -X GET "http://localhost:4321/api/invitations/{token}"

# Powinno zwrócić 401
curl -X POST "http://localhost:4321/api/apartments/{id}/invitations"
```

### Test polityk dla `authenticated` role

```bash
# Owner może tworzyć zaproszenia
curl -X POST "http://localhost:4321/api/apartments/{id}/invitations" \
  -H "Authorization: Bearer {owner_token}"

# Tenant może zaakceptować zaproszenie
curl -X POST "http://localhost:4321/api/invitations/{token}/accept" \
  -H "Authorization: Bearer {tenant_token}"
```

## Checklist przed wdrożeniem

### Funkcjonalność
- [ ] POST /api/apartments/:id/invitations generuje poprawny token i URL
- [ ] GET /api/apartments/:id/invitations zwraca listę z accepted_by
- [ ] GET /api/invitations/:token działa bez autoryzacji
- [ ] POST /api/invitations/:token/accept tworzy lease i aktualizuje invitation

### Bezpieczeństwo
- [ ] Publiczny endpoint nie wymaga JWT
- [ ] Authenticated endpoints wymagają JWT
- [ ] RLS policies dla anon działają poprawnie
- [ ] Token validation nie ujawnia czy token istnieje
- [ ] Nie ujawnia email właściciela w publicznym endpoincie

### Business Logic
- [ ] Automatyczne wygaszanie poprzednich zaproszeń
- [ ] Unique constraints na aktywny lease (apartment + tenant)
- [ ] Race condition jest obsłużony
- [ ] start_date ustawia się na dzisiejszą datę

### Migracje
- [ ] Wszystkie migracje zastosowane
- [ ] Polityki RLS dla anon role utworzone
- [ ] Polityka INSERT dla tenants na leases utworzona

## Raportowanie problemów

Jeśli któryś test nie przechodzi:

1. Sprawdź logi aplikacji (npm run dev)
2. Sprawdź dane w Supabase Studio
3. Uruchom SQL query do weryfikacji:
```sql
-- Sprawdź invitation
SELECT * FROM invitation_links WHERE token = '...';

-- Sprawdź lease
SELECT * FROM leases WHERE apartment_id = '...';

-- Sprawdź RLS policies
SELECT * FROM pg_policies WHERE schemaname = 'public';
```

4. Zgłoś problem z:
   - Request (metoda, URL, headers)
   - Response (status, body)
   - Logi z serwera
   - Stan bazy danych

