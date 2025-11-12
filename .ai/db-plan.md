# Schemat Bazy Danych - Rentflow MVP

## 1. Typy Enum

```sql
-- Role użytkowników
CREATE TYPE user_role AS ENUM ('owner', 'tenant');

-- Typy opłat
CREATE TYPE charge_type AS ENUM ('rent', 'bill', 'other');

-- Status najmu
CREATE TYPE lease_status AS ENUM ('active', 'archived');

-- Typy protokołów
CREATE TYPE protocol_type AS ENUM ('move_in', 'move_out');

-- Status linków zapraszających
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired');
```

## 2. Tabele

### 2.1. users

Rozszerzenie profilu `auth.users`, przechowuje role i dane profilowe użytkowników.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indeksy
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Constraints
COMMENT ON TABLE users IS 'Profil użytkownika - właściciele i lokatorzy';
COMMENT ON COLUMN users.id IS 'UUID z auth.users - tożsamość użytkownika';
COMMENT ON COLUMN users.role IS 'Rola: owner (pełen CRUD) lub tenant (read-only)';
```

### 2.2. apartments

Mieszkania należące do właścicieli.

```sql
CREATE TABLE apartments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id)
);

-- Indeksy
CREATE INDEX idx_apartments_owner_id ON apartments(owner_id);

-- Constraints
COMMENT ON TABLE apartments IS 'Mieszkania na wynajem zarządzane przez właścicieli';
COMMENT ON COLUMN apartments.owner_id IS 'Właściciel mieszkania - ON DELETE RESTRICT wymusza najpierw usunięcie mieszkań';
COMMENT ON COLUMN apartments.name IS 'Nazwa mieszkania (np. "Kawalerka na Woli")';
COMMENT ON COLUMN apartments.address IS 'Pełny adres mieszkania';
```

### 2.3. leases

Reprezentacja najmu (aktywnego lub archiwalnego).

```sql
CREATE TABLE leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id UUID NOT NULL REFERENCES apartments(id) ON DELETE RESTRICT,
  tenant_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  status lease_status NOT NULL DEFAULT 'active',
  start_date DATE,
  archived_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id)
);

-- Indeksy
CREATE INDEX idx_leases_apartment_id ON leases(apartment_id);
CREATE INDEX idx_leases_tenant_id ON leases(tenant_id);
CREATE INDEX idx_leases_status ON leases(status);

-- Unique partial indexes - business constraints
CREATE UNIQUE INDEX idx_one_active_lease_per_apartment
  ON leases(apartment_id) WHERE status = 'active';

CREATE UNIQUE INDEX idx_one_active_lease_per_tenant
  ON leases(tenant_id) WHERE status = 'active' AND tenant_id IS NOT NULL;

-- Constraints
COMMENT ON TABLE leases IS 'Najem - aktywny lub zarchiwizowany (soft delete)';
COMMENT ON COLUMN leases.status IS 'active = aktywny najem, archived = zakończony (dla historii)';
COMMENT ON COLUMN leases.tenant_id IS 'NULL gdy zaproszenie jeszcze nie przyjęte';
COMMENT ON COLUMN leases.start_date IS 'Data rozpoczęcia najmu (opcjonalna)';
COMMENT ON COLUMN leases.archived_at IS 'Timestamp zakończenia najmu';
```

### 2.4. invitation_links

Jednorazowe linki zapraszające dla lokatorów.

```sql
CREATE TABLE invitation_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status invitation_status NOT NULL DEFAULT 'pending',
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id)
);

-- Indeksy
CREATE UNIQUE INDEX idx_invitation_links_token ON invitation_links(token);
CREATE INDEX idx_invitation_links_apartment_id ON invitation_links(apartment_id);
CREATE INDEX idx_invitation_links_status ON invitation_links(status);

-- Constraints
COMMENT ON TABLE invitation_links IS 'Jednorazowe linki zapraszające dla lokatorów';
COMMENT ON COLUMN invitation_links.token IS 'UUID v4 token w URL zaproszenia';
COMMENT ON COLUMN invitation_links.status IS 'pending = nieużyty, accepted = użyty, expired = wygasły';
COMMENT ON COLUMN invitation_links.accepted_by IS 'ID lokatora który przyjął zaproszenie';
```

### 2.5. charges

Opłaty (czynsz, rachunki) przypisane do najmu.

```sql
CREATE TABLE charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  type charge_type NOT NULL,
  comment TEXT CHECK (length(comment) <= 300),
  attachment_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id)
);

-- Indeksy
CREATE INDEX idx_charges_lease_id ON charges(lease_id);
CREATE INDEX idx_charges_due_date ON charges(due_date DESC);
CREATE INDEX idx_charges_type ON charges(type);
CREATE INDEX idx_charges_created_by ON charges(created_by);

