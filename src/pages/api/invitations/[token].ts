import type { APIContext } from 'astro';
import { z } from 'zod';
import { ValidateInvitationParamsSchema } from '@/lib/validation/invitations.validation';
import { InvitationService } from '@/lib/services/invitation.service';
import { createServiceRoleClient } from '@/db/supabase.client';

export const prerender = false;

export async function GET(context: APIContext) {
  try {
    const params = ValidateInvitationParamsSchema.parse(context.params);

    // Use service role client for public endpoint to bypass RLS
    const supabase = createServiceRoleClient();
    const invitationService = new InvitationService(supabase);
    const validation = await invitationService.validateInvitationToken(
      params.token
    );

    return new Response(JSON.stringify(validation), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Token jest wymagany',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (error instanceof Error && error.message === 'INVALID_TOKEN') {
      return new Response(
        JSON.stringify({
          error: 'Invalid Token',
          message: 'Ten link zapraszający wygasł lub został już wykorzystany',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.error('GET /api/invitations/:token error:', {
      tokenPrefix: context.params.token?.substring(0, 8),
      error: error instanceof Error ? error.message : error,
    });

    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Wystąpił błąd serwera',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

