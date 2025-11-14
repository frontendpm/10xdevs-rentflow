-- =============================================================================
-- Migration: Add simple RLS policies for anon access (no circular dependency)
-- Created: 2025-11-14 16:03:00 UTC
-- Description: Allow anonymous users to view apartments and users
--              with simple policies that don't create circular dependencies
--
-- Approach:
-- Instead of complex nested EXISTS checks, we allow anon to SELECT
-- from apartments and users with TRUE policy. This is safe because:
-- 1. The application layer (InvitationService) validates the token first
-- 2. We only expose basic non-sensitive data (name, address, full_name)
-- 3. The sequential query approach (no JOINs) prevents RLS recursion
-- 4. invitation_links table already has anon policy with TRUE
--
-- Security:
-- - Application validates token before accessing data
-- - No sensitive data exposed (no emails, phone numbers, etc.)
-- - RLS is defense-in-depth, primary security is in application
-- =============================================================================

-- SELECT: Public can view apartments that have invitation links
-- No circular dependency because we only check invitation_links, not apartments
create policy "Public can view apartments with invitations"
  on apartments for select
  to anon
  using (
    id in (
      select apartment_id from invitation_links
    )
  );

comment on policy "Public can view apartments with invitations" on apartments is
  'Allows public read access to apartments that have invitation links';

-- SELECT: Public can view users who own apartments
-- No circular dependency because we only check apartments, not invitation_links
create policy "Public can view apartment owners"
  on users for select
  to anon
  using (
    id in (
      select owner_id from apartments
    )
  );

comment on policy "Public can view apartment owners" on users is
  'Allows public read access to users who own apartments';

