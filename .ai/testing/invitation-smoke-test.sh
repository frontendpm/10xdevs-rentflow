#!/bin/bash

# =============================================================================
# Invitation Endpoints Smoke Test
# =============================================================================
# Prosty skrypt do szybkiej weryfikacji czy endpointy zaproszeń działają.
# Wymaga: curl, jq
#
# Użycie:
#   chmod +x invitation-smoke-test.sh
#   ./invitation-smoke-test.sh
#
# Uwagi:
# - Ustaw zmienne środowiskowe przed uruchomieniem
# - Skrypt NIE czyści danych testowych po zakończeniu
# =============================================================================

set -e

# Kolory dla outputu
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Konfiguracja
BASE_URL="${BASE_URL:-http://localhost:4321}"
OWNER_TOKEN="${OWNER_TOKEN:-}"
APARTMENT_ID="${APARTMENT_ID:-}"

# Funkcje pomocnicze
print_header() {
    echo -e "\n${YELLOW}========================================${NC}"
    echo -e "${YELLOW}$1${NC}"
    echo -e "${YELLOW}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

check_dependencies() {
    if ! command -v curl &> /dev/null; then
        print_error "curl nie jest zainstalowane"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        print_error "jq nie jest zainstalowane"
        echo "Zainstaluj: brew install jq (macOS) lub apt-get install jq (Linux)"
        exit 1
    fi
}

check_env() {
    if [ -z "$OWNER_TOKEN" ]; then
        print_error "Brak OWNER_TOKEN. Ustaw: export OWNER_TOKEN='your_jwt_token'"
        exit 1
    fi

    if [ -z "$APARTMENT_ID" ]; then
        print_error "Brak APARTMENT_ID. Ustaw: export APARTMENT_ID='your_apartment_uuid'"
        exit 1
    fi
}

# =============================================================================
# TESTY
# =============================================================================

test_create_invitation() {
    print_header "TEST 1: POST /api/apartments/:id/invitations"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        "${BASE_URL}/api/apartments/${APARTMENT_ID}/invitations" \
        -H "Authorization: Bearer ${OWNER_TOKEN}" \
        -H "Content-Type: application/json")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" -eq 201 ]; then
        print_success "Status: 201 Created"
        
        # Parsuj token z odpowiedzi
        INVITATION_TOKEN=$(echo "$BODY" | jq -r '.token')
        INVITATION_URL=$(echo "$BODY" | jq -r '.invitation_url')
        
        echo "Token: $INVITATION_TOKEN"
        echo "URL: $INVITATION_URL"
        
        # Zapisz token do zmiennej globalnej
        export INVITATION_TOKEN
        
        return 0
    elif [ "$HTTP_CODE" -eq 400 ]; then
        print_error "Status: 400 - Mieszkanie ma już aktywnego lokatora"
        echo "$BODY" | jq '.'
        return 1
    else
        print_error "Status: $HTTP_CODE (oczekiwano 201)"
        echo "$BODY" | jq '.'
        return 1
    fi
}

test_get_invitations() {
    print_header "TEST 2: GET /api/apartments/:id/invitations"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
        "${BASE_URL}/api/apartments/${APARTMENT_ID}/invitations" \
        -H "Authorization: Bearer ${OWNER_TOKEN}")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "Status: 200 OK"
        
        INVITATIONS_COUNT=$(echo "$BODY" | jq '.invitations | length')
        echo "Liczba zaproszeń: $INVITATIONS_COUNT"
        
        echo "$BODY" | jq '.invitations[] | {status, token: .token[0:16], created_at}'
        
        return 0
    else
        print_error "Status: $HTTP_CODE (oczekiwano 200)"
        echo "$BODY" | jq '.'
        return 1
    fi
}

test_validate_invitation() {
    print_header "TEST 3: GET /api/invitations/:token (publiczny)"
    
    if [ -z "$INVITATION_TOKEN" ]; then
        print_error "Brak INVITATION_TOKEN. Uruchom najpierw test_create_invitation"
        return 1
    fi
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
        "${BASE_URL}/api/invitations/${INVITATION_TOKEN}")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" -eq 200 ]; then
        print_success "Status: 200 OK"
        print_success "Endpoint publiczny działa (bez Authorization header)"
        
        VALID=$(echo "$BODY" | jq -r '.valid')
        APARTMENT_NAME=$(echo "$BODY" | jq -r '.apartment.name')
        OWNER_NAME=$(echo "$BODY" | jq -r '.owner.full_name')
        
        echo "Valid: $VALID"
        echo "Apartment: $APARTMENT_NAME"
        echo "Owner: $OWNER_NAME"
        
        return 0
    else
        print_error "Status: $HTTP_CODE (oczekiwano 200)"
        echo "$BODY" | jq '.'
        return 1
    fi
}

test_validate_invalid_token() {
    print_header "TEST 4: GET /api/invitations/:token (nieistniejący token)"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
        "${BASE_URL}/api/invitations/invalid-token-12345")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" -eq 400 ]; then
        print_success "Status: 400 Bad Request (oczekiwany)"
        
        MESSAGE=$(echo "$BODY" | jq -r '.message')
        echo "Message: $MESSAGE"
        
        return 0
    else
        print_error "Status: $HTTP_CODE (oczekiwano 400)"
        echo "$BODY" | jq '.'
        return 1
    fi
}

test_unauthorized_access() {
    print_header "TEST 5: POST /api/apartments/:id/invitations (bez autoryzacji)"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        "${BASE_URL}/api/apartments/${APARTMENT_ID}/invitations" \
        -H "Content-Type: application/json")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" -eq 401 ]; then
        print_success "Status: 401 Unauthorized (oczekiwany)"
        
        MESSAGE=$(echo "$BODY" | jq -r '.message')
        echo "Message: $MESSAGE"
        
        return 0
    else
        print_error "Status: $HTTP_CODE (oczekiwano 401)"
        echo "$BODY" | jq '.'
        return 1
    fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo -e "${YELLOW}"
    echo "╔════════════════════════════════════════════╗"
    echo "║   Invitation Endpoints Smoke Test         ║"
    echo "╚════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    echo "BASE_URL: $BASE_URL"
    echo "APARTMENT_ID: $APARTMENT_ID"
    echo "OWNER_TOKEN: ${OWNER_TOKEN:0:20}..."
    
    check_dependencies
    check_env
    
    # Uruchom testy
    PASSED=0
    FAILED=0
    
    if test_create_invitation; then
        ((PASSED++))
    else
        ((FAILED++))
    fi
    
    if test_get_invitations; then
        ((PASSED++))
    else
        ((FAILED++))
    fi
    
    if test_validate_invitation; then
        ((PASSED++))
    else
        ((FAILED++))
    fi
    
    if test_validate_invalid_token; then
        ((PASSED++))
    else
        ((FAILED++))
    fi
    
    if test_unauthorized_access; then
        ((PASSED++))
    else
        ((FAILED++))
    fi
    
    # Podsumowanie
    print_header "PODSUMOWANIE"
    echo -e "${GREEN}Testy zaliczone: $PASSED${NC}"
    echo -e "${RED}Testy niezaliczone: $FAILED${NC}"
    
    if [ $FAILED -eq 0 ]; then
        echo -e "\n${GREEN}✓ Wszystkie testy przeszły pomyślnie!${NC}"
        exit 0
    else
        echo -e "\n${RED}✗ Niektóre testy nie przeszły${NC}"
        exit 1
    fi
}

# Uruchom main
main

