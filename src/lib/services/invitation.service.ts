import type { SupabaseClient } from '@/db/supabase.client';
import type {
  CreateInvitationResponseDTO,
  InvitationListDTO,
  InvitationListItemDTO,
  ValidateInvitationDTO,
  AcceptInvitationResponseDTO,
} from '@/types';

export class InvitationService {
  constructor(private readonly supabase: SupabaseClient) {}

  async createInvitation(
    apartmentId: string,
    userId: string
  ): Promise<CreateInvitationResponseDTO> {
    console.log('[InvitationService.createInvitation] Start:', {
      apartmentId,
      userId,
      timestamp: new Date().toISOString(),
    });

    const { data: apartment, error: apartmentError } = await this.supabase
      .from('apartments')
      .select('id')
      .eq('id', apartmentId)
      .eq('owner_id', userId)
      .single();

    if (apartmentError || !apartment) {
      console.error('[InvitationService.createInvitation] Apartment not found:', {
        apartmentId,
        userId,
        error: apartmentError ? {
          code: apartmentError.code,
          message: apartmentError.message,
          details: apartmentError.details,
        } : 'No apartment data',
        timestamp: new Date().toISOString(),
      });
      throw new Error('NOT_FOUND');
    }

    console.log('[InvitationService.createInvitation] Apartment found:', {
      apartmentId,
      userId,
      timestamp: new Date().toISOString(),
    });

    const hasLease = await this.hasActiveLease(apartmentId);
    if (hasLease) {
      throw new Error('ACTIVE_LEASE');
    }

    await this.expirePreviousInvitations(apartmentId);

    const token = crypto.randomUUID();

    const { data: invitation, error: insertError } = await this.supabase
      .from('invitation_links')
      .insert({
        apartment_id: apartmentId,
        token,
        status: 'pending',
        created_by: userId,
      })
      .select()
      .single();

    if (insertError || !invitation) {
      console.error('[InvitationService.createInvitation] Insert error:', {
        insertError,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`Failed to create invitation: ${insertError?.message}`);
    }

    const appUrl = import.meta.env.PUBLIC_APP_URL;
    if (!appUrl) {
      console.error('[InvitationService.createInvitation] PUBLIC_APP_URL not configured');
      throw new Error('PUBLIC_APP_URL is not configured. Please set it in environment variables.');
    }

    const invitationUrl = `${appUrl}/register/tenant?token=${token}`;

    return {
      id: invitation.id,
      apartment_id: invitation.apartment_id,
      token: invitation.token,
      status: invitation.status,
      created_at: invitation.created_at,
      invitation_url: invitationUrl,
    };
  }

  async hasActiveLease(apartmentId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('leases')
      .select('id')
      .eq('apartment_id', apartmentId)
      .eq('status', 'active')
      .limit(1);

    return !error && data && data.length > 0;
  }

  async expirePreviousInvitations(apartmentId: string): Promise<void> {
    await this.supabase
      .from('invitation_links')
      .update({ status: 'expired' })
      .eq('apartment_id', apartmentId)
      .eq('status', 'pending');
  }

  async getInvitationsForApartment(
    apartmentId: string,
    userId: string
  ): Promise<InvitationListDTO> {
    const { data: apartment, error: apartmentError } = await this.supabase
      .from('apartments')
      .select('id')
      .eq('id', apartmentId)
      .eq('owner_id', userId)
      .single();

    if (apartmentError || !apartment) {
      throw new Error('NOT_FOUND');
    }

    const { data: invitations, error: invitationsError } = await this.supabase
      .from('invitation_links')
      .select(
        `
        id,
        token,
        status,
        created_at,
        accepted_by,
        users!invitation_links_accepted_by_fkey (
          id,
          full_name
        )
      `
      )
      .eq('apartment_id', apartmentId)
      .order('created_at', { ascending: false });

    if (invitationsError) {
      throw invitationsError;
    }

    const invitationList: InvitationListItemDTO[] = (invitations || []).map(
      (inv: any) => {
        const item: InvitationListItemDTO = {
          id: inv.id,
          token: inv.token,
          status: inv.status,
          created_at: inv.created_at,
        };

        if (inv.users) {
          item.accepted_by = {
            id: inv.users.id,
            full_name: inv.users.full_name,
          };
        }

        return item;
      }
    );

    return { invitations: invitationList };
  }

  async validateInvitationToken(token: string): Promise<ValidateInvitationDTO> {
    const { data: invitation, error: invError } = await this.supabase
      .from('invitation_links')
      .select('id, status, apartment_id')
      .eq('token', token)
      .single();

    if (invError || !invitation || invitation.status !== 'pending') {
      throw new Error('INVALID_TOKEN');
    }

    const { data: apartment, error: aptError } = await this.supabase
      .from('apartments')
      .select('name, address, owner_id')
      .eq('id', invitation.apartment_id)
      .single();

    if (aptError || !apartment) {
      throw new Error('INVALID_TOKEN');
    }

    const { data: owner, error: ownerError } = await this.supabase
      .from('users')
      .select('full_name')
      .eq('id', apartment.owner_id)
      .single();

    if (ownerError || !owner) {
      throw new Error('INVALID_TOKEN');
    }

    return {
      valid: true,
      apartment: {
        name: apartment.name,
        address: apartment.address,
      },
      owner: {
        full_name: owner.full_name,
      },
    };
  }

  async acceptInvitation(
    token: string,
    userId: string
  ): Promise<AcceptInvitationResponseDTO> {
    const { data: invitation, error: invError } = await this.supabase
      .from('invitation_links')
      .select('id, apartment_id, status')
      .eq('token', token)
      .single();

    if (invError || !invitation || invitation.status !== 'pending') {
      throw new Error('INVALID_TOKEN');
    }

    const hasLease = await this.userHasActiveLease(userId);
    if (hasLease) {
      throw new Error('USER_HAS_LEASE');
    }

    const { data: lease, error: leaseError } = await this.supabase
      .from('leases')
      .insert({
        apartment_id: invitation.apartment_id,
        tenant_id: userId,
        status: 'active',
        start_date: new Date().toISOString().split('T')[0],
        created_by: userId,
      })
      .select()
      .single();

    if (leaseError) {
      if (leaseError.code === '23505') {
        throw new Error('APARTMENT_HAS_LEASE');
      }
      throw leaseError;
    }

    const { error: updateError } = await this.supabase
      .from('invitation_links')
      .update({
        status: 'accepted',
        accepted_by: userId,
      })
      .eq('id', invitation.id);

    if (updateError) {
      console.error('Failed to update invitation status:', updateError);
    }

    return {
      lease: {
        id: lease.id,
        apartment_id: lease.apartment_id,
        tenant_id: lease.tenant_id,
        status: lease.status,
        start_date: lease.start_date,
        created_at: lease.created_at,
      },
    };
  }

  async userHasActiveLease(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('leases')
      .select('id')
      .eq('tenant_id', userId)
      .eq('status', 'active')
      .limit(1);

    return !error && data && data.length > 0;
  }
}

