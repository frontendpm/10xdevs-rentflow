-- =============================================================================
-- Migration: Add RLS policy for tenant lease creation during invitation acceptance
-- Created: 2025-11-14 16:00:00 UTC
-- Description: Allow newly registered tenants to create their own lease
--              when accepting an invitation
--
-- Context:
-- When a tenant accepts an invitation via POST /api/invitations/:token/accept,
-- they need to INSERT a lease record with tenant_id = auth.uid().
-- The existing policy only allows owners to create leases.
--
-- Security:
-- - Tenant can only create a lease for themselves (tenant_id = auth.uid())
-- - Business constraints (one active lease per tenant/apartment) are enforced
--   by unique partial indexes on the leases table
-- =============================================================================

-- INSERT: Tenants can insert their own lease when accepting invitation
create policy "Tenants can insert their own lease"
  on leases for insert
  to authenticated
  with check (
    tenant_id = auth.uid()
  );

comment on policy "Tenants can insert their own lease" on leases is
  'Allows newly registered tenants to create their lease when accepting invitation';