-- Constraints
COMMENT ON TABLE charges IS 'Opłaty (czynsz, rachunki) dla najmu';
COMMENT ON COLUMN charges.amount IS 'Kwota opłaty w PLN (NUMERIC dla precyzji finansowej)';
COMMENT ON COLUMN charges.due_date IS 'Data wymagalności płatności';
COMMENT ON COLUMN charges.type IS 'rent = czynsz, bill = rachunek, other = inne';
COMMENT ON COLUMN charges.comment IS 'Opcjonalny komentarz (max 300 znaków)';
COMMENT ON COLUMN charges.attachment_path IS 'Ścieżka do pliku w Supabase Storage (charge-attachments bucket)';
```

### 2.6. payments

Wpłaty dokonane na opłaty.

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id UUID NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id)
);

-- Indeksy
CREATE INDEX idx_payments_charge_id ON payments(charge_id);
CREATE INDEX idx_payments_payment_date ON payments(payment_date DESC);
CREATE INDEX idx_payments_created_by ON payments(created_by);

-- Constraints
COMMENT ON TABLE payments IS 'Wpłaty dokonane przez lokatorów (rejestrowane przez właściciela)';
COMMENT ON COLUMN payments.amount IS 'Kwota wpłaty w PLN';
COMMENT ON COLUMN payments.payment_date IS 'Data faktycznej wpłaty (ustawiana przez właściciela)';
```

### 2.7. protocols

Protokoły zdawczo-odbiorcze (tekst).

```sql
CREATE TABLE protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  type protocol_type NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  UNIQUE (lease_id, type)
);

-- Indeksy
CREATE INDEX idx_protocols_lease_id ON protocols(lease_id);
CREATE UNIQUE INDEX idx_protocols_lease_type ON protocols(lease_id, type);

-- Constraints
COMMENT ON TABLE protocols IS 'Protokoły odbioru i zwrotu mieszkania';
COMMENT ON COLUMN protocols.type IS 'move_in = protokół odbioru, move_out = protokół zwrotu';
COMMENT ON COLUMN protocols.description IS 'Treść tekstowa protokołu (ustalenia, stan liczników, usterki)';
COMMENT ON CONSTRAINT protocols_lease_id_type_key ON protocols IS 'Max 2 protokoły per lease (move_in + move_out)';
```

### 2.8. protocol_photos

Zdjęcia do protokołów.

```sql
CREATE TABLE protocol_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id)
);

-- Indeksy
CREATE INDEX idx_protocol_photos_protocol_id ON protocol_photos(protocol_id);
CREATE INDEX idx_protocol_photos_uploaded_at ON protocol_photos(uploaded_at DESC);

-- Constraints
COMMENT ON TABLE protocol_photos IS 'Zdjęcia dokumentujące stan mieszkania w protokołach';
COMMENT ON COLUMN protocol_photos.file_path IS 'Ścieżka do pliku w Supabase Storage (protocol-photos bucket)';
COMMENT ON TABLE protocol_photos IS 'Max 10 zdjęć per protokół - wymuszane przez trigger + RLS';
```

## 3. Relacje między tabelami

### Diagram relacji:

```
auth.users (Supabase Auth)
    ↓ (trigger on_auth_user_created)
public.users
    ├─→ apartments (owner_id) [1:N] ON DELETE RESTRICT
    ├─→ leases (tenant_id) [1:N] ON DELETE RESTRICT
    └─→ invitation_links (accepted_by) [1:N] ON DELETE SET NULL

apartments
    ├─→ leases [1:N] ON DELETE RESTRICT
    └─→ invitation_links [1:N] ON DELETE CASCADE

leases
    ├─→ charges [1:N] ON DELETE CASCADE
    └─→ protocols [1:2] ON DELETE CASCADE (max: move_in + move_out)

charges
    └─→ payments [1:N] ON DELETE CASCADE

protocols
    └─→ protocol_photos [1:10] ON DELETE CASCADE (max)

invitation_links
    └─→ users (accepted_by) [nullable]
```

### Kardynalność i cascading:

| Od | Do | Typ | ON DELETE | Uzasadnienie |
|---|---|---|---|---|
| users | apartments | 1:N | RESTRICT | Właściciel musi najpierw usunąć mieszkania |
| users | leases (tenant) | 1:N | RESTRICT | Chronić dane najmu przed usunięciem konta lokatora |
| apartments | leases | 1:N | RESTRICT | Chronić najem przed usunięciem mieszkania (blokada przez trigger) |
| apartments | invitation_links | 1:N | CASCADE | Usunięcie mieszkania usuwa nieużyte zaproszenia |
| leases | charges | 1:N | CASCADE | Opłaty są częścią najmu |
| leases | protocols | 1:2 | CASCADE | Protokoły są częścią najmu |
| charges | payments | 1:N | CASCADE | Wpłaty są częścią opłaty |
| protocols | protocol_photos | 1:10 | CASCADE | Zdjęcia są częścią protokołu |
| invitation_links | users (accepted_by) | N:1 | SET NULL | Historia zachowana nawet po usunięciu konta |

