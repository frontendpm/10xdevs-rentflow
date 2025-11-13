/**
 * DTO and Command Model Type Definitions
 *
 * This file contains all Data Transfer Object (DTO) and Command Model types
 * used in the Rentflow API. These types are derived from the database models
 * defined in src/db/database.types.ts and correspond to the API plan.
 *
 * Naming Conventions:
 * - DTOs: Types for API responses (e.g., UserProfileDTO, ApartmentDetailsDTO)
 * - Commands: Types for API requests (e.g., CreateApartmentCommand, UpdateChargeCommand)
 */

import type { Database, Tables, TablesInsert, TablesUpdate, Enums } from './db/database.types';

// =============================================================================
// HELPER TYPES - Reusable partial types for nested objects
// =============================================================================

/**
 * Partial user information for tenant/owner references
 */
export type UserInfo = Pick<Tables<'users'>, 'id' | 'full_name' | 'email'>;

/**
 * Tenant-specific user information
 */
export type TenantInfo = UserInfo;

/**
 * Owner-specific user information
 */
export type OwnerInfo = UserInfo;

/**
 * Financial summary metrics for apartments
 */
export type FinancialSummary = {
  total_unpaid: number;
  total_partially_paid: number;
  total_overdue: number;
  upcoming_charges_count: number;
};

/**
 * Simplified financial summary for dashboard
 */
export type SimplifiedFinancialSummary = Pick<FinancialSummary, 'total_unpaid' | 'total_overdue'>;

/**
 * Upcoming charge information for tenant dashboard
 */
export type UpcomingChargeInfo = Pick<
  Tables<'charges'>,
  'id' | 'amount' | 'due_date' | 'type'
>;

/**
 * Lease information for apartment listings
 */
export type LeaseInfo = Pick<Tables<'leases'>, 'id' | 'status' | 'start_date'> & {
  tenant: TenantInfo;
};

/**
 * Accepted by user information for invitation listings
 */
export type AcceptedByInfo = Pick<Tables<'users'>, 'id' | 'full_name'>;

// =============================================================================
// USER MANAGEMENT DTOs
// =============================================================================

/**
 * User profile DTO
 * @endpoint GET /api/users/me
 */
export type UserProfileDTO = Tables<'users'>;

/**
 * Update user profile command
 * @endpoint PATCH /api/users/me
 */
export type UpdateUserProfileCommand = {
  full_name: string;
};

// =============================================================================
// APARTMENT MANAGEMENT DTOs & Commands
// =============================================================================

/**
 * Apartment list item DTO (Owner view)
 * @endpoint GET /api/apartments
 */
export type ApartmentListItemOwnerDTO = Tables<'apartments'> & {
  lease?: LeaseInfo;
};

/**
 * Apartment list item DTO (Tenant view)
 * @endpoint GET /api/apartments
 */
export type ApartmentListItemTenantDTO = Pick<
  Tables<'apartments'>,
  'id' | 'name' | 'address'
> & {
  owner: OwnerInfo;
};

/**
 * Apartment list response DTO
 * @endpoint GET /api/apartments
 */
export type ApartmentListDTO = {
  apartments: (ApartmentListItemOwnerDTO | ApartmentListItemTenantDTO)[];
};

/**
 * Create apartment command
 * @endpoint POST /api/apartments
 */
export type CreateApartmentCommand = Pick<TablesInsert<'apartments'>, 'name' | 'address'>;

/**
 * Apartment details DTO
 * @endpoint GET /api/apartments/:id
 */
export type ApartmentDetailsDTO = Tables<'apartments'> & {
  lease?: LeaseInfo;
};

/**
 * Update apartment command
 * @endpoint PATCH /api/apartments/:id
 */
export type UpdateApartmentCommand = Partial<Pick<TablesUpdate<'apartments'>, 'name' | 'address'>>;

/**
 * Apartment summary DTO
 * @endpoint GET /api/apartments/:id/summary
 */
export type ApartmentSummaryDTO = {
  apartment: Pick<Tables<'apartments'>, 'id' | 'name' | 'address'>;
  lease?: {
    id: string;
    status: Enums<'lease_status'>;
    tenant: Pick<Tables<'users'>, 'full_name'>;
  };
  financial_summary: FinancialSummary;
};

