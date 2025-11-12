# Dokument wymagań produktu (PRD) - Rentflow
## 1. Przegląd produktu

Rentflow to aplikacja internetowa (RWD) w wersji MVP (Minimum Viable Product), zaprojektowana w celu radykalnego uproszczenia relacji między właścicielami mieszkań na wynajem a ich lokatorami.

Głównym celem aplikacji jest dostarczenie scentralizowanego, prostego w obsłudze narzędzia do komunikacji, zarządzania opłatami i przechowywania kluczowej dokumentacji (protokoły zdawczo-odbiorcze). Aplikacja ma być maksymalnie prosta ("Maksymalnie dużo za maksymalnie prostą obsługę"), eliminując zbędne funkcje na rzecz szybkiego wdrożenia i rozwiązania podstawowych problemów.

Aplikacja skierowana jest do dwóch ról:
* Właściciel: Posiada pełne uprawnienia do zarządzania mieszkaniem, lokatorami, opłatami i protokołami.
* Lokator: Posiada uprawnienia tylko do odczytu danych udostępnionych przez właściciela.

Aplikacja zostanie zbudowana w oparciu o następujący stack technologiczny:
* Frontend: Astro z React 19 dla komponentów interaktywnych, TypeScript 5, Tailwind CSS 4, Shadcn/ui
* Backend: Supabase (PostgreSQL, autentykacja, storage)
* Hosting: DigitalOcean (Docker)
* CI/CD: GitHub Actions

## 2. Problem użytkownika

Problem Właściciela:
Właściciele mieszkań na wynajem borykają się z nieefektywnym i rozproszonym zarządzaniem najmem. Komunikacja z lokatorami odbywa się wieloma kanałami (SMS, e-mail, telefon), rozliczenia są często prowadzone w arkuszach kalkulacyjnych, a historia płatności i dokumenty (umowy, protokoły) są trudne do śledzenia. Generuje to ryzyko pomyłek, nieporozumień i pochłania cenny czas.

Problem Lokatora:
Lokatorzy często nie mają jasnego i transparentnego wglądu w swoje zobowiązania finansowe. Pytania o status płatności, dostęp do rachunków za media czy wgląd w ustalenia z protokołu odbioru wymagają każdorazowo kontaktu z właścicielem, co bywa kłopotliwe.

Rozwiązanie (Rentflow MVP):
Rentflow adresuje te problemy, oferując:
1.  Jedno miejsce do śledzenia wszystkich opłat (czynsz, media, inne).
2.  Transparentny system statusów płatności (zarządzany przez właściciela, widoczny dla lokatora).
3.  Centralne repozytorium na rachunki (załączniki) i protokoły (tekst + zdjęcia).
4.  Prosty system zapraszania i zarządzania lokatorami.

## 3. Wymagania funkcjonalne

### 3.1. Role i Uprawnienia
* Właściciel: Pełen dostęp (CRUD) do zarządzania mieszkaniami, lokatorami, opłatami, wpłatami i protokołami.
* Lokator: Dostęp tylko do odczytu (Read-Only) do danych mieszkania, do którego został zaproszony (opłaty, protokoły).

### 3.2. Uwierzytelnianie
* Rejestracja i logowanie wyłącznie za pomocą adresu e-mail i hasła.
* Wymagana akceptacja Regulaminu i Polityki Prywatności (linki do statycznych stron HTML).
* Dostępna funkcja "Resetuj hasło" (wysyłana e-mailem).

### 3.3. Onboarding Właściciela
* Po pierwszej rejestracji, właściciel jest przekierowywany do obowiązkowego, 2-etapowego kreatora:
    1.  Dodaj Mieszkanie (Nazwa, Adres).
    2.  Zaproś Lokatora (Wygenerowanie jednorazowego linku zapraszającego).

### 3.4. Zarządzanie Mieszkaniami (Właściciel)
* Dashboard właściciela to lista mieszkań (w formie "kart").
* Właściciel może dodawać, edytować (nazwa, adres) i usuwać mieszkania.
* Usunięcie mieszkania jest możliwe tylko wtedy, gdy nie jest do niego przypisany żaden aktywny lokator (ani zarchiwizowany).

### 3.5. Zarządzanie Najmem (Właściciel)
* Zaproszenie: Właściciel generuje unikalny link zapraszający dla danego mieszkania. Link jest jednorazowy (wygasa po użyciu).
* Ograniczenie: Jedno mieszkanie może mieć tylko jednego aktywnego lokatora w danym czasie.
* Zakończenie Najmu: Właściciel używa opcji "Usuń lokatora". Wymagane jest potwierdzenie. Dane najmu (opłaty, protokoły) są archiwizowane (widoczne dla właściciela w "Historii najemców"), a lokator traci dostęp do aplikacji.

### 3.6. Zarządzanie Opłatami (Właściciel)
* Właściciel dodaje "Opłaty".
* Pola Opłaty: Kwota (PLN, >0), Data wymagalności, Typ (lista stała: "Czynsz", "Rachunek", "Inne"), Komentarz (max 300 znaków), Załącznik (opcjonalnie, 1 plik: PDF/JPG/PNG, max 5MB).
* Lista opłat jest grupowana miesiącami (wg daty wymagalności) i sortowana malejąco.

