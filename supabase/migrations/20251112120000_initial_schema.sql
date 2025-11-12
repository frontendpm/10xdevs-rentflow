-- =============================================================================
-- Migration: Initial Rentflow Database Schema
-- Created: 2025-11-12 12:00:00 UTC
-- Description: Complete database schema for Rentflow MVP application
--
-- Affected Tables:
--   - users (user profiles with roles)
--   - apartments (rental properties)
--   - leases (rental agreements - active and archived)
--   - invitation_links (one-time invitation tokens)
--   - charges (rent, bills, and other charges)
--   - payments (payment records for charges)
--   - protocols (move-in/move-out protocols)
--   - protocol_photos (photos attached to protocols)
--
-- Key Features:
--   - Row Level Security (RLS) enabled on all tables
--   - Granular RLS policies for owner/tenant access control
--   - Database triggers for audit trails and business rules
--   - Custom functions for validation and data integrity
--   - Views for computed data (charge payment status)
--
-- Important Notes:
--   - All SQL is lowercase for consistency
--   - One lease per apartment, one active lease per tenant
--   - Owners have full CRUD, tenants have read-only access
--   - Soft delete for leases (archived status)
--   - ON DELETE constraints prevent accidental data loss
-- =============================================================================

-- =============================================================================
-- SECTION 1: ENUM TYPES
-- =============================================================================

-- User roles: owner (landlord with full CRUD) and tenant (read-only)
create type user_role as enum ('owner', 'tenant');

-- Charge types: rent (monthly rent), bill (utilities), other (miscellaneous)
create type charge_type as enum ('rent', 'bill', 'other');

-- Lease status: active (current lease) or archived (ended lease for historical record)
create type lease_status as enum ('active', 'archived');

-- Protocol types: move_in (handover protocol) and move_out (return protocol)
create type protocol_type as enum ('move_in', 'move_out');

-- Invitation link status: pending (unused), accepted (used), expired (no longer valid)
create type invitation_status as enum ('pending', 'accepted', 'expired');

-- =============================================================================
-- SECTION 2: TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: users
-- Purpose: Extended user profile linked to auth.users, stores role and profile data
-- Access: Users can view/update own profile only
-- -----------------------------------------------------------------------------
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role user_role not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for efficient queries
create index idx_users_email on users(email);
create index idx_users_role on users(role);

-- Table and column comments for documentation
comment on table users is 'User profile - owners and tenants';
comment on column users.id is 'UUID from auth.users - user identity';
comment on column users.role is 'Role: owner (full CRUD) or tenant (read-only)';

-- -----------------------------------------------------------------------------
-- Table: apartments
-- Purpose: Rental properties owned by landlords
-- Access: Owners see their apartments, tenants see only their rented apartment
-- Constraints: Cannot delete apartment with existing leases (enforced by trigger)
-- -----------------------------------------------------------------------------
create table apartments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete restrict,
  name text not null,
  address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

-- Indexes for efficient queries
create index idx_apartments_owner_id on apartments(owner_id);

-- Table and column comments
comment on table apartments is 'Rental apartments managed by owners';
comment on column apartments.owner_id is 'Apartment owner - ON DELETE RESTRICT requires removing apartments first';
comment on column apartments.name is 'Apartment name (e.g. "Studio on Wola")';
comment on column apartments.address is 'Full apartment address';

