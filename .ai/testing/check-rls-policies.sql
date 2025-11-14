-- =============================================================================
-- Check RLS Policies - Diagnostic Query
-- =============================================================================
-- Ten skrypt pokazuje wszystkie aktywne polityki RLS dla kluczowych tabel
-- Użyj: Skopiuj do Supabase Studio → SQL Editor → Execute

-- 1. Sprawdź polityki dla apartments
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_clause,
    with_check
FROM pg_policies 
WHERE tablename = 'apartments'
ORDER BY policyname;

-- 2. Sprawdź polityki dla invitation_links
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_clause,
    with_check
FROM pg_policies 
WHERE tablename = 'invitation_links'
ORDER BY policyname;

-- 3. Sprawdź polityki dla users
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_clause,
    with_check
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;

-- 4. Sprawdź polityki dla leases
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_clause,
    with_check
FROM pg_policies 
WHERE tablename = 'leases'
ORDER BY policyname;

-- =============================================================================
-- Szukaj problematycznych polityk (te które powodują infinite recursion)
-- =============================================================================

-- Jeśli zobaczysz polityki z tymi nazwami - usuń je!
-- - "Public can view apartments for invitation validation"
-- - "Public can view owner profiles for invitation validation"