### 3.7. Zarządzanie Wpłatami (Właściciel)
* Właściciel ręcznie dodaje "Wpłaty" (kwotowe) do istniejących opłat.
* System automatycznie oblicza status opłaty na podstawie sumy wpłat:
    * "Do opłacenia" (suma wpłat = 0)
    * "Częściowo opłacone" (0 < suma wpłat < kwota opłaty)
    * "Opłacone" (suma wpłat = kwota opłaty)
* System oznacza opłaty jako "Po terminie", jeśli data wymagalności minęła, a status nie jest "Opłacone".
* Ograniczenia:
    * Nie można edytować opłaty ze statusem "Opłacone".
    * Nie można edytować kwoty opłaty na wartość niższą niż suma zarejestrowanych wpłat.

### 3.8. Protokoły (Właściciel i Lokator)
* Dostępne jako dwie stałe zakładki w panelu mieszkania: "Protokół Odbioru" i "Protokół Zwrotu".
* Każdy protokół składa się z:
    1.  Jednego pola tekstowego (textarea) na opis i ustalenia.
    2.  Możliwości dodania do 10 zdjęć (każde max 5MB, PDF/JPG/PNG).
* Właściciel ma pełen dostęp do edycji.
* Lokator ma dostęp tylko do odczytu.

### 3.9. Kwestie Techniczne i Inne
* Platforma: Aplikacja webowa RWD.
* Język: Wyłącznie język polski (PL).
* Przechowywanie Plików: Załączniki i zdjęcia będą przechowywane w Supabase Storage z odpowiednimi politykami bezpieczeństwa (Row Level Security).
* Wyświetlanie Plików: Pliki (załączniki, zdjęcia) są wyświetlane jako lista linków otwieranych w nowej karcie przeglądarki.
* Pomoc i Kwestie Prawne: Teksty prawne (Regulamin, Polityka Prywatności) są dostępne jako statyczne strony Astro. Pomoc techniczna (w tym ręczne usuwanie kont) odbywa się przez e-mail `pomoc@rentflow.pl` podany w stopce.

## 4. Granice produktu

Następujące funkcje i elementy są świadomie wykluczone z zakresu MVP:

* Płatności: Brak jakichkolwiek kont premium lub płatnych funkcji. Aplikacja jest w 100% darmowa.
* Integracje Płatnicze: Brak integracji z bankami czy bramkami płatności. Śledzenie wpłat jest w pełni manualne (wprowadzane przez właściciela).
* Analityka i Raporty: Brak zaawansowanej analizy rachunków, wykresów, podsumowań finansowych czy eksportów (np. do CSV/PDF).
* Zarządzanie Nieruchomościami: Brak zaawansowanych funkcji (np. obsługa wielu lokali w ramach jednej nieruchomości, zarządzanie remontami, zgłaszanie usterek).
* Uwierzytelnianie: Brak logowania przez telefon, logowania społecznościowego (Google, Facebook) czy "magic link".
* Języki: Brak wsparcia dla języka angielskiego (EN) lub innych języków.
* Powiadomienia: Brak automatycznych powiadomień (e-mail, push, SMS) o np. zbliżającym się terminie płatności, zaległościach czy dodaniu nowego rachunku.
* Wielu Lokatorów: Brak wsparcia dla więcej niż jednego lokatora przypisanego do mieszkania.
* Analityka Aplikacji: Brak implementacji narzędzi analitycznych (np. Google Analytics, Hotjar).

## 5. Historyjki użytkowników

### 5.1. Uwierzytelnianie i Dostęp (Wspólne)

---
ID: US-001
Tytuł: Rejestracja Właściciela
Opis: Jako nowy Właściciel, chcę móc założyć konto w aplikacji używając mojego adresu e-mail i hasła, abym mógł zacząć zarządzać swoimi mieszkaniami.
Kryteria akceptacji:
1.  Formularz rejestracji zawiera pola: Imię, E-mail, Hasło, Powtórz hasło.
2.  Formularz zawiera checkbox "Akceptuję Regulamin i Politykę Prywatności".
3.  Link do Regulaminu i Polityki Prywatności otwiera statyczną stronę HTML w nowej karcie.
4.  Checkbox musi być zaznaczony, aby umożliwić rejestrację.
5.  Hasło musi mieć co najmniej 8 znaków.
6.  Pola Hasło i Powtórz hasło muszą być identyczne.
7.  Adres e-mail musi być unikalny w systemie.
8.  Po pomyślnej rejestracji, użytkownik jest automatycznie logowany i przekierowywany do kreatora onboardingu (US-010).

---
ID: US-002
Tytuł: Rejestracja Lokatora
Opis: Jako Lokator, który otrzymał link zapraszający, chcę móc założyć konto (Imię, E-mail, Hasło), aby uzyskać dostęp do panelu mojego mieszkania.
Kryteria akceptacji:
1.  Dostęp do formularza rejestracji lokatora jest możliwy tylko przez ważny, jednorazowy link zapraszający.
2.  Formularz wyświetla informację, do jakiego mieszkania (nazwa, adres) użytkownik jest zapraszany.
3.  Formularz zawiera pola: Imię, E-mail, Hasło, Powtórz hasło oraz checkbox akceptacji regulaminu.
4.  Wymagania walidacyjne (hasło, e-mail, zgody) są takie same jak dla Właściciela (US-001).
5.  Po pomyślnej rejestracji, link zapraszający zostaje oznaczony jako "użyty" i staje się nieważny.
6.  Użytkownik jest automatycznie logowany i przekierowywany do panelu lokatora (US-044).