-- -----------------------------------------------------------------------------
-- Table: leases
-- Purpose: Rental agreements (active or archived)
-- Business rules:
--   - One active lease per apartment (enforced by unique partial index)
--   - One active lease per tenant (enforced by unique partial index)
--   - Soft delete via status='archived' for historical record
--   - tenant_id is NULL until invitation is accepted
-- -----------------------------------------------------------------------------
create table leases (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments(id) on delete restrict,
  tenant_id uuid references users(id) on delete restrict,
  status lease_status not null default 'active',
  start_date date,
  archived_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

-- Indexes for efficient queries
create index idx_leases_apartment_id on leases(apartment_id);
create index idx_leases_tenant_id on leases(tenant_id);
create index idx_leases_status on leases(status);

-- Unique partial indexes enforce business constraints
-- Only one active lease per apartment at a time
create unique index idx_one_active_lease_per_apartment
  on leases(apartment_id) where status = 'active';

-- Only one active lease per tenant at a time (when tenant_id is not NULL)
create unique index idx_one_active_lease_per_tenant
  on leases(tenant_id) where status = 'active' and tenant_id is not null;

-- Table and column comments
comment on table leases is 'Lease - active or archived (soft delete)';
comment on column leases.status is 'active = current lease, archived = ended (for history)';
comment on column leases.tenant_id is 'NULL when invitation not yet accepted';
comment on column leases.start_date is 'Lease start date (optional)';
comment on column leases.archived_at is 'Timestamp when lease was ended';

-- -----------------------------------------------------------------------------
-- Table: invitation_links
-- Purpose: One-time invitation tokens for tenants
-- Business rules:
--   - Token is unique UUID v4 used in invitation URL
--   - Status changes from pending -> accepted when tenant signs up
--   - Can be marked as expired by owner
-- -----------------------------------------------------------------------------
create table invitation_links (
  id uuid primary key default gen_random_uuid(),
  apartment_id uuid not null references apartments(id) on delete cascade,
  token text not null unique,
  status invitation_status not null default 'pending',
  accepted_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

-- Indexes for efficient queries
create unique index idx_invitation_links_token on invitation_links(token);
create index idx_invitation_links_apartment_id on invitation_links(apartment_id);
create index idx_invitation_links_status on invitation_links(status);

-- Table and column comments
comment on table invitation_links is 'One-time invitation links for tenants';
comment on column invitation_links.token is 'UUID v4 token in invitation URL';
comment on column invitation_links.status is 'pending = unused, accepted = used, expired = no longer valid';
comment on column invitation_links.accepted_by is 'ID of tenant who accepted invitation';

-- -----------------------------------------------------------------------------
-- Table: charges
-- Purpose: Charges (rent, bills, other) assigned to leases
-- Business rules:
--   - Amount must be positive
--   - Cannot edit fully paid charge (enforced by trigger)
--   - Cannot reduce amount below total payments (enforced by trigger)
--   - Comment max 300 characters
-- -----------------------------------------------------------------------------
create table charges (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references leases(id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  due_date date not null,
  type charge_type not null,
  comment text check (length(comment) <= 300),
  attachment_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

-- Indexes for efficient queries
create index idx_charges_lease_id on charges(lease_id);
create index idx_charges_due_date on charges(due_date desc);
create index idx_charges_type on charges(type);
create index idx_charges_created_by on charges(created_by);

-- Table and column comments
comment on table charges is 'Charges (rent, bills) for leases';
comment on column charges.amount is 'Charge amount in PLN (NUMERIC for financial precision)';
comment on column charges.due_date is 'Payment due date';
comment on column charges.type is 'rent = monthly rent, bill = utility bill, other = miscellaneous';
comment on column charges.comment is 'Optional comment (max 300 characters)';
comment on column charges.attachment_path is 'File path in Supabase Storage (charge-attachments bucket)';

-- -----------------------------------------------------------------------------
-- Table: payments
-- Purpose: Payments made against charges
-- Business rules:
--   - Amount must be positive
--   - Total payments cannot exceed charge amount (enforced by trigger)
-- -----------------------------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references charges(id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  payment_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

-- Indexes for efficient queries
create index idx_payments_charge_id on payments(charge_id);
create index idx_payments_payment_date on payments(payment_date desc);
create index idx_payments_created_by on payments(created_by);

-- Table and column comments
comment on table payments is 'Payments made by tenants (recorded by owner)';
comment on column payments.amount is 'Payment amount in PLN';
comment on column payments.payment_date is 'Actual payment date (set by owner)';

-- -----------------------------------------------------------------------------
-- Table: protocols
-- Purpose: Move-in/move-out protocols (text-based)
-- Business rules:
--   - Max 2 protocols per lease: one move_in and one move_out
--   - Enforced by UNIQUE constraint on (lease_id, type)
-- -----------------------------------------------------------------------------
create table protocols (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references leases(id) on delete cascade,
  type protocol_type not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  unique (lease_id, type)
);

-- Indexes for efficient queries
create index idx_protocols_lease_id on protocols(lease_id);
create unique index idx_protocols_lease_type on protocols(lease_id, type);

-- Table and column comments
comment on table protocols is 'Move-in and move-out protocols';
comment on column protocols.type is 'move_in = handover protocol, move_out = return protocol';
comment on column protocols.description is 'Text content of protocol (notes, meter readings, defects)';
comment on constraint protocols_lease_id_type_key on protocols is 'Max 2 protocols per lease (move_in + move_out)';

-- -----------------------------------------------------------------------------
-- Table: protocol_photos
-- Purpose: Photos attached to protocols
-- Business rules:
--   - Max 10 photos per protocol (enforced by trigger)
-- -----------------------------------------------------------------------------
create table protocol_photos (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null references protocols(id) on delete cascade,
  file_path text not null,
  uploaded_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

-- Indexes for efficient queries
create index idx_protocol_photos_protocol_id on protocol_photos(protocol_id);
create index idx_protocol_photos_uploaded_at on protocol_photos(uploaded_at desc);

-- Table and column comments
comment on table protocol_photos is 'Photos documenting apartment condition in protocols';
comment on column protocol_photos.file_path is 'File path in Supabase Storage (protocol-photos bucket)';

-- =============================================================================
-- SECTION 3: DATABASE FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Function: update_updated_at_column
-- Purpose: Automatically update updated_at timestamp on row UPDATE
-- Usage: Attached to BEFORE UPDATE triggers on all tables
-- -----------------------------------------------------------------------------
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

comment on function update_updated_at_column() is 'Automatically updates updated_at on UPDATE';

-- -----------------------------------------------------------------------------
-- Function: handle_new_user
-- Purpose: Create user profile in public.users when new user signs up
-- Security: SECURITY DEFINER allows function to bypass RLS
-- Trigger: Fired AFTER INSERT on auth.users
-- -----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'owner')
  );
  return new;
end;
$$ language plpgsql;

comment on function handle_new_user() is 'Automatically creates profile in public.users after registration in auth.users';

-- -----------------------------------------------------------------------------
-- Function: check_charge_edit_constraints
-- Purpose: Enforce business rules when editing charges
-- Rules:
--   1. Cannot edit fully paid charge
--   2. Cannot reduce amount below total payments
-- Trigger: Fired BEFORE UPDATE on charges
-- -----------------------------------------------------------------------------
create or replace function check_charge_edit_constraints()
returns trigger as $$
declare
  total_payments numeric(10, 2);
begin
  -- Calculate total payments for this charge
  select coalesce(sum(amount), 0)
  into total_payments
  from payments
  where charge_id = new.id;

  -- Rule 1: Cannot edit fully paid charge
  if old.amount is not null and total_payments >= old.amount then
    raise exception 'Cannot edit a fully paid charge';
  end if;

  -- Rule 2: Cannot reduce amount below total payments
  if new.amount < total_payments then
    raise exception 'Charge amount cannot be less than total payments (%). Current total: %',
      new.amount, total_payments;
  end if;

  return new;
end;
$$ language plpgsql;

comment on function check_charge_edit_constraints() is 'Enforces business rules for charge editing';

-- -----------------------------------------------------------------------------
-- Function: check_payment_sum
-- Purpose: Ensure total payments do not exceed charge amount
-- Trigger: Fired BEFORE INSERT and UPDATE on payments
-- -----------------------------------------------------------------------------
create or replace function check_payment_sum()
returns trigger as $$
declare
  charge_amount numeric(10, 2);
  current_payments numeric(10, 2);
  new_total numeric(10, 2);
begin
  -- Get charge amount
  select amount into charge_amount
  from charges
  where id = new.charge_id;

  -- Calculate current payments (excluding this new/updated payment)
  select coalesce(sum(amount), 0)
  into current_payments
  from payments
  where charge_id = new.charge_id
    and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Calculate new total
  new_total := current_payments + new.amount;

  -- Check if total exceeds charge amount
  if new_total > charge_amount then
    raise exception 'Total payments (%) cannot exceed charge amount (%)',
      new_total, charge_amount;
  end if;

  return new;
end;
$$ language plpgsql;

comment on function check_payment_sum() is 'Ensures total payments do not exceed charge amount';

-- -----------------------------------------------------------------------------
-- Function: check_protocol_photos_limit
-- Purpose: Enforce max 10 photos per protocol
-- Trigger: Fired BEFORE INSERT on protocol_photos
-- -----------------------------------------------------------------------------
create or replace function check_protocol_photos_limit()
returns trigger as $$
declare
  photo_count integer;
begin
  -- Count existing photos for this protocol
  select count(*)
  into photo_count
  from protocol_photos
  where protocol_id = new.protocol_id;

  -- Check limit (10 photos)
  if photo_count >= 10 then
    raise exception 'Cannot add more than 10 photos per protocol';
  end if;

  return new;
end;
$$ language plpgsql;

comment on function check_protocol_photos_limit() is 'Enforces limit of 10 photos per protocol';

-- -----------------------------------------------------------------------------
-- Function: check_apartment_deletion
-- Purpose: Prevent deletion of apartment with existing leases
-- Trigger: Fired BEFORE DELETE on apartments
-- Rationale: Preserve historical data, prevent accidental data loss
-- -----------------------------------------------------------------------------
create or replace function check_apartment_deletion()
returns trigger as $$
declare
  lease_count integer;
begin
  -- Count all leases (active and archived) for this apartment
  select count(*)
  into lease_count
  from leases
  where apartment_id = old.id;

  -- Block deletion if any leases exist
  if lease_count > 0 then
    raise exception 'Cannot delete apartment with existing leases (active or archived). Please remove all leases first.';
  end if;

  return old;
end;
$$ language plpgsql;

comment on function check_apartment_deletion() is 'Blocks deletion of apartment with leases';

-- =============================================================================
-- SECTION 4: TRIGGERS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Audit triggers: Automatically update updated_at on row UPDATE
-- Applied to all tables with updated_at column
-- -----------------------------------------------------------------------------

create trigger set_users_updated_at
  before update on users
  for each row
  execute function update_updated_at_column();

create trigger set_apartments_updated_at
  before update on apartments
  for each row
  execute function update_updated_at_column();

create trigger set_leases_updated_at
  before update on leases
  for each row
  execute function update_updated_at_column();

create trigger set_invitation_links_updated_at
  before update on invitation_links
  for each row
  execute function update_updated_at_column();

create trigger set_charges_updated_at
  before update on charges
  for each row
  execute function update_updated_at_column();

create trigger set_payments_updated_at
  before update on payments
  for each row
  execute function update_updated_at_column();

create trigger set_protocols_updated_at
  before update on protocols
  for each row
  execute function update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Supabase Auth integration trigger
-- Purpose: Automatically create user profile when user signs up
-- -----------------------------------------------------------------------------

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();

-- Note: Cannot add comment to trigger on auth.users table (insufficient privileges)

-- -----------------------------------------------------------------------------
-- Business logic triggers: Validation and data integrity
-- -----------------------------------------------------------------------------

-- Validate charge editing constraints
create trigger validate_charge_edit
  before update on charges
  for each row
  execute function check_charge_edit_constraints();

-- Validate payment sum on insert
create trigger validate_payment_sum_insert
  before insert on payments
  for each row
  execute function check_payment_sum();

-- Validate payment sum on update
create trigger validate_payment_sum_update
  before update on payments
  for each row
  execute function check_payment_sum();

-- Enforce protocol photos limit
create trigger validate_protocol_photos_limit
  before insert on protocol_photos
  for each row
  execute function check_protocol_photos_limit();

-- Prevent apartment deletion with leases
create trigger prevent_apartment_deletion_with_leases
  before delete on apartments
  for each row
  execute function check_apartment_deletion();

-- =============================================================================
-- SECTION 5: DATABASE VIEWS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- View: charges_with_status
-- Purpose: Calculate dynamic payment status for charges
-- Columns:
--   - All charge columns
--   - total_paid: Sum of payments
--   - remaining_amount: Amount still due
--   - payment_status: unpaid | partially_paid | paid
--   - is_overdue: TRUE if past due date and not fully paid
-- -----------------------------------------------------------------------------
create or replace view charges_with_status as
select
  c.id,
  c.lease_id,
  c.amount,
  c.due_date,
  c.type,
  c.comment,
  c.attachment_path,
  c.created_at,
  c.updated_at,
  c.created_by,
  coalesce(sum(p.amount), 0) as total_paid,
  c.amount - coalesce(sum(p.amount), 0) as remaining_amount,
  case
    when coalesce(sum(p.amount), 0) = 0 then 'unpaid'
    when coalesce(sum(p.amount), 0) < c.amount then 'partially_paid'
    when coalesce(sum(p.amount), 0) >= c.amount then 'paid'
  end as payment_status,
  case
    when c.due_date < current_date
      and coalesce(sum(p.amount), 0) < c.amount
    then true
    else false
  end as is_overdue
from charges c
left join payments p on p.charge_id = c.id
group by c.id;

comment on view charges_with_status is 'Charges with dynamically calculated payment status and is_overdue flag';
comment on column charges_with_status.total_paid is 'Sum of payments for this charge';
comment on column charges_with_status.remaining_amount is 'Remaining amount to be paid';
comment on column charges_with_status.payment_status is 'unpaid | partially_paid | paid';
comment on column charges_with_status.is_overdue is 'TRUE if past due date and not fully paid';

-- =============================================================================
-- SECTION 6: ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
alter table users enable row level security;
alter table apartments enable row level security;
alter table leases enable row level security;
alter table invitation_links enable row level security;
alter table charges enable row level security;
alter table payments enable row level security;
alter table protocols enable row level security;
alter table protocol_photos enable row level security;

-- -----------------------------------------------------------------------------
-- RLS Policies: users
-- Purpose: Users can only view and update their own profile
-- System: Handles INSERT (via trigger) and DELETE
-- -----------------------------------------------------------------------------

-- SELECT: Users can view their own profile
create policy "Users can view own profile"
  on users for select
  to authenticated
  using (id = auth.uid());

-- UPDATE: Users can update their own profile
create policy "Users can update own profile"
  on users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Note: INSERT handled by trigger, DELETE handled by system

-- -----------------------------------------------------------------------------
-- RLS Policies: apartments
-- Purpose:
--   - Owners can CRUD their own apartments
--   - Tenants can view only their rented apartment (active lease)
-- -----------------------------------------------------------------------------

-- SELECT: Owners can view their apartments
create policy "Owners can view their apartments"
  on apartments for select
  to authenticated
  using (owner_id = auth.uid());

-- SELECT: Tenants can view their apartment (via active lease)
create policy "Tenants can view their apartment"
  on apartments for select
  to authenticated
  using (
    exists (
      select 1 from leases
      where leases.apartment_id = apartments.id
        and leases.tenant_id = auth.uid()
        and leases.status = 'active'
    )
  );

-- INSERT: Owners can insert their apartments
create policy "Owners can insert their apartments"
  on apartments for insert
  to authenticated
  with check (owner_id = auth.uid());

-- UPDATE: Owners can update their apartments
create policy "Owners can update their apartments"
  on apartments for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- DELETE: Owners can delete their apartments (blocked by trigger if leases exist)
create policy "Owners can delete their apartments"
  on apartments for delete
  to authenticated
  using (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- RLS Policies: leases
-- Purpose:
--   - Owners can CRUD leases for their apartments (active and archived)
--   - Tenants can view only their active lease
-- -----------------------------------------------------------------------------

-- SELECT: Owners can view leases for their apartments
create policy "Owners can view leases for their apartments"
  on leases for select
  to authenticated
  using (
    exists (
      select 1 from apartments
      where apartments.id = leases.apartment_id
        and apartments.owner_id = auth.uid()
    )
  );

-- SELECT: Tenants can view their active lease
create policy "Tenants can view their active lease"
  on leases for select
  to authenticated
  using (
    tenant_id = auth.uid()
    and status = 'active'
  );

-- INSERT: Owners can insert leases for their apartments
create policy "Owners can insert leases for their apartments"
  on leases for insert
  to authenticated
  with check (
    exists (
      select 1 from apartments
      where apartments.id = leases.apartment_id
        and apartments.owner_id = auth.uid()
    )
  );

-- UPDATE: Owners can update leases for their apartments
create policy "Owners can update leases for their apartments"
  on leases for update
  to authenticated
  using (
    exists (
      select 1 from apartments
      where apartments.id = leases.apartment_id
        and apartments.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from apartments
      where apartments.id = leases.apartment_id
        and apartments.owner_id = auth.uid()
    )
  );

-- DELETE: Owners can delete leases for their apartments
create policy "Owners can delete leases for their apartments"
  on leases for delete
  to authenticated
  using (
    exists (
      select 1 from apartments
      where apartments.id = leases.apartment_id
        and apartments.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RLS Policies: invitation_links
-- Purpose:
--   - Owners can CRUD invitation links for their apartments
--   - Public (anon) can view by token (for invitation validation during signup)
--   - System can update status to 'accepted' during tenant signup
-- -----------------------------------------------------------------------------

-- SELECT: Owners can view invitation links for their apartments
create policy "Owners can view invitation links for their apartments"
  on invitation_links for select
  to authenticated
  using (
    exists (
      select 1 from apartments
      where apartments.id = invitation_links.apartment_id
        and apartments.owner_id = auth.uid()
    )
  );

-- SELECT: Public access for token validation during signup
create policy "Anyone can view invitation link by token"
  on invitation_links for select
  to anon
  using (true);

-- INSERT: Owners can insert invitation links for their apartments
create policy "Owners can insert invitation links for their apartments"
  on invitation_links for insert
  to authenticated
  with check (
    exists (
      select 1 from apartments
      where apartments.id = invitation_links.apartment_id
        and apartments.owner_id = auth.uid()
    )
  );

-- UPDATE: Owners can update invitation links for their apartments
create policy "Owners can update invitation links for their apartments"
  on invitation_links for update
  to authenticated
  using (
    exists (
      select 1 from apartments
      where apartments.id = invitation_links.apartment_id
        and apartments.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from apartments
      where apartments.id = invitation_links.apartment_id
        and apartments.owner_id = auth.uid()
    )
  );

-- UPDATE: System can update invitation link status during tenant signup
create policy "System can update invitation link status"
  on invitation_links for update
  to anon
  using (true)
  with check (true);

-- DELETE: Owners can delete invitation links for their apartments
create policy "Owners can delete invitation links for their apartments"
  on invitation_links for delete
  to authenticated
  using (
    exists (
      select 1 from apartments
      where apartments.id = invitation_links.apartment_id
        and apartments.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RLS Policies: charges
-- Purpose:
--   - Owners can CRUD charges for their apartments
--   - Tenants can view charges for their active lease (read-only)
-- -----------------------------------------------------------------------------

-- SELECT: Owners can view charges for their apartments
create policy "Owners can view charges for their apartments"
  on charges for select
  to authenticated
  using (
    exists (
      select 1 from leases
      join apartments on apartments.id = leases.apartment_id
      where leases.id = charges.lease_id
        and apartments.owner_id = auth.uid()
    )
  );

-- SELECT: Tenants can view charges for their active lease
create policy "Tenants can view charges for their active lease"
  on charges for select
  to authenticated
  using (
    exists (
      select 1 from leases
      where leases.id = charges.lease_id
        and leases.tenant_id = auth.uid()
        and leases.status = 'active'
    )
  );

-- INSERT: Owners can insert charges for their apartments
create policy "Owners can insert charges for their apartments"
  on charges for insert
  to authenticated
  with check (
    exists (
      select 1 from leases
      join apartments on apartments.id = leases.apartment_id
      where leases.id = charges.lease_id
        and apartments.owner_id = auth.uid()
    )
  );

-- UPDATE: Owners can update charges for their apartments
create policy "Owners can update charges for their apartments"
  on charges for update
  to authenticated
  using (
    exists (
      select 1 from leases
      join apartments on apartments.id = leases.apartment_id
      where leases.id = charges.lease_id
        and apartments.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from leases
      join apartments on apartments.id = leases.apartment_id
      where leases.id = charges.lease_id
        and apartments.owner_id = auth.uid()
    )
  );

-- DELETE: Owners can delete charges for their apartments
create policy "Owners can delete charges for their apartments"
  on charges for delete
  to authenticated
  using (
    exists (
      select 1 from leases
      join apartments on apartments.id = leases.apartment_id
      where leases.id = charges.lease_id
        and apartments.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RLS Policies: payments
-- Purpose:
--   - Owners can CRUD payments for their apartments
--   - Tenants can view payments for their active lease (read-only)
-- -----------------------------------------------------------------------------

-- SELECT: Owners can view payments for their apartments
create policy "Owners can view payments for their apartments"
  on payments for select
  to authenticated
  using (
    exists (
      select 1 from charges
      join leases on leases.id = charges.lease_id
      join apartments on apartments.id = leases.apartment_id
      where charges.id = payments.charge_id
        and apartments.owner_id = auth.uid()
    )
  );

-- SELECT: Tenants can view payments for their active lease
create policy "Tenants can view payments for their active lease"
  on payments for select
  to authenticated
  using (
    exists (
      select 1 from charges
      join leases on leases.id = charges.lease_id
      where charges.id = payments.charge_id
        and leases.tenant_id = auth.uid()
        and leases.status = 'active'
    )
  );

-- INSERT: Owners can insert payments for their apartments
create policy "Owners can insert payments for their apartments"
  on payments for insert
  to authenticated
  with check (
    exists (
      select 1 from charges
      join leases on leases.id = charges.lease_id
      join apartments on apartments.id = leases.apartment_id
      where charges.id = payments.charge_id
        and apartments.owner_id = auth.uid()
    )
  );

-- UPDATE: Owners can update payments for their apartments
create policy "Owners can update payments for their apartments"
  on payments for update
  to authenticated
  using (
    exists (
      select 1 from charges
      join leases on leases.id = charges.lease_id
      join apartments on apartments.id = leases.apartment_id
      where charges.id = payments.charge_id
        and apartments.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from charges
      join leases on leases.id = charges.lease_id
      join apartments on apartments.id = leases.apartment_id
      where charges.id = payments.charge_id
        and apartments.owner_id = auth.uid()
    )
  );

-- DELETE: Owners can delete payments for their apartments
create policy "Owners can delete payments for their apartments"
  on payments for delete
  to authenticated
  using (
    exists (
      select 1 from charges
      join leases on leases.id = charges.lease_id
      join apartments on apartments.id = leases.apartment_id
      where charges.id = payments.charge_id
        and apartments.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RLS Policies: protocols
-- Purpose:
--   - Owners can CRUD protocols for their apartments
--   - Tenants can view protocols for their active lease (read-only)
-- -----------------------------------------------------------------------------

-- SELECT: Owners can view protocols for their apartments
create policy "Owners can view protocols for their apartments"
  on protocols for select
  to authenticated
  using (
    exists (
      select 1 from leases
      join apartments on apartments.id = leases.apartment_id
      where leases.id = protocols.lease_id
        and apartments.owner_id = auth.uid()
    )
  );

-- SELECT: Tenants can view protocols for their active lease
create policy "Tenants can view protocols for their active lease"
  on protocols for select
  to authenticated
  using (
    exists (
      select 1 from leases
      where leases.id = protocols.lease_id
        and leases.tenant_id = auth.uid()
        and leases.status = 'active'
    )
  );

-- INSERT: Owners can insert protocols for their apartments
create policy "Owners can insert protocols for their apartments"
  on protocols for insert
  to authenticated
  with check (
    exists (
      select 1 from leases
      join apartments on apartments.id = leases.apartment_id
      where leases.id = protocols.lease_id
        and apartments.owner_id = auth.uid()
    )
  );

-- UPDATE: Owners can update protocols for their apartments
create policy "Owners can update protocols for their apartments"
  on protocols for update
  to authenticated
  using (
    exists (
      select 1 from leases
      join apartments on apartments.id = leases.apartment_id
      where leases.id = protocols.lease_id
        and apartments.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from leases
      join apartments on apartments.id = leases.apartment_id
      where leases.id = protocols.lease_id
        and apartments.owner_id = auth.uid()
    )
  );

-- DELETE: Owners can delete protocols for their apartments
create policy "Owners can delete protocols for their apartments"
  on protocols for delete
  to authenticated
  using (
    exists (
      select 1 from leases
      join apartments on apartments.id = leases.apartment_id
      where leases.id = protocols.lease_id
        and apartments.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- RLS Policies: protocol_photos
-- Purpose:
--   - Owners can CRUD protocol photos for their apartments
--   - Tenants can view protocol photos for their active lease (read-only)
--   - Photo limit (max 10) enforced by trigger
-- -----------------------------------------------------------------------------

-- SELECT: Owners can view protocol photos for their apartments
create policy "Owners can view protocol photos for their apartments"
  on protocol_photos for select
  to authenticated
  using (
    exists (
      select 1 from protocols
      join leases on leases.id = protocols.lease_id
      join apartments on apartments.id = leases.apartment_id
      where protocols.id = protocol_photos.protocol_id
        and apartments.owner_id = auth.uid()
    )
  );

-- SELECT: Tenants can view protocol photos for their active lease
create policy "Tenants can view protocol photos for their active lease"
  on protocol_photos for select
  to authenticated
  using (
    exists (
      select 1 from protocols
      join leases on leases.id = protocols.lease_id
      where protocols.id = protocol_photos.protocol_id
        and leases.tenant_id = auth.uid()
        and leases.status = 'active'
    )
  );

-- INSERT: Owners can insert protocol photos for their apartments (max 10 enforced by trigger)
create policy "Owners can insert protocol photos for their apartments"
  on protocol_photos for insert
  to authenticated
  with check (
    exists (
      select 1 from protocols
      join leases on leases.id = protocols.lease_id
      join apartments on apartments.id = leases.apartment_id
      where protocols.id = protocol_photos.protocol_id
        and apartments.owner_id = auth.uid()
    )
  );

-- UPDATE: Owners can update protocol photos for their apartments
create policy "Owners can update protocol photos for their apartments"
  on protocol_photos for update
  to authenticated
  using (
    exists (
      select 1 from protocols
      join leases on leases.id = protocols.lease_id
      join apartments on apartments.id = leases.apartment_id
      where protocols.id = protocol_photos.protocol_id
        and apartments.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from protocols
      join leases on leases.id = protocols.lease_id
      join apartments on apartments.id = leases.apartment_id
      where protocols.id = protocol_photos.protocol_id
        and apartments.owner_id = auth.uid()
    )
  );

-- DELETE: Owners can delete protocol photos for their apartments
create policy "Owners can delete protocol photos for their apartments"
  on protocol_photos for delete
  to authenticated
  using (
    exists (
      select 1 from protocols
      join leases on leases.id = protocols.lease_id
      join apartments on apartments.id = leases.apartment_id
      where protocols.id = protocol_photos.protocol_id
        and apartments.owner_id = auth.uid()
    )
  );

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
