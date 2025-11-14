-- =============================================================================
-- Migration: Create RPC function for apartment creation
-- Created: 2025-11-14 15:00:00 UTC
-- Description: Adds RPC function to create apartments without RLS recursion
--
-- Purpose:
--   This function bypasses the infinite recursion issue that occurs when
--   INSERT with .select() triggers SELECT policies that reference other tables
--   with circular dependencies (apartments <-> leases).
--
-- Security:
--   - Function uses SECURITY DEFINER to bypass RLS
--   - Manually checks that owner_id = auth.uid() for authorization
--   - Only owners can create apartments for themselves
-- =============================================================================

-- Function to create apartment and return data without SELECT policy recursion
create or replace function create_apartment_rpc(
  p_name text,
  p_address text,
  p_owner_id uuid,
  p_created_by uuid
)
returns json
security definer
set search_path = public
language plpgsql
as $$
declare
  v_apartment apartments;
  v_user_id uuid;
begin
  -- Get current user ID
  v_user_id := auth.uid();
  
  -- Authorization check: user must be creating apartment for themselves
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  
  if p_owner_id != v_user_id then
    raise exception 'Can only create apartments for yourself';
  end if;
  
  -- Check if user is an owner
  if not exists (
    select 1 from users 
    where id = v_user_id and role = 'owner'
  ) then
    raise exception 'Only owners can create apartments';
  end if;
  
  -- Insert apartment
  insert into apartments (name, address, owner_id, created_by)
  values (p_name, p_address, p_owner_id, p_created_by)
  returning * into v_apartment;
  
  -- Return as JSON
  return row_to_json(v_apartment);
end;
$$;

comment on function create_apartment_rpc is 'Creates apartment bypassing RLS SELECT recursion. SECURITY DEFINER with manual auth checks.';