## 4. Database Functions

### 4.1. Automatyczna aktualizacja updated_at

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column() IS 'Automatycznie aktualizuje updated_at przy UPDATE';
```

### 4.2. Integracja z Supabase Auth

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'owner')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION handle_new_user() IS 'Automatycznie tworzy profil w public.users po rejestracji w auth.users';
```

### 4.3. Walidacja edycji opłat

```sql
CREATE OR REPLACE FUNCTION check_charge_edit_constraints()
RETURNS TRIGGER AS $$
DECLARE
  total_payments NUMERIC(10, 2);
BEGIN
  -- Oblicz sumę wpłat dla tej opłaty
  SELECT COALESCE(SUM(amount), 0)
  INTO total_payments
  FROM payments
  WHERE charge_id = NEW.id;

  -- Reguła 1: Nie można edytować w pełni opłaconej opłaty
  IF OLD.amount IS NOT NULL AND total_payments >= OLD.amount THEN
    RAISE EXCEPTION 'Cannot edit a fully paid charge';
  END IF;

  -- Reguła 2: Nie można zmniejszyć kwoty poniżej sumy wpłat
  IF NEW.amount < total_payments THEN
    RAISE EXCEPTION 'Charge amount cannot be less than total payments (%). Current total: %',
      NEW.amount, total_payments;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_charge_edit_constraints() IS 'Wymusza reguły biznesowe dla edycji opłat';
```

### 4.4. Walidacja sumy wpłat

```sql
CREATE OR REPLACE FUNCTION check_payment_sum()
RETURNS TRIGGER AS $$
DECLARE
  charge_amount NUMERIC(10, 2);
  current_payments NUMERIC(10, 2);
  new_total NUMERIC(10, 2);
BEGIN
  -- Pobierz kwotę opłaty
  SELECT amount INTO charge_amount
  FROM charges
  WHERE id = NEW.charge_id;

  -- Oblicz aktualną sumę wpłat (bez tej nowej)
  SELECT COALESCE(SUM(amount), 0)
  INTO current_payments
  FROM payments
  WHERE charge_id = NEW.charge_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

  -- Oblicz nową sumę
  new_total := current_payments + NEW.amount;

  -- Sprawdź czy suma nie przekracza kwoty opłaty
  IF new_total > charge_amount THEN
    RAISE EXCEPTION 'Total payments (%) cannot exceed charge amount (%)',
      new_total, charge_amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_payment_sum() IS 'Zapewnia że suma wpłat nie przekracza kwoty opłaty';
```

### 4.5. Limit zdjęć protokołu

```sql
CREATE OR REPLACE FUNCTION check_protocol_photos_limit()
RETURNS TRIGGER AS $$
DECLARE
  photo_count INTEGER;
BEGIN
  -- Policz istniejące zdjęcia dla tego protokołu
  SELECT COUNT(*)
  INTO photo_count
  FROM protocol_photos
  WHERE protocol_id = NEW.protocol_id;

  -- Sprawdź limit (10 zdjęć)
  IF photo_count >= 10 THEN
    RAISE EXCEPTION 'Cannot add more than 10 photos per protocol';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_protocol_photos_limit() IS 'Wymusza limit 10 zdjęć per protokół';
```

### 4.6. Blokada usunięcia mieszkania z najmami

```sql
CREATE OR REPLACE FUNCTION check_apartment_deletion()
RETURNS TRIGGER AS $$
DECLARE
  lease_count INTEGER;
BEGIN
  -- Policz wszystkie najmy (aktywne i archiwalne) dla tego mieszkania
  SELECT COUNT(*)
  INTO lease_count
  FROM leases
  WHERE apartment_id = OLD.id;

  -- Blokuj usunięcie jeśli są jakiekolwiek najmy
  IF lease_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete apartment with existing leases (active or archived). Please remove all leases first.';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_apartment_deletion() IS 'Blokuje usunięcie mieszkania które ma najmy';
```

## 5. Triggery

### 5.1. Audyt - automatyczna aktualizacja updated_at

