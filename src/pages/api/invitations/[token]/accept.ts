import type { APIContext } from "astro";
import { z } from "zod";
import { AcceptInvitationParamsSchema } from "@/lib/validation/invitations.validation";
import { InvitationService } from "@/lib/services/invitation.service";
import { createServiceRoleClient } from "@/db/supabase.client";

export const prerender = false;

export async function POST(context: APIContext) {
  try {
    const user = context.locals.user;
    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Brak autoryzacji",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const params = AcceptInvitationParamsSchema.parse(context.params);

    // Use service role client to bypass RLS (tenant cannot read invitation_links)
    const supabase = createServiceRoleClient();
    const invitationService = new InvitationService(supabase);
    const result = await invitationService.acceptInvitation(params.token, user.id);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: "Validation Error",
          message: "Token jest wymagany",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (error instanceof Error && error.message === "INVALID_TOKEN") {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "Ten link zapraszający wygasł lub został już wykorzystany",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (error instanceof Error && error.message === "USER_HAS_LEASE") {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "Twoje konto jest już przypisane do aktywnego najmu",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (error instanceof Error && error.message === "APARTMENT_HAS_LEASE") {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "To mieszkanie ma już aktywnego lokatora",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.error("POST /api/invitations/:token/accept error:", {
      userId: user?.id,
      tokenPrefix: context.params.token?.substring(0, 8),
      error: error instanceof Error ? error.message : error,
    });

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Wystąpił błąd serwera",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