---
ID: US-003
Tytuł: Logowanie Użytkownika
Opis: Jako zarejestrowany użytkownik (Właściciel lub Lokator), chcę móc zalogować się do aplikacji przy użyciu mojego e-maila i hasła.
Kryteria akceptacji:
1.  Formularz logowania zawiera pola: E-mail, Hasło.
2.  Formularz zawiera link "Nie pamiętasz hasła?".
3.  Po podaniu błędnego e-maila lub hasła, wyświetlany jest ogólny komunikat błędu (np. "Nieprawidłowy e-mail lub hasło").
4.  Po pomyślnym zalogowaniu, Właściciel jest kierowany do listy mieszkań, a Lokator do swojego dashboardu.

---
ID: US-004
Tytuł: Wylogowanie Użytkownika
Opis: Jako zalogowany użytkownik, chcę móc się bezpiecznie wylogować z aplikacji.
Kryteria akceptacji:
1.  W interfejsie użytkownika (np. w menu profilowym) dostępna jest opcja "Wyloguj".
2.  Kliknięcie "Wyloguj" kończy sesję użytkownika i przekierowuje go na stronę logowania.

---
ID: US-005
Tytuł: Inicjacja Resetowania Hasła
Opis: Jako użytkownik, który zapomniał hasła, chcę móc poprosić o link do jego zresetowania na mój adres e-mail.
Kryteria akceptacji:
1.  Na stronie logowania znajduje się link "Nie pamiętasz hasła?".
2.  Link prowadzi do formularza z jednym polem: E-mail.
3.  Po wpisaniu istniejącego w bazie adresu e-mail i kliknięciu "Resetuj", system wysyła e-mail z unikalnym linkiem do resetu hasła.
4.  Jeśli e-mail nie istnieje w bazie, wyświetlany jest ogólny komunikat (np. "Jeśli konto istnieje, link został wysłany"), aby nie ujawniać istnienia kont.

---
ID: US-006
Tytuł: Ustawienie Nowego Hasła
Opis: Jako użytkownik, który otrzymał link do resetu hasła, chcę móc ustawić nowe hasło.
Kryteria akceptacji:
1.  Link e-mail prowadzi do formularza z polami: Nowe hasło, Powtórz nowe hasło.
2.  Link jest jednorazowy i/lub ma krótki czas ważności (np. 1 godzinę).
3.  Walidacja nowego hasła jest taka sama jak przy rejestracji (min. 8 znaków, oba pola identyczne).
4.  Po pomyślnym ustawieniu hasła, użytkownik jest przekierowywany do strony logowania z komunikatem sukcesu.

---
ID: US-007
Tytuł: Walidacja Formularzy
Opis: Jako użytkownik wypełniający dowolny formularz (rejestracja, logowanie, dodanie opłaty), chcę otrzymywać jasne komunikaty o błędach walidacji.
Kryteria akceptacji:
1.  Walidacja odbywa się po stronie klienta (inline) oraz po stronie serwera.
2.  Błędne pola są wyróżnione (np. czerwoną ramką).
3.  Pod błędnym polem wyświetlany jest komunikat wyjaśniający błąd (np. "To pole jest wymagane", "Nieprawidłowy format e-mail").
4.  Przycisk "Zapisz"/"Wyślij" jest nieaktywny, dopóki formularz nie przejdzie walidacji po stronie klienta.

---
ID: US-008
Tytuł: Dostęp do Stron Prawnych
Opis: Jako użytkownik lub gość, chcę mieć łatwy dostęp do Regulaminu i Polityki Prywatności.
Kryteria akceptacji:
1.  W stopce aplikacji (widocznej na stronach logowania/rejestracji i w panelu) znajdują się linki "Regulamin" i "Polityka Prywatności".
2.  Linki prowadzą do statycznych stron HTML z treścią dostarczoną przez biznes.

---
ID: US-009
Tytuł: Dostęp do Pomocy
Opis: Jako użytkownik, chcę wiedzieć, gdzie mogę szukać pomocy w razie problemów z aplikacją.
Kryteria akceptacji:
1.  W stopce aplikacji znajduje się adres e-mail: `pomoc@rentflow.pl`.
2.  Kliknięcie adresu e-mail otwiera domyślnego klienta pocztowego użytkownika (link `mailto:`).

### 5.2. Onboarding Właściciela

---
ID: US-010
Tytuł: Wymuszony Kreator Onboardingu
Opis: Jako nowy Właściciel, który właśnie się zarejestrował, chcę być od razu przeprowadzony przez proces dodania pierwszego mieszkania i lokatora, aby szybko rozpocząć korzystanie z aplikacji.
Kryteria akceptacji:
1.  Po pierwszej rejestracji (i automatycznym zalogowaniu), Właściciel jest przekierowywany do 2-etapowego kreatora.
2.  Użytkownik nie może opuścić kreatora, dopóki go nie ukończy (brak linków do dashboardu).
3.  Kreator składa się z dwóch kroków: 1. Dodaj Mieszkanie, 2. Zaproś Lokatora.

---
ID: US-011
Tytuł: Kreator - Krok 1: Dodaj Mieszkanie
Opis: Jako nowy Właściciel w kreatorze, chcę dodać swoje pierwsze mieszkanie.
Kryteria akceptacji:
1.  Formularz zawiera pola: Nazwa mieszkania (np. "Kawalerka na Woli"), Adres (np. "ul. Złota 44, Warszawa").
2.  Oba pola są wymagane.
3.  Po kliknięciu "Dalej", mieszkanie jest zapisywane w bazie, a użytkownik przechodzi do kroku 2.