```sql
-- users
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- apartments
CREATE TRIGGER set_apartments_updated_at
  BEFORE UPDATE ON apartments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- leases
CREATE TRIGGER set_leases_updated_at
  BEFORE UPDATE ON leases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- invitation_links
CREATE TRIGGER set_invitation_links_updated_at
  BEFORE UPDATE ON invitation_links
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- charges
CREATE TRIGGER set_charges_updated_at
  BEFORE UPDATE ON charges
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- payments
CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- protocols
CREATE TRIGGER set_protocols_updated_at
  BEFORE UPDATE ON protocols
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 5.2. Integracja z Supabase Auth

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

COMMENT ON TRIGGER on_auth_user_created ON auth.users IS 'Automatycznie tworzy profil użytkownika po rejestracji';
```

### 5.3. Business logic - walidacje

```sql
-- Walidacja edycji opłat
CREATE TRIGGER validate_charge_edit
  BEFORE UPDATE ON charges
  FOR EACH ROW
  EXECUTE FUNCTION check_charge_edit_constraints();

-- Walidacja sumy wpłat
CREATE TRIGGER validate_payment_sum_insert
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION check_payment_sum();

CREATE TRIGGER validate_payment_sum_update
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION check_payment_sum();

-- Limit zdjęć protokołu
CREATE TRIGGER validate_protocol_photos_limit
  BEFORE INSERT ON protocol_photos
  FOR EACH ROW
  EXECUTE FUNCTION check_protocol_photos_limit();

-- Blokada usunięcia mieszkania
CREATE TRIGGER prevent_apartment_deletion_with_leases
  BEFORE DELETE ON apartments
  FOR EACH ROW
  EXECUTE FUNCTION check_apartment_deletion();
```

## 6. Database Views

### 6.1. charges_with_status

View obliczający dynamicznie status opłaty na podstawie wpłat.

```sql
CREATE OR REPLACE VIEW charges_with_status AS
SELECT
  c.id,
  c.lease_id,
  c.amount,
  c.due_date,
  c.type,
  c.comment,
  c.attachment_path,
  c.created_at,
  c.updated_at,
  c.created_by,
  COALESCE(SUM(p.amount), 0) AS total_paid,
  c.amount - COALESCE(SUM(p.amount), 0) AS remaining_amount,
  CASE
    WHEN COALESCE(SUM(p.amount), 0) = 0 THEN 'unpaid'
    WHEN COALESCE(SUM(p.amount), 0) < c.amount THEN 'partially_paid'
    WHEN COALESCE(SUM(p.amount), 0) >= c.amount THEN 'paid'
  END AS payment_status,
  CASE
    WHEN c.due_date < CURRENT_DATE
      AND COALESCE(SUM(p.amount), 0) < c.amount
    THEN TRUE
    ELSE FALSE
  END AS is_overdue
FROM charges c
LEFT JOIN payments p ON p.charge_id = c.id
GROUP BY c.id;

COMMENT ON VIEW charges_with_status IS 'Opłaty z dynamicznie obliczonym statusem płatności i flagą is_overdue';
COMMENT ON COLUMN charges_with_status.total_paid IS 'Suma wpłat dla tej opłaty';
COMMENT ON COLUMN charges_with_status.remaining_amount IS 'Pozostała kwota do zapłaty';
COMMENT ON COLUMN charges_with_status.payment_status IS 'unpaid | partially_paid | paid';
COMMENT ON COLUMN charges_with_status.is_overdue IS 'TRUE jeśli po terminie i nie opłacone w pełni';
```

## 7. Row Level Security (RLS) Policies

### Włączenie RLS dla wszystkich tabel

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_photos ENABLE ROW LEVEL SECURITY;
```

### 7.1. users

```sql
-- SELECT: Użytkownicy widzą swój profil
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- UPDATE: Użytkownicy mogą aktualizować swój profil
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- INSERT: Tylko system (via trigger)
-- DELETE: Tylko system
```

### 7.2. apartments

```sql
-- SELECT: Właściciele widzą swoje mieszkania
CREATE POLICY "Owners can view their apartments"
  ON apartments FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- SELECT: Lokatorzy widzą mieszkanie swojego aktywnego najmu
CREATE POLICY "Tenants can view their apartment"
  ON apartments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leases
      WHERE leases.apartment_id = apartments.id
        AND leases.tenant_id = auth.uid()
        AND leases.status = 'active'
    )
  );

-- INSERT: Właściciele mogą dodawać mieszkania
CREATE POLICY "Owners can insert their apartments"
  ON apartments FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- UPDATE: Właściciele mogą aktualizować swoje mieszkania
CREATE POLICY "Owners can update their apartments"
  ON apartments FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- DELETE: Właściciele mogą usuwać swoje mieszkania (blokowane przez trigger jeśli są leases)
CREATE POLICY "Owners can delete their apartments"
  ON apartments FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());
