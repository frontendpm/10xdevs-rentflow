-- =============================================================================
-- URGENT FIX: Usuń błędne polityki RLS które powodują infinite recursion
-- =============================================================================
-- WYKONAJ TO NATYCHMIAST W SUPABASE STUDIO → SQL Editor
--
-- Problem: Polityki utworzone przez migrację 20251114160100 powodują
--          circular dependency i infinite recursion w RLS
--
-- Rozwiązanie: Usuń te polityki i dodaj poprawne
-- =============================================================================

-- KROK 1: Usuń błędne polityki (które powodują infinite recursion)
-- ============================================================================
DROP POLICY IF EXISTS "Public can view apartments for invitation validation" ON apartments;
DROP POLICY IF EXISTS "Public can view owner profiles for invitation validation" ON users;

-- KROK 2: Dodaj politykę dla tenantów (potrzebna do akceptacji zaproszeń)
-- ============================================================================
CREATE POLICY IF NOT EXISTS "Tenants can insert their own lease"
  ON leases FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = auth.uid());

-- KROK 3: Dodaj poprawne polityki dla anon (bez circular dependency)
-- ============================================================================

-- Apartments: tylko te które mają invitation links
CREATE POLICY IF NOT EXISTS "Public can view apartments with invitations"
  ON apartments FOR SELECT
  TO anon
  USING (
    id IN (
      SELECT apartment_id FROM invitation_links
    )
  );

-- Users: tylko owners mieszkań
CREATE POLICY IF NOT EXISTS "Public can view apartment owners"
  ON users FOR SELECT
  TO anon
  USING (
    id IN (
      SELECT owner_id FROM apartments
    )
  );

-- =============================================================================
-- WERYFIKACJA: Sprawdź czy polityki są poprawne
-- =============================================================================

-- Powinno pokazać TYLKO poprawne polityki (bez "for invitation validation")
SELECT 
    policyname,
    tablename,
    roles
FROM pg_policies 
WHERE tablename IN ('apartments', 'users', 'invitation_links', 'leases')
  AND roles @> ARRAY['anon']::name[]
ORDER BY tablename, policyname;

-- =============================================================================
-- Po wykonaniu: Zrestartuj dev server (npm run dev)
-- =============================================================================