---
ID: US-012
Tytuł: Kreator - Krok 2: Zaproś Lokatora
Opis: Jako nowy Właściciel w kreatorze, chcę wygenerować link zapraszający dla właśnie dodanego mieszkania.
Kryteria akceptacji:
1.  Ekran wyświetla nazwę i adres mieszkania dodanego w kroku 1.
2.  Dostępny jest przycisk "Wygeneruj link zapraszający".
3.  Po kliknięciu, system generuje unikalny, jednorazowy link i wyświetla go w polu tekstowym.
4.  Obok pola dostępny jest przycisk "Kopiuj", który kopiuje link do schowka.
5.  Wyświetlony jest komunikat instruktażowy (np. "Skopiuj link i wyślij go swojemu lokatorowi e-mailem lub SMS-em").
6.  Po kliknięciu "Zakończ", użytkownik jest przekierowywany do głównego panelu (listy mieszkań).

### 5.3. Zarządzanie Mieszkaniami (Właściciel)

---
ID: US-013
Tytuł: Widok Listy Mieszkań (Dashboard Właściciela)
Opis: Jako Właściciel, po zalogowaniu chcę widzieć listę wszystkich moich mieszkań, aby mieć szybki przegląd sytuacji.
Kryteria akceptacji:
1.  Główny widok po zalogowaniu (dla Właściciela, który ukończył onboarding) to lista mieszkań.
2.  Mieszkania są wyświetlane jako "karty" (komponenty Shadcn/ui).
3.  Każda karta wyświetla: Nazwę mieszkania, Adres, Status lokatora (np. "Oczekuje na lokatora" lub "Lokator: Jan Kowalski"), Podsumowanie salda (np. "Saldo: -2000 zł").
4.  Każda karta jest klikalna i prowadzi do widoku szczegółów danego mieszkania.

---
ID: US-014
Tytuł: Pusty Stan Listy Mieszkań
Opis: Jako Właściciel, który nie ma jeszcze żadnych mieszkań (np. usunął ostatnie), chcę widzieć zachętę do działania.
Kryteria akceptacji:
1.  Jeśli lista mieszkań jest pusta, wyświetlany jest komunikat (np. "Nie dodałeś jeszcze żadnych mieszkań").
2.  Wyświetlany jest wyraźny przycisk (Call to Action) "Dodaj swoje pierwsze mieszkanie".

---
ID: US-015
Tytuł: Dodanie Nowego Mieszkania (Poza Kreatorem)
Opis: Jako Właściciel, chcę móc dodać kolejne mieszkanie z poziomu mojego dashboardu.
Kryteria akceptacji:
1.  Na liście mieszkań dostępny jest przycisk "Dodaj mieszkanie".
2.  Przycisk otwiera formularz (taki sam jak w US-011: Nazwa, Adres).
3.  Po zapisaniu, nowe mieszkanie pojawia się na liście.

---
ID: US-016
Tytuł: Edycja Mieszkania
Opis: Jako Właściciel, chcę móc edytować dane mojego mieszkania (nazwę lub adres).
Kryteria akceptacji:
1.  W widoku szczegółów mieszkania lub na karcie mieszkania dostępna jest opcja "Edytuj".
2.  Opcja otwiera formularz z wypełnionymi aktualnymi danymi (Nazwa, Adres).
3.  Po zapisaniu zmian, zaktualizowane dane są widoczne w całej aplikacji.

---
ID: US-017
Tytuł: Usunięcie Mieszkania
Opis: Jako Właściciel, chcę móc usunąć mieszkanie, którego już nie wynajmuję.
Kryteria akceptacji:
1.  W widoku szczegółów mieszkania dostępna jest opcja "Usuń mieszkanie".
2.  Przed usunięciem wyświetlany jest modal potwierdzający (np. "Czy na pewno chcesz trwale usunąć [Nazwa]? Tej operacji nie można cofnąć.").
3.  Usunięcie jest możliwe tylko wtedy, gdy do mieszkania nie jest przypisany żaden aktywny ani zarchiwizowany lokator.
4.  Jeśli lokator jest przypisany, przycisk "Usuń" jest nieaktywny lub wyświetla błąd (np. "Aby usunąć mieszkanie, najpierw zakończ najem i usuń lokatora.").
5.  Pomyślne usunięcie usuwa mieszkanie i jego historię z bazy danych.

---
ID: US-018
Tytuł: Nawigacja do Szczegółów Mieszkania
Opis: Jako Właściciel, chcę móc przejść z listy mieszkań do widoku szczegółowego konkretnego mieszkania.
Kryteria akceptacji:
1.  Kliknięcie na kartę mieszkania na dashboardzie przekierowuje do panelu zarządzania tym mieszkaniem.
2.  Panel zarządzania mieszkaniem zawiera zakładki: Opłaty, Protokół Odbioru, Protokół Zwrotu, Ustawienia (lub Zarządzanie Lokatorami).

### 5.4. Zarządzanie Najmem i Lokatorem (Właściciel)

---
ID: US-019
Tytuł: Generowanie Linku Zapraszającego (Panel Mieszkania)
Opis: Jako Właściciel, chcę móc zaprosić lokatora do mieszkania, które nie ma jeszcze aktywnego lokatora.
Kryteria akceptacji:
1.  W panelu mieszkania, które nie ma lokatora, widoczny jest przycisk/sekcja "Zaproś lokatora".
2.  Funkcjonalność jest identyczna jak w kreatorze (US-012): generuje jednorazowy link i pozwala go skopiować.

