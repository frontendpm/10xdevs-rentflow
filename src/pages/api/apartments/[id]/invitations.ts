import type { APIContext } from 'astro';
import { z } from 'zod';
import {
  CreateInvitationParamsSchema,
  GetInvitationsParamsSchema,
} from '@/lib/validation/invitations.validation';
import { InvitationService } from '@/lib/services/invitation.service';

export const prerender = false;

export async function POST(context: APIContext) {
  try {
    const user = context.locals.user;
    if (!user) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Brak autoryzacji',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const params = CreateInvitationParamsSchema.parse(context.params);

    const supabase = context.locals.supabase;
    const invitationService = new InvitationService(supabase);
    const invitation = await invitationService.createInvitation(
      params.id,
      user.id
    );

    return new Response(JSON.stringify(invitation), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Nieprawidłowy format ID mieszkania',
          details: error.flatten(),
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Mieszkanie nie zostało znalezione',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (error instanceof Error && error.message === 'ACTIVE_LEASE') {
      return new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'To mieszkanie ma już aktywnego lokatora',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.error('POST /api/apartments/:id/invitations error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Wystąpił błąd serwera',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function GET(context: APIContext) {
  try {
    const user = context.locals.user;
    if (!user) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Brak autoryzacji',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const params = GetInvitationsParamsSchema.parse(context.params);

    const supabase = context.locals.supabase;
    const invitationService = new InvitationService(supabase);
    const invitations = await invitationService.getInvitationsForApartment(
      params.id,
      user.id
    );

    return new Response(JSON.stringify(invitations), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: 'Validation Error',
          message: 'Nieprawidłowy format ID mieszkania',
          details: error.flatten(),
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return new Response(
        JSON.stringify({
          error: 'Not Found',
          message: 'Mieszkanie nie zostało znalezione',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.error('GET /api/apartments/:id/invitations error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'Wystąpił błąd serwera',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