```

### 7.3. leases

```sql
-- SELECT: Właściciele widzą najmy swoich mieszkań (aktywne i archiwalne)
CREATE POLICY "Owners can view leases for their apartments"
  ON leases FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM apartments
      WHERE apartments.id = leases.apartment_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- SELECT: Lokatorzy widzą tylko swój aktywny najem
CREATE POLICY "Tenants can view their active lease"
  ON leases FOR SELECT
  TO authenticated
  USING (
    tenant_id = auth.uid()
    AND status = 'active'
  );

-- INSERT: Właściciele mogą tworzyć najmy dla swoich mieszkań
CREATE POLICY "Owners can insert leases for their apartments"
  ON leases FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM apartments
      WHERE apartments.id = leases.apartment_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- UPDATE: Właściciele mogą aktualizować najmy swoich mieszkań
CREATE POLICY "Owners can update leases for their apartments"
  ON leases FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM apartments
      WHERE apartments.id = leases.apartment_id
        AND apartments.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM apartments
      WHERE apartments.id = leases.apartment_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- DELETE: Właściciele mogą usuwać najmy swoich mieszkań
CREATE POLICY "Owners can delete leases for their apartments"
  ON leases FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM apartments
      WHERE apartments.id = leases.apartment_id
        AND apartments.owner_id = auth.uid()
    )
  );
```

### 7.4. invitation_links

```sql
-- SELECT: Właściciele widzą linki dla swoich mieszkań
CREATE POLICY "Owners can view invitation links for their apartments"
  ON invitation_links FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM apartments
      WHERE apartments.id = invitation_links.apartment_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- SELECT: Publiczny dostęp dla walidacji tokenu (podczas rejestracji lokatora)
CREATE POLICY "Anyone can view invitation link by token"
  ON invitation_links FOR SELECT
  TO anon
  USING (TRUE);

-- INSERT: Właściciele mogą tworzyć linki dla swoich mieszkań
CREATE POLICY "Owners can insert invitation links for their apartments"
  ON invitation_links FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM apartments
      WHERE apartments.id = invitation_links.apartment_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- UPDATE: Właściciele mogą aktualizować linki dla swoich mieszkań
CREATE POLICY "Owners can update invitation links for their apartments"
  ON invitation_links FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM apartments
      WHERE apartments.id = invitation_links.apartment_id
        AND apartments.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM apartments
      WHERE apartments.id = invitation_links.apartment_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- UPDATE: System może aktualizować status (accepted) podczas rejestracji lokatora
CREATE POLICY "System can update invitation link status"
  ON invitation_links FOR UPDATE
  TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

-- DELETE: Właściciele mogą usuwać linki dla swoich mieszkań
CREATE POLICY "Owners can delete invitation links for their apartments"
  ON invitation_links FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM apartments
      WHERE apartments.id = invitation_links.apartment_id
        AND apartments.owner_id = auth.uid()
    )
  );
```

### 7.5. charges

```sql
-- SELECT: Właściciele widzą opłaty dla swoich mieszkań
CREATE POLICY "Owners can view charges for their apartments"
  ON charges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leases
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE leases.id = charges.lease_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- SELECT: Lokatorzy widzą opłaty dla swojego aktywnego najmu
CREATE POLICY "Tenants can view charges for their active lease"
  ON charges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leases
      WHERE leases.id = charges.lease_id
        AND leases.tenant_id = auth.uid()
        AND leases.status = 'active'
    )
  );

-- INSERT: Właściciele mogą dodawać opłaty dla swoich mieszkań
CREATE POLICY "Owners can insert charges for their apartments"
  ON charges FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leases
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE leases.id = charges.lease_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- UPDATE: Właściciele mogą aktualizować opłaty dla swoich mieszkań
CREATE POLICY "Owners can update charges for their apartments"
  ON charges FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leases
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE leases.id = charges.lease_id
        AND apartments.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leases
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE leases.id = charges.lease_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- DELETE: Właściciele mogą usuwać opłaty dla swoich mieszkań
CREATE POLICY "Owners can delete charges for their apartments"
  ON charges FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leases
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE leases.id = charges.lease_id
        AND apartments.owner_id = auth.uid()
    )
  );
```

### 7.6. payments

```sql
-- SELECT: Właściciele widzą wpłaty dla swoich mieszkań
CREATE POLICY "Owners can view payments for their apartments"
  ON payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM charges
      JOIN leases ON leases.id = charges.lease_id
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE charges.id = payments.charge_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- SELECT: Lokatorzy widzą wpłaty dla swojego aktywnego najmu
CREATE POLICY "Tenants can view payments for their active lease"
  ON payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM charges
      JOIN leases ON leases.id = charges.lease_id
      WHERE charges.id = payments.charge_id
        AND leases.tenant_id = auth.uid()
        AND leases.status = 'active'
    )
  );