---
ID: US-020
Tytuł: Widok Statusu Lokatora
Opis: Jako Właściciel, chcę widzieć, czy lokator przyjął moje zaproszenie.
Kryteria akceptacji:
1.  Jeśli link został wygenerowany, ale nieużyty, w panelu mieszkania widoczny jest status "Oczekuje na przyjęcie zaproszenia".
2.  Jeśli lokator się zarejestrował, widoczne jest jego imię i e-mail (np. "Lokator: Jan Kowalski, jan@kowalski.pl").

---
ID: US-021
Tytuł: Zakończenie Najmu (Usunięcie Lokatora)
Opis: Jako Właściciel, chcę móc zakończyć najem, aby zarchiwizować dane i zwolnić miejsce dla nowego lokatora.
Kryteria akceptacji:
1.  W panelu mieszkania z aktywnym lokatorem dostępny jest przycisk "Zakończ najem" lub "Usuń lokatora".
2.  Kliknięcie wymaga potwierdzenia modalem (np. "Zakończenie najmu spowoduje archiwizację danych i cofnięcie lokatorowi dostępu. Kontynuować?").
3.  Po potwierdzeniu:
    * Konto lokatora traci powiązanie z tym mieszkaniem (Lokator traci dostęp do danych).
    * Dane (opłaty, protokoły) są oznaczane jako archiwalne.
    * Mieszkanie wraca do statusu "Brak lokatora", umożliwiając wygenerowanie nowego zaproszenia.

---
ID: US-022
Tytuł: Widok Historii Najemców
Opis: Jako Właściciel, chcę mieć wgląd w historyczne dane najmów dla danego mieszkania.
Kryteria akceptacji:
1.  W panelu mieszkania dostępna jest sekcja lub link "Historia najemców".
2.  Widok ten prezentuje listę poprzednich najmów (np. "Jan Kowalski, 1.01.2024 - 15.11.2025").
3.  Kliknięcie na historyczny najem pozwala na wgląd (tylko do odczytu) w opłaty i protokoły z tamtego okresu.

### 5.5. Zarządzanie Opłatami i Wpłatami (Właściciel)

---
ID: US-023
Tytuł: Widok Listy Opłat (Właściciel)
Opis: Jako Właściciel, w panelu mieszkania chcę widzieć listę wszystkich opłat, aby monitorować finanse.
Kryteria akceptacji:
1.  Domyślna zakładka panelu mieszkania to "Opłaty".
2.  Opłaty są grupowane miesiącami (wg daty wymagalności, np. "Listopad 2025", "Październik 2025").
3.  Sortowanie grup miesięcznych jest malejące (najnowsze na górze).
4.  Każda pozycja na liście pokazuje: Nazwę (Typ), Datę wymagalności, Kwotę, Status ("Do opłacenia", "Częściowo opłacone", "Opłacone"), Status "Po terminie" (jeśli dotyczy).

---
ID: US-024
Tytuł: Pusty Stan Listy Opłat
Opis: Jako Właściciel, chcę widzieć zachętę do działania, jeśli nie dodałem jeszcze żadnych opłat dla lokatora.
Kryteria akceptacji:
1.  Jeśli lista opłat jest pusta, wyświetlany jest komunikat (np. "Brak dodanych opłat").
2.  Wyświetlany jest przycisk "Dodaj pierwszą opłatę".

---
ID: US-025
Tytuł: Dodanie Nowej Opłaty
Opis: Jako Właściciel, chcę móc dodać nową opłatę (np. czynsz lub rachunek za prąd) dla mojego lokatora.
Kryteria akceptacji:
1.  Przycisk "Dodaj opłatę" otwiera formularz.
2.  Formularz zawiera pola: Kwota (PLN), Data wymagalności (wybór z kalendarza), Typ (lista rozwijana: "Czynsz", "Rachunek", "Inne"), Komentarz (opcjonalny, pole tekstowe), Załącznik (opcjonalny, 1 plik).
3.  Po zapisaniu, nowa opłata pojawia się na liście ze statusem "Do opłacenia".

---
ID: US-026
Tytuł: Walidacja Formularza Opłaty
Opis: Jako Właściciel, dodając opłatę, chcę mieć pewność, że wprowadzam poprawne dane.
Kryteria akceptacji:
1.  Pole Kwota musi być liczbą większą od 0.
2.  Pole Data wymagalności i Typ są wymagane.
3.  Pole Komentarz ma limit 300 znaków.
4.  Pole Załącznik akceptuje tylko 1 plik typu PDF, JPG lub PNG.
5.  Rozmiar załącznika nie może przekroczyć 5MB.
6.  Próba wgrania pliku o złym formacie lub rozmiarze skutkuje błędem walidacji.

---
ID: US-027
Tytuł: Edycja Opłaty
Opis: Jako Właściciel, chcę móc edytować opłatę, jeśli pomyliłem się przy jej wprowadzaniu.
Kryteria akceptacji:
1.  Każda opłata na liście ma opcję "Edytuj".
2.  Edycja otwiera formularz (taki sam jak US-025) wypełniony danymi opłaty.
3.  Można zmienić wszystkie pola.
4.  Po zapisaniu, status opłaty jest przeliczany (jeśli zmieniono kwotę).

