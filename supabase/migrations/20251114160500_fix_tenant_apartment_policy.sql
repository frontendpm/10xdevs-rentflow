-- =============================================================================
-- Migration: Fix tenant apartment viewing policy with SECURITY DEFINER
-- Created: 2025-11-14 16:05:00 UTC
-- Description: Recreate tenant apartment policy using SECURITY DEFINER
--              to prevent circular dependency
--
-- Problem: Direct EXISTS check creates circular dependency:
--   apartments → leases → apartments → 💥
--
-- Solution: Use SECURITY DEFINER function that bypasses RLS
-- =============================================================================

-- Function: Check if user is tenant of apartment (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_is_tenant_of_apartment(
  p_apartment_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM leases
    WHERE leases.apartment_id = p_apartment_id
      AND leases.tenant_id = p_user_id
      AND leases.status = 'active'
  );
$$;

COMMENT ON FUNCTION public.user_is_tenant_of_apartment(uuid, uuid) IS
  'Check if user is active tenant of apartment - bypasses RLS to prevent circular dependency';

-- Recreate tenant policy using SECURITY DEFINER function
DROP POLICY IF EXISTS "Tenants can view their apartment" ON apartments;

CREATE POLICY "Tenants can view their apartment"
  ON apartments FOR SELECT
  TO authenticated
  USING (
    public.user_is_tenant_of_apartment(id, auth.uid())
  );

COMMENT ON POLICY "Tenants can view their apartment" ON apartments IS
  'Allows tenants to view apartments they rent - uses SECURITY DEFINER to avoid circular dependency';