// =============================================================================
// INVITATION MANAGEMENT DTOs & Commands
// =============================================================================

/**
 * Create invitation response DTO
 * @endpoint POST /api/apartments/:apartmentId/invitations
 */
export type CreateInvitationResponseDTO = Pick<
  Tables<'invitation_links'>,
  'id' | 'apartment_id' | 'token' | 'status' | 'created_at'
> & {
  invitation_url: string;
};

/**
 * Invitation list item DTO
 * @endpoint GET /api/apartments/:apartmentId/invitations
 */
export type InvitationListItemDTO = Pick<
  Tables<'invitation_links'>,
  'id' | 'token' | 'status' | 'created_at'
> & {
  accepted_by?: AcceptedByInfo;
};

/**
 * Invitation list response DTO
 * @endpoint GET /api/apartments/:apartmentId/invitations
 */
export type InvitationListDTO = {
  invitations: InvitationListItemDTO[];
};

/**
 * Validate invitation DTO
 * @endpoint GET /api/invitations/:token
 */
export type ValidateInvitationDTO = {
  valid: boolean;
  apartment: Pick<Tables<'apartments'>, 'name' | 'address'>;
  owner: Pick<Tables<'users'>, 'full_name'>;
};

/**
 * Accept invitation response DTO
 * @endpoint POST /api/invitations/:token/accept
 */
export type AcceptInvitationResponseDTO = {
  lease: Pick<
    Tables<'leases'>,
    'id' | 'apartment_id' | 'tenant_id' | 'status' | 'start_date' | 'created_at'
  >;
};

// =============================================================================
// LEASE MANAGEMENT DTOs & Commands
// =============================================================================

/**
 * Active lease DTO
 * @endpoint GET /api/apartments/:apartmentId/lease
 */
export type ActiveLeaseDTO = Tables<'leases'> & {
  tenant: TenantInfo;
};

/**
 * End lease command
 * @endpoint POST /api/apartments/:apartmentId/lease/end
 */
export type EndLeaseCommand = {
  notes?: string;
};

/**
 * Lease history item DTO
 * @endpoint GET /api/apartments/:apartmentId/leases
 */
export type LeaseHistoryItemDTO = Pick<
  Tables<'leases'>,
  'id' | 'status' | 'start_date' | 'archived_at'
> & {
  tenant: Pick<Tables<'users'>, 'full_name'>;
};

/**
 * Lease history response DTO
 * @endpoint GET /api/apartments/:apartmentId/leases
 */
export type LeaseHistoryDTO = {
  leases: LeaseHistoryItemDTO[];
};

// =============================================================================
// CHARGE MANAGEMENT DTOs & Commands
// =============================================================================

/**
 * Charge list item DTO (with payment status from view)
 * @endpoint GET /api/apartments/:apartmentId/charges
 */
export type ChargeListItemDTO = Omit<
  Tables<'charges_with_status'>,
  'created_by' | 'lease_id'
> & {
  attachment_url?: string;
};

/**
 * Charges grouped by month
 * @endpoint GET /api/apartments/:apartmentId/charges
 */
export type ChargesListDTO = {
  charges_by_month: Record<string, ChargeListItemDTO[]>;
};

/**
 * Create charge command
 * @endpoint POST /api/apartments/:apartmentId/charges
 */
export type CreateChargeCommand = Pick<
  TablesInsert<'charges'>,
  'amount' | 'due_date' | 'type'
> & {
  comment?: string;
};

/**
 * Charge details DTO (includes payments)
 * @endpoint GET /api/charges/:id
 */
export type ChargeDetailsDTO = ChargeListItemDTO & {
  payments: PaymentDTO[];
};

/**
 * Update charge command
 * @endpoint PATCH /api/charges/:id
 */
export type UpdateChargeCommand = Partial<
  Pick<TablesUpdate<'charges'>, 'amount' | 'due_date' | 'type' | 'comment'>
>;

/**
 * Upload charge attachment response DTO
 * @endpoint POST /api/charges/:id/attachment
 */