---
ID: US-028
Tytuł: Ograniczenie Edycji Opłaty Opłaconej
Opis: Jako Właściciel, nie chcę móc przypadkowo edytować opłaty, która ma już status "Opłacone".
Kryteria akceptacji:
1.  Dla opłat ze statusem "Opłacone" przycisk "Edytuj" jest nieaktywny lub ukryty.

---
ID: US-029
Tytuł: Ograniczenie Edycji Kwoty Opłaty
Opis: Jako Właściciel, edytując opłatę "Częściowo opłaconą", nie chcę móc ustawić jej kwoty poniżej sumy wpłat.
Kryteria akceptacji:
1.  Podczas edycji opłaty, która ma już zarejestrowane wpłaty (np. 500 zł), pole Kwota nie może przyjąć wartości mniejszej niż suma wpłat (500 zł).
2.  Próba zapisu mniejszej kwoty skutkuje błędem walidacji (np. "Kwota opłaty nie może być niższa niż suma dokonanych wpłat (500 zł)").

---
ID: US-030
Tytuł: Usunięcie Opłaty
Opis: Jako Właściciel, chcę móc usunąć błędnie dodaną opłatę.
Kryteria akceptacji:
1.  Każda opłata na liście ma opcję "Usuń".
2.  Usunięcie wymaga potwierdzenia modalem.
3.  Nie można usunąć opłaty, która ma status "Opłacone" (opcja usuń jest nieaktywna).
4.  Usunięcie opłaty "Częściowo opłaconej" lub "Do opłacenia" usuwa ją oraz wszystkie powiązane z nią wpłaty.

---
ID: US-031
Tytuł: Automatyczne Obliczanie Statusu Opłaty
Opis: Jako Właściciel, chcę aby system automatycznie obliczał status opłaty na podstawie moich wpłat.
Kryteria akceptacji:
1.  Opłata 1000 zł, Wpłaty 0 zł -> Status: "Do opłacenia".
2.  Opłata 1000 zł, Wpłaty 500 zł -> Status: "Częściowo opłacone".
3.  Opłata 1000 zł, Wpłaty 1000 zł -> Status: "Opłacone".
4.  Status jest przeliczany natychmiast po dodaniu, edycji lub usunięciu wpłaty.

---
ID: US-032
Tytuł: Oznaczenie Opłaty "Po Terminie"
Opis: Jako Właściciel, chcę na pierwszy rzut oka widzieć, które płatności są opóźnione.
Kryteria akceptacji:
1.  Jeśli dzisiejsza data jest późniejsza niż "Data wymagalności" opłaty ORAZ jej status to "Do opłacenia" lub "Częściowo opłacone", opłata jest wyraźnie oznaczona (np. czerwoną etykietą "Po terminie").

---
ID: US-033
Tytuł: Dodanie Wpłaty do Opłaty
Opis: Jako Właściciel, gdy lokator zapłacił, chcę móc szybko zarejestrować tę wpłatę do konkretnej opłaty.
Kryteria akceptacji:
1.  W widoku szczegółów opłaty (lub bezpośrednio na liście) dostępny jest przycisk "Dodaj wpłatę".
2.  Przycisk otwiera prosty formularz/modal z polem: Kwota wpłaty, Data wpłaty (opcjonalnie).
3.  Kwota wpłaty nie może być wyższa niż brakująca kwota do pełnej opłaty.
4.  Po dodaniu wpłaty, status opłaty jest przeliczany (US-031).

---
ID: US-034
Tytuł: Widok Listy Wpłat
Opis: Jako Właściciel, chcę widzieć historię wpłat dla danej opłaty, szczególnie tej "Częściowo opłaconej".
Kryteria akceptacji:
1.  W widoku szczegółów opłaty dostępna jest lista powiązanych wpłat.
2.  Lista pokazuje kwotę i datę każdej wpłaty.

---
ID: US-035
Tytuł: Edycja Wpłaty
Opis: Jako Właściciel, chcę móc poprawić kwotę wpłaty, jeśli się pomyliłem.
Kryteria akceptacji:
1.  Na liście wpłat (US-034) dostępna jest opcja "Edytuj".
2.  Edycja pozwala zmienić kwotę i datę wpłaty.
3.  Suma wpłat po edycji nie może przekroczyć kwoty opłaty.
4.  Po zapisaniu, status opłaty jest przeliczany.

---
ID: US-036
Tytuł: Usunięcie Wpłaty
Opis: Jako Właściciel, chcę móc usunąć błędnie dodaną wpłatę.
Kryteria akceptacji:
1.  Na liście wpłat (US-034) dostępna jest opcja "Usuń".
2.  Usunięcie wymaga potwierdzenia.
3.  Po usunięciu, status opłaty jest przeliczany.

### 5.6. Zarządzanie Protokołami (Właściciel)

---
ID: US-037
Tytuł: Dostęp do Zakładek Protokołów
Opis: Jako Właściciel, chcę mieć łatwy dostęp do protokołów odbioru i zwrotu w panelu mieszkania.
Kryteria akceptacji:
1.  W panelu mieszkania widoczne są dwie stałe zakładki: "Protokół Odbioru" i "Protokół Zwrotu".

---
ID: US-038
Tytuł: Pusty Stan Protokołu
Opis: Jako Właściciel, otwierając pusty protokół, chcę móc od razu dodać treść i zdjęcia.
Kryteria akceptacji:
1.  Domyślny widok pustego protokołu to jedno pole tekstowe (textarea) oraz przycisk "Dodaj zdjęcia".