-- INSERT: Właściciele mogą dodawać wpłaty dla swoich mieszkań
CREATE POLICY "Owners can insert payments for their apartments"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM charges
      JOIN leases ON leases.id = charges.lease_id
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE charges.id = payments.charge_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- UPDATE: Właściciele mogą aktualizować wpłaty dla swoich mieszkań
CREATE POLICY "Owners can update payments for their apartments"
  ON payments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM charges
      JOIN leases ON leases.id = charges.lease_id
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE charges.id = payments.charge_id
        AND apartments.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM charges
      JOIN leases ON leases.id = charges.lease_id
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE charges.id = payments.charge_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- DELETE: Właściciele mogą usuwać wpłaty dla swoich mieszkań
CREATE POLICY "Owners can delete payments for their apartments"
  ON payments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM charges
      JOIN leases ON leases.id = charges.lease_id
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE charges.id = payments.charge_id
        AND apartments.owner_id = auth.uid()
    )
  );
```

### 7.7. protocols

```sql
-- SELECT: Właściciele widzą protokoły dla swoich mieszkań
CREATE POLICY "Owners can view protocols for their apartments"
  ON protocols FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leases
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE leases.id = protocols.lease_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- SELECT: Lokatorzy widzą protokoły dla swojego aktywnego najmu
CREATE POLICY "Tenants can view protocols for their active lease"
  ON protocols FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leases
      WHERE leases.id = protocols.lease_id
        AND leases.tenant_id = auth.uid()
        AND leases.status = 'active'
    )
  );

-- INSERT: Właściciele mogą dodawać protokoły dla swoich mieszkań
CREATE POLICY "Owners can insert protocols for their apartments"
  ON protocols FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leases
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE leases.id = protocols.lease_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- UPDATE: Właściciele mogą aktualizować protokoły dla swoich mieszkań
CREATE POLICY "Owners can update protocols for their apartments"
  ON protocols FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leases
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE leases.id = protocols.lease_id
        AND apartments.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leases
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE leases.id = protocols.lease_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- DELETE: Właściciele mogą usuwać protokoły dla swoich mieszkań
CREATE POLICY "Owners can delete protocols for their apartments"
  ON protocols FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leases
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE leases.id = protocols.lease_id
        AND apartments.owner_id = auth.uid()
    )
  );
```

### 7.8. protocol_photos

```sql
-- SELECT: Właściciele widzą zdjęcia protokołów dla swoich mieszkań
CREATE POLICY "Owners can view protocol photos for their apartments"
  ON protocol_photos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM protocols
      JOIN leases ON leases.id = protocols.lease_id
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE protocols.id = protocol_photos.protocol_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- SELECT: Lokatorzy widzą zdjęcia protokołów dla swojego aktywnego najmu
CREATE POLICY "Tenants can view protocol photos for their active lease"
  ON protocol_photos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM protocols
      JOIN leases ON leases.id = protocols.lease_id
      WHERE protocols.id = protocol_photos.protocol_id
        AND leases.tenant_id = auth.uid()
        AND leases.status = 'active'
    )
  );

-- INSERT: Właściciele mogą dodawać zdjęcia (z limitem 10 przez trigger)
CREATE POLICY "Owners can insert protocol photos for their apartments"
  ON protocol_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM protocols
      JOIN leases ON leases.id = protocols.lease_id
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE protocols.id = protocol_photos.protocol_id
        AND apartments.owner_id = auth.uid()
    )
    AND (
      SELECT COUNT(*)
      FROM protocol_photos
      WHERE protocol_id = protocol_photos.protocol_id
    ) < 10
  );

-- UPDATE: Właściciele mogą aktualizować zdjęcia protokołów
CREATE POLICY "Owners can update protocol photos for their apartments"
  ON protocol_photos FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM protocols
      JOIN leases ON leases.id = protocols.lease_id
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE protocols.id = protocol_photos.protocol_id
        AND apartments.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM protocols
      JOIN leases ON leases.id = protocols.lease_id
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE protocols.id = protocol_photos.protocol_id
        AND apartments.owner_id = auth.uid()
    )
  );

-- DELETE: Właściciele mogą usuwać zdjęcia protokołów
CREATE POLICY "Owners can delete protocol photos for their apartments"
  ON protocol_photos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM protocols
      JOIN leases ON leases.id = protocols.lease_id
      JOIN apartments ON apartments.id = leases.apartment_id
      WHERE protocols.id = protocol_photos.protocol_id
        AND apartments.owner_id = auth.uid()
    )
  );
