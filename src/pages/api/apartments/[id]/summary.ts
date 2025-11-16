import type { APIContext } from "astro";
import { z } from "zod";
import { ApartmentService } from "@/lib/services/apartment.service";
import { ApartmentIdParamSchema } from "@/lib/validation/apartments.validation";

export const prerender = false;

/**
 * GET /api/apartments/:id/summary
 *
 * Zwraca podsumowanie mieszkania z metrykami finansowymi.
 * Tylko dla właścicieli - zawiera dane o aktywnym najmie i statystyki opłat.
 *
 * @returns 200 - ApartmentSummaryDTO
 * @returns 400 - Invalid UUID format
 * @returns 401 - Unauthorized
 * @returns 403 - Forbidden (nie właściciel)
 * @returns 404 - Apartment not found or no access (RLS)
 * @returns 500 - Internal Server Error
 */
export async function GET(context: APIContext) {
  const user = context.locals.user;
  if (!user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        message: "Brak autoryzacji",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const { id } = ApartmentIdParamSchema.parse(context.params);

    const { data: userData, error: userError } = await context.locals.supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (userError || !userData) {
      throw new Error("Nie znaleziono użytkownika");
    }

    if (userData.role !== "owner") {
      return new Response(
        JSON.stringify({
          error: "Forbidden",
          message: "Nie masz uprawnień do przeglądania tego mieszkania",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const apartmentService = new ApartmentService(context.locals.supabase);
    const summary = await apartmentService.getApartmentSummary(id);

    if (!summary) {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "Mieszkanie nie zostało znalezione",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: "Validation Error",
          message: "Nieprawidłowy identyfikator mieszkania",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.error("GET /api/apartments/:id/summary error:", {
      userId: user.id,
      apartmentId: context.params.id,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Wystąpił błąd serwera",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