---
ID: US-039
Tytuł: Edycja Treści Protokołu
Opis: Jako Właściciel, chcę móc wpisać lub edytować ustalenia w protokole (np. "Stan liczników", "Usterki").
Kryteria akceptacji:
1.  Pole tekstowe (textarea) akceptuje zwykły tekst.
2.  Wprowadzony tekst jest zapisywany (np. automatycznie lub przyciskiem "Zapisz").

---
ID: US-040
Tytuł: Dodawanie Zdjęć do Protokołu
Opis: Jako Właściciel, chcę móc dodać zdjęcia dokumentujące stan mieszkania do protokołu.
Kryteria akceptacji:
1.  Przycisk "Dodaj zdjęcia" otwiera systemowy selektor plików.
2.  Mogę wybrać jeden lub więcej plików (JPG, PNG).
3.  Maksymalny rozmiar jednego zdjęcia to 5MB.
4.  Maksymalna łączna liczba zdjęć na jeden protokół (Odbioru lub Zwrotu) to 10.
5.  Próba dodania 11-go zdjęcia skutkuje błędem.
6.  Wgrane zdjęcia wyświetlają się jako lista miniaturek lub linków.

---
ID: US-041
Tytuł: Usuwanie Zdjęcia z Protokołu
Opis: Jako Właściciel, chcę móc usunąć błędnie dodane zdjęcie z protokołu.
Kryteria akceptacji:
1.  Przy każdym zdjęciu na liście (US-040) widoczna jest ikona "Usuń".
2.  Usunięcie wymaga potwierdzenia.
3.  Po usunięciu zwalnia się miejsce na dodanie kolejnego zdjęcia (jeśli limit 10 był osiągnięty).

---
ID: US-042
Tytuł: Wyświetlanie Zdjęć i Załączników
Opis: Jako Właściciel lub Lokator, chcę móc obejrzeć wgrane zdjęcia (z protokołów) i załączniki (z opłat).
Kryteria akceptacji:
1.  Wszystkie wgrane pliki (zdjęcia, załączniki PDF) są wyświetlane jako klikalne linki lub miniaturki.
2.  Kliknięcie na plik otwiera go w nowej karcie przeglądarki (`target="_blank"`), wykorzystując domyślną przeglądarkę plików.

### 5.7. Widok Lokatora (Read-Only)

---
ID: US-043
Tytuł: Rejestracja Lokatora przez Link
Opis: Jako Lokator, który otrzymał link, chcę móc się zarejestrować i automatycznie zostać przypisanym do mieszkania.
Kryteria akceptacji:
1.  Kliknięcie na ważny link zapraszający przekierowuje na stronę rejestracji Lokatora (US-002).
2.  Formularz rejestracji jasno wskazuje, do jakiego mieszkania (nazwa, adres) lokator jest zapraszany.
3.  Po pomyślnej rejestracji, konto lokatora jest tworzone i automatycznie powiązane z tym konkretnym mieszkaniem.
4.  Link zapraszający staje się nieważny (nie można go użyć ponownie).

---
ID: US-044
Tytuł: Dashboard Lokatora
Opis: Jako Lokator, po zalogowaniu chcę od razu widzieć podsumowanie moich finansów.
Kryteria akceptacji:
1.  Główny widok lokatora wyświetla nazwę i adres mieszkania.
2.  Wyświetlane jest podsumowanie salda (np. "Łącznie do zapłaty: 2000 zł").
3.  Saldo jest liczone jako suma wszystkich opłat ze statusem "Do opłacenia" i "Częściowo opłacone" (tylko brakująca kwota).
4.  Dostępna jest nawigacja do listy opłat i protokołów.

---
ID: US-045
Tytuł: Widok Listy Opłat (Lokator)
Opis: Jako Lokator, chcę widzieć listę wszystkich moich opłat i ich statusy.
Kryteria akceptacji:
1.  Lokator widzi listę opłat identyczną jak właściciel (grupowanie, sortowanie, statusy, "Po terminie").
2.  Wszystkie elementy są tylko do odczytu (brak przycisków "Dodaj", "Edytuj", "Usuń").

---
ID: US-046
Tytuł: Widok Szczegółów Opłaty (Lokator)
Opis: Jako Lokator, chcę móc zobaczyć szczegóły opłaty, w tym komentarz właściciela i załącznik.
Kryteria akceptacji:
1.  Kliknięcie na opłatę pokazuje jej szczegóły (Komentarz, Załącznik).
2.  Lokator może pobrać załącznik (kliknięcie otwiera w nowej karcie, US-042).
3.  Lokator widzi listę wpłat dodanych przez właściciela dla tej opłaty (US-047).
4.  Wszystkie pola są tylko do odczytu.

---
ID: US-047
Tytuł: Widok Wpłat (Lokator)
Opis: Jako Lokator, chcę widzieć wpłaty zarejestrowane przez właściciela, aby upewnić się, że wszystko się zgadza.
Kryteria akceptacji:
1.  W szczegółach opłaty lokator widzi listę wpłat (kwota, data) dodanych przez właściciela.
2.  Widok jest tylko do odczytu.

