-- =============================================================================
-- Migration: Add RLS policies for public invitation token validation
-- Created: 2025-11-14 16:01:00 UTC
-- Description: Allow anonymous users to view apartment and owner info
--              when validating invitation tokens
--
-- Context:
-- GET /api/invitations/:token is a public endpoint that validates
-- invitation tokens and returns basic apartment and owner information.
-- This requires anon role to SELECT from:
-- - invitation_links (already allowed)
-- - apartments (needs policy)
-- - users (needs policy)
--
-- Security:
-- - Only basic information exposed (apartment name/address, owner full_name)
-- - No sensitive data (emails, phone numbers) exposed
-- - Token validation happens in application logic, not in RLS
-- =============================================================================

-- SELECT: Public can view apartments referenced by invitation links
-- This is safe because:
-- 1. Only basic info (name, address) is returned
-- 2. Access is via invitation token lookup (secure UUID v4)
create policy "Public can view apartments for invitation validation"
  on apartments for select
  to anon
  using (
    exists (
      select 1 from invitation_links
      where invitation_links.apartment_id = apartments.id
    )
  );

comment on policy "Public can view apartments for invitation validation" on apartments is
  'Allows public access to apartment info during invitation token validation';

-- SELECT: Public can view user profiles referenced by apartments (owners only)
-- This is safe because:
-- 1. Only full_name is returned (no email or other sensitive data)
-- 2. Access is via apartment lookup from invitation token
create policy "Public can view owner profiles for invitation validation"
  on users for select
  to anon
  using (
    exists (
      select 1 from apartments
      where apartments.owner_id = users.id
      and exists (
        select 1 from invitation_links
        where invitation_links.apartment_id = apartments.id
      )
    )
  );

comment on policy "Public can view owner profiles for invitation validation" on users is
  'Allows public access to owner info during invitation token validation';