```

## 8. Supabase Storage Policies

### 8.1. Bucket: charge-attachments

```sql
-- Właściciele mogą uploadować załączniki dla swoich opłat
CREATE POLICY "Owners can upload charge attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'charge-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM apartments WHERE owner_id = auth.uid()
    )
  );

-- Właściciele mogą odczytywać załączniki dla swoich opłat
CREATE POLICY "Owners can view charge attachments for their apartments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'charge-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM apartments WHERE owner_id = auth.uid()
    )
  );

-- Lokatorzy mogą odczytywać załączniki dla swojego aktywnego najmu
CREATE POLICY "Tenants can view charge attachments for their lease"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'charge-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT a.id::text
      FROM apartments a
      JOIN leases l ON l.apartment_id = a.id
      WHERE l.tenant_id = auth.uid() AND l.status = 'active'
    )
  );

-- Właściciele mogą usuwać załączniki dla swoich opłat
CREATE POLICY "Owners can delete charge attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'charge-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM apartments WHERE owner_id = auth.uid()
    )
  );
```

### 8.2. Bucket: protocol-photos

```sql
-- Właściciele mogą uploadować zdjęcia protokołów dla swoich mieszkań
CREATE POLICY "Owners can upload protocol photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'protocol-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM apartments WHERE owner_id = auth.uid()
    )
  );

-- Właściciele mogą odczytywać zdjęcia protokołów dla swoich mieszkań
CREATE POLICY "Owners can view protocol photos for their apartments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'protocol-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM apartments WHERE owner_id = auth.uid()
    )
  );

-- Lokatorzy mogą odczytywać zdjęcia protokołów dla swojego aktywnego najmu
CREATE POLICY "Tenants can view protocol photos for their lease"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'protocol-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT a.id::text
      FROM apartments a
      JOIN leases l ON l.apartment_id = a.id
      WHERE l.tenant_id = auth.uid() AND l.status = 'active'
    )
  );

-- Właściciele mogą usuwać zdjęcia protokołów
CREATE POLICY "Owners can delete protocol photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'protocol-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM apartments WHERE owner_id = auth.uid()
    )
  );
```

## 9. Zapytania wspierające metryki sukcesu

### 9.1. Metryka 1: Wdrożenie właścicieli (80% w ciągu 7 dni)

```sql
-- Procent właścicieli, którzy zaprosili lokatora w ciągu 7 dni od rejestracji
SELECT
  COUNT(DISTINCT u.id) FILTER (WHERE il.id IS NOT NULL) * 100.0 /
  NULLIF(COUNT(DISTINCT u.id), 0) as pct_invited_within_7_days
FROM users u
LEFT JOIN apartments a ON a.owner_id = u.id
LEFT JOIN invitation_links il ON il.apartment_id = a.id
  AND il.created_at <= u.created_at + INTERVAL '7 days'
WHERE u.role = 'owner'
  AND u.created_at >= NOW() - INTERVAL '30 days'; -- ostatnie 30 dni
```

### 9.2. Metryka 2: Aktywne wykorzystanie (50% w ciągu 2 miesięcy)

```sql
-- Procent właścicieli którzy rozliczyli co najmniej jedną opłatę jako "opłacone"
WITH owners_with_accepted_invitations AS (
  SELECT DISTINCT
    a.owner_id,
    il.created_at as invitation_accepted_at
  FROM invitation_links il
  JOIN apartments a ON a.id = il.apartment_id
  WHERE il.status = 'accepted'
    AND il.created_at >= NOW() - INTERVAL '2 months'
)
SELECT
  COUNT(DISTINCT c.created_by) * 100.0 /
  NULLIF(COUNT(DISTINCT owi.owner_id), 0) as pct_actively_using