---
ID: US-048
Tytuł: Widok Protokołów (Lokator)
Opis: Jako Lokator, chcę mieć stały wgląd w protokoły odbioru i zwrotu mieszkania.
Kryteria akceptacji:
1.  Lokator ma dostęp do zakładek "Protokół Odbioru" i "Protokół Zwrotu".
2.  Widzi treść tekstową wprowadzoną przez właściciela (pole jest tylko do odczytu).
3.  Widzi listę zdjęć dodanych przez właściciela.
4.  Może klikać na zdjęcia, aby otworzyć je w nowej karcie (US-042).
5.  Brak możliwości dodawania, edytowania lub usuwania treści i zdjęć.

---
ID: US-049
Tytuł: Pusty Stan (Widok Lokatora)
Opis: Jako Lokator, chcę widzieć odpowiedni komunikat, jeśli właściciel nie dodał jeszcze żadnych danych.
Kryteria akceptacji:
1.  Jeśli właściciel nie dodał żadnych opłat, lista opłat pokazuje komunikat (np. "Właściciel nie dodał jeszcze żadnych opłat").
2.  Jeśli właściciel nie uzupełnił protokołu, widok protokołu pokazuje komunikat (np. "Protokół nie został jeszcze uzupełniony").

### 5.8. Przypadki Brzegowe i Ograniczenia

---
ID: US-050
Tytuł: Wygaśnięcie Linku Zapraszającego
Opis: Jako użytkownik, który próbuje użyć linku zapraszającego, który został już wykorzystany, chcę zobaczyć komunikat błędu.
Kryteria akceptacji:
1.  Próba otwarcia linku, który ma status "użyty", przekierowuje na stronę błędu (np. "Ten link zapraszający wygasł lub został już wykorzystany.").
2.  Strona błędu instruuje użytkownika, aby poprosił właściciela o nowy link.

---
ID: US-051
Tytuł: Próba Rejestracji Lokatora bez Linku
Opis: Jako użytkownik, który próbuje uzyskać dostęp do formularza rejestracji lokatora bez linku, nie powinienem być w stanie tego zrobić.
Kryteria akceptacji:
1.  Publicznie dostępny jest tylko formularz rejestracji Właściciela.
2.  Bezpośrednie wejście na URL rejestracji lokatora (bez tokena z linku) przekierowuje na stronę główną lub stronę błędu.

---
ID: US-052
Tytuł: Utrata Dostępu przez Lokatora
Opis: Jako Lokator, który został "usunięty" (zakończono najem) przez właściciela, chcę, aby mój dostęp do danych mieszkania został cofnięty.
Kryteria akceptacji:
1.  Przy próbie zalogowania, lokator widzi komunikat (np. "Najem dla tego mieszkania został zakończony. Skontaktuj się z właścicielem.").
2.  Dane mieszkania (opłaty, protokoły) nie są już dla niego widoczne.
3.  Konto lokatora nadal istnieje w systemie (aby mógł je np. usunąć przez e-mail), ale nie jest powiązane z żadnym mieszkaniem.

---
ID: US-053
Tytuł: Ograniczenie Lokatora do Jednego Mieszkania
Opis: Jako Lokator, który jest już aktywnym najemcą w jednym mieszkaniu, nie mogę przyjąć zaproszenia do drugiego mieszkania.
Kryteria akceptacji:
1.  Jeśli zalogowany lokator (lub lokator o tym samym e-mailu) kliknie nowy link zapraszający, zobaczy błąd (np. "Twoje konto jest już przypisane do aktywnego najmu. Aby przyjąć nowe zaproszenie, poprzedni najem musi zostać zakończony przez właściciela.").

---
ID: US-054
Tytuł: Responsywność (RWD)
Opis: Jako użytkownik (Właściciel lub Lokator), chcę móc wygodnie korzystać z aplikacji na moim telefonie komórkowym.
Kryteria akceptacji:
1.  Aplikacja jest w pełni responsywna (RWD).
2.  Wszystkie funkcje (formularze, listy, przyciski, nawigacja) są dostępne i czytelne na ekranach mobilnych (o szerokości od 360px).
3.  Interfejs dostosowuje się do rozmiaru ekranu (np. nawigacja zwija się do menu "hamburger").

## 6. Metryki sukcesu

Ze względu na świadomą rezygnację z implementacji narzędzi analitycznych (np. Google Analytics) w ramach MVP, kryteria sukcesu będą mierzone ręcznie przez właściciela projektu za pomocą bezpośrednich zapytań SQL do bazy danych produkcyjnej.

Schemat bazy danych musi wspierać łatwe odpytanie tych danych (np. poprzez znaczniki czasu (timestamp) dla kluczowych zdarzeń).

Kryterium 1: Wdrożenie Właścicieli
* Metryka: 80% właścicieli, którzy założyli konto, zaprosiło lokatora do mieszkania.
* Sposób pomiaru: Zapytanie SQL mierzące stosunek liczby właścicieli posiadających co najmniej jeden wygenerowany link zapraszający (`invitation_links`) do całkowitej liczby właścicieli, mierzone w ciągu 7 dni od daty rejestracji właściciela (`users.created_at`).

Kryterium 2: Aktywne Wykorzystanie Rozliczeń
* Metryka: 50% właścicieli, którzy zaprosili lokatora, rozliczają się z nim przez aplikację.
* Sposób pomiaru: Zapytanie SQL mierzące stosunek liczby właścicieli (którzy pomyślnie zaprosili lokatora), którzy dodali i oznaczyli jako "Opłacone" co najmniej jedną opłatę (`charges.status = 'paid'`), do całkowitej liczby właścicieli, którzy pomyślnie zaprosili lokatora. Pomiar w ciągu 2 miesięcy od daty zaproszenia lokatora.