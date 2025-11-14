-- =============================================================================
-- Migration: Fix infinite recursion in RLS policies
-- Created: 2025-11-14 16:02:00 UTC
-- Description: Remove circular dependency in RLS policies that caused
--              infinite recursion error
--
-- Problem:
-- The policy "Public can view apartments for invitation validation" creates
-- a circular dependency:
-- - apartments policy checks invitation_links
-- - invitation_links policy checks apartments
-- This causes: "infinite recursion detected in policy for relation apartments"
--
-- Solution:
-- Drop the problematic policies. The GET /api/invitations/:token endpoint
-- will fetch data sequentially without JOINs to avoid RLS recursion.
-- =============================================================================

-- Drop the problematic policies
drop policy if exists "Public can view apartments for invitation validation" on apartments;
drop policy if exists "Public can view owner profiles for invitation validation" on users;