export type UploadChargeAttachmentResponseDTO = Pick<
  Tables<'charges'>,
  'id' | 'attachment_path'
> & {
  attachment_url: string;
};

// =============================================================================
// PAYMENT MANAGEMENT DTOs & Commands
// =============================================================================

/**
 * Payment DTO (base payment type)
 */
export type PaymentDTO = Tables<'payments'>;

/**
 * Payments list response DTO
 * @endpoint GET /api/charges/:chargeId/payments
 */
export type PaymentsListDTO = {
  payments: PaymentDTO[];
  total: number;
};

/**
 * Add payment command
 * @endpoint POST /api/charges/:chargeId/payments
 */
export type AddPaymentCommand = Pick<TablesInsert<'payments'>, 'amount' | 'payment_date'>;

/**
 * Update payment command
 * @endpoint PATCH /api/payments/:id
 */
export type UpdatePaymentCommand = Partial<
  Pick<TablesUpdate<'payments'>, 'amount' | 'payment_date'>
>;

// =============================================================================
// PROTOCOL MANAGEMENT DTOs & Commands
// =============================================================================

/**
 * Protocol photo DTO
 */
export type ProtocolPhotoDTO = Omit<Tables<'protocol_photos'>, 'created_by'> & {
  file_url: string;
};

/**
 * Protocol DTO
 * @endpoint GET /api/apartments/:apartmentId/protocols/:type
 */
export type ProtocolDTO = Omit<Tables<'protocols'>, 'created_by'> & {
  photos: ProtocolPhotoDTO[];
};

/**
 * Create or update protocol command
 * @endpoint PUT /api/apartments/:apartmentId/protocols/:type
 */
export type CreateUpdateProtocolCommand = {
  description: string;
};

/**
 * Upload protocol photo response DTO
 * @endpoint POST /api/apartments/:apartmentId/protocols/:type/photos
 */
export type UploadProtocolPhotoResponseDTO = ProtocolPhotoDTO;

// =============================================================================
// DASHBOARD DTOs
// =============================================================================

/**
 * Dashboard apartment item (for owner)
 */
export type DashboardApartmentItem = Pick<
  Tables<'apartments'>,
  'id' | 'name' | 'address'
> & {
  lease_status?: Enums<'lease_status'>;
  tenant?: Pick<Tables<'users'>, 'full_name'>;
  financial_summary: SimplifiedFinancialSummary;
};

/**
 * Dashboard statistics (for owner)
 */
export type DashboardStatistics = {
  total_apartments: number;
  active_leases: number;
  total_unpaid: number;
  total_overdue: number;
};

/**
 * Dashboard owner DTO
 * @endpoint GET /api/dashboard (for owner role)
 */
export type DashboardOwnerDTO = {
  role: 'owner';
  apartments: DashboardApartmentItem[];
  statistics: DashboardStatistics;
};

/**
 * Dashboard tenant financial summary
 */
export type DashboardTenantFinancialSummary = {
  total_due: number;
  total_overdue: number;
  upcoming_charges: UpcomingChargeInfo[];
};

/**
 * Dashboard tenant DTO
 * @endpoint GET /api/dashboard (for tenant role)
 */
export type DashboardTenantDTO = {
  role: 'tenant';
  apartment: Pick<Tables<'apartments'>, 'id' | 'name' | 'address'> & {
    owner: OwnerInfo;
  };
  financial_summary: DashboardTenantFinancialSummary;
};

/**
 * Dashboard DTO (union of owner and tenant variants)
 * @endpoint GET /api/dashboard
 */
export type DashboardDTO = DashboardOwnerDTO | DashboardTenantDTO;

// =============================================================================
// EXPORTED TYPE UTILITIES
// =============================================================================

/**
 * Type guard to check if dashboard DTO is for owner
 */
export function isDashboardOwnerDTO(dto: DashboardDTO): dto is DashboardOwnerDTO {
  return dto.role === 'owner';
}

/**
 * Type guard to check if dashboard DTO is for tenant
 */
export function isDashboardTenantDTO(dto: DashboardDTO): dto is DashboardTenantDTO {
  return dto.role === 'tenant';
}
