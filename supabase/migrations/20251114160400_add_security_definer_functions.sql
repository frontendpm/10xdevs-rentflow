-- =============================================================================
-- Migration: Add SECURITY DEFINER functions to bypass RLS for anon policies
-- Created: 2025-11-14 16:04:00 UTC
-- Description: Create functions that bypass RLS to prevent circular dependencies
--              in anon policies
--
-- Problem: Direct subqueries in RLS policies create circular dependencies:
--   users policy checks apartments → apartments policy checks leases → 
--   leases policy checks apartments → 💥 infinite recursion
--
-- Solution: Use SECURITY DEFINER functions that bypass RLS for lookups
-- =============================================================================

-- Function: Check if apartment has invitation links (bypasses RLS)
CREATE OR REPLACE FUNCTION public.apartment_has_invitations(apartment_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM invitation_links 
    WHERE invitation_links.apartment_id = $1
  );
$$;

COMMENT ON FUNCTION public.apartment_has_invitations(uuid) IS
  'Check if apartment has invitation links - bypasses RLS to prevent circular dependency';

-- Function: Check if user is apartment owner (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_is_apartment_owner(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM apartments 
    WHERE apartments.owner_id = $1
  );
$$;

COMMENT ON FUNCTION public.user_is_apartment_owner(uuid) IS
  'Check if user is apartment owner - bypasses RLS to prevent circular dependency';

-- Now recreate the anon policies using SECURITY DEFINER functions
-- First drop old policies
DROP POLICY IF EXISTS "Public can view apartments with invitations" ON apartments;
DROP POLICY IF EXISTS "Public can view apartment owners" ON users;

-- Recreate with SECURITY DEFINER functions
CREATE POLICY "Public can view apartments with invitations"
  ON apartments FOR SELECT
  TO anon
  USING (public.apartment_has_invitations(id));

COMMENT ON POLICY "Public can view apartments with invitations" ON apartments IS
  'Allows anon to view apartments that have invitations - uses SECURITY DEFINER to bypass RLS';

CREATE POLICY "Public can view apartment owners"
  ON users FOR SELECT
  TO anon
  USING (public.user_is_apartment_owner(id));

COMMENT ON POLICY "Public can view apartment owners" ON users IS
  'Allows anon to view apartment owners - uses SECURITY DEFINER to bypass RLS';