FROM owners_with_accepted_invitations owi
LEFT JOIN apartments a ON a.owner_id = owi.owner_id
LEFT JOIN leases l ON l.apartment_id = a.id
LEFT JOIN charges c ON c.lease_id = l.id
LEFT JOIN (
  SELECT
    charge_id,
    SUM(amount) as total_paid
  FROM payments
  GROUP BY charge_id
) p ON p.charge_id = c.id
WHERE p.total_paid >= c.amount; -- co najmniej jedna opłata w pełni opłacona
```

## 10. Dodatkowe uwagi i decyzje projektowe

### 10.1. Normalizacja

Schema jest znormalizowana do **3NF (Third Normal Form)**:
- Eliminacja powtarzających się danych
- Każda kolumna jest atomowa
- Brak częściowych zależności od klucza głównego
- Brak przechodnich zależności

**Wyjątki (denormalizacja)**:
- `charges_with_status` VIEW - obliczenia agregowane dla wydajności
- `created_by` duplikowane w wielu tabelach - dla audytu i łatwiejszych queries

### 10.2. Wydajność

**Strategie optymalizacji**:
1. **Indeksy na foreign keys** - wszystkie FK mają indeks dla JOIN optimization
2. **Partial indexes** - dla business constraints (aktywne najmy)
3. **Targeted indexes** - dla głównych filtrów (due_date DESC, status)
4. **Database view** - `charges_with_status` zamiast obliczeń w aplikacji
5. **Storage separation** - pliki w Supabase Storage, tylko ścieżki w bazie

**Monitoring**:
- Włączyć `pg_stat_statements` dla identyfikacji slow queries
- Regularny VACUUM ANALYZE
- Monitorowanie RLS policy performance

### 10.3. Skalowalność

**Obecne założenia MVP**:
- Wolumen: setki właścicieli, tysiące lokatorów, dziesiątki tysięcy opłat
- Growth rate: liniowy wzrost

**Przyszłe optymalizacje** (gdy wolumen osiągnie krytyczną masę):
1. **Partycjonowanie** `charges` by `due_date` (PARTITION BY RANGE)
2. **Archival strategy** - przeniesienie `archived` leases starszych niż 5 lat do cold storage
3. **Caching layer** - Redis dla dashboard data i frequently accessed queries
4. **Read replicas** - dla raportów i metryk (nie blokować transakcji)

### 10.4. Bezpieczeństwo

**Zasady implementacji RLS**:
1. **Granularność** - osobna policy dla każdej operacji (SELECT, INSERT, UPDATE, DELETE)
2. **Nie łączyć policies** - nawet dla identycznej logiki (priorytet: audytowalność)
3. **auth.uid()** - natywna integracja z Supabase Auth
4. **WITH CHECK** - walidacja przy INSERT/UPDATE
5. **SECURITY DEFINER** - dla functions wymagających elevated privileges

**Dodatkowe warstwy bezpieczeństwa**:
- Database triggers dla krytycznych business rules
- Check constraints dla wartości biznesowych
- Type safety przez ENUMs
- Storage RLS policies spójne z database RLS

### 10.5. Audytowalność

**Standardowe kolumny audytowe** (wszystkie tabele):
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` (auto via trigger)
- `created_by UUID REFERENCES users(id)` (dla tabel transakcyjnych)

**Przyszłe rozszerzenie** (post-MVP):
- Tabela `audit_log` dla pełnej historii zmian
- Trigger zapisujący OLD i NEW values w JSONB
- Retention policy (np. 2 lata)

### 10.6. Data integrity safeguards

**Constrainty na poziomie bazy**:
- `amount > 0` dla `charges` i `payments`
- Unique constraints dla business rules (active leases)
- Foreign key constraints z odpowiednim ON DELETE behavior
- Check constraints dla długości tekstów (`comment <= 300`)

**Triggers dla złożonych reguł**:
- Nie można edytować fully paid charge
- Nie można zmniejszyć amount poniżej sumy wpłat
- Suma wpłat nie może przekroczyć kwoty opłaty
- Max 10 zdjęć per protokół
- Blokada usunięcia mieszkania z najmami

**Transaction isolation**:
- Supabase default: `READ COMMITTED`
- Wystarczające dla MVP (race conditions minimalizowane przez constrainty)
- Przyszłość: rozważyć `SERIALIZABLE` dla krytycznych transakcji finansowych

### 10.7. Migracje

**Strategia migracji**:
1. **Format nazwy**: `YYYYMMDDHHmmss_short_description.sql` (UTC time)
2. **Struktura pliku**:
   - Header comment z metadata
   - Lowercase SQL
   - Obszerne komentarze
   - Zawsze enable RLS dla nowych tabel
   - Granularne policies
3. **Kolejność tworzenia**:
   - ENUMs
   - Tabele (w kolejności zależności FK)
   - Indeksy
   - Functions
   - Triggers
   - Views
   - RLS policies

**Rollback strategy**:
- Każda migracja powinna mieć plik `_rollback.sql`
- Testowanie na środowisku staging przed production

### 10.8. Nierozwiązane kwestie (Future considerations)

1. **Wygasanie linków zapraszających**: Czy dodać `expires_at TIMESTAMP`? Jaka długość życia?
2. **Soft delete dla innych encji**: Rozważyć dla `charges`/`payments`?
3. **Full-text search**: GIN index z `pg_trgm` dla wyszukiwania adresów/nazw?
4. **Notification tracking**: Tabela `notifications` dla post-MVP features?
5. **Performance baseline**: Akceptowalne response times? Slow query monitoring?

---

**Wersja schematu**: 1.0
**Data utworzenia**: 2025-01-12
**Ostatnia aktualizacja**: 2025-01-12
**Status**: Gotowy do implementacji migracji
