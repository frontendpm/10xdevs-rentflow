-- =============================================================================
-- EMERGENCY FIX: Remove circular dependency between apartments and leases
-- =============================================================================
-- WYKONAJ TO NATYCHMIAST W SUPABASE STUDIO!
--
-- Problem: Polityka "Tenants can view their apartment" tworzy circular dependency:
--   apartments policy → checks leases → leases policy → checks apartments → 💥
--
-- Tymczasowe rozwiązanie: Wyłącz politykę dla tenantów
-- (Tenanci i tak nie mogą się zalogować w MVP, więc to bezpieczne)
-- =============================================================================

-- Wyłącz problematyczną politykę
DROP POLICY IF EXISTS "Tenants can view their apartment" ON apartments;

-- =============================================================================
-- Po wykonaniu: Zrestartuj dev server
-- =============================================================================

-- Weryfikacja: Sprawdź pozostałe polityki
SELECT 
    policyname,
    roles,
    cmd
FROM pg_policies 
WHERE tablename = 'apartments'
ORDER BY policyname;

