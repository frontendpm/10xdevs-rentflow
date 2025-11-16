import type { APIContext } from "astro";
import { z } from "zod";
import { ApartmentService } from "@/lib/services/apartment.service";
import { ApartmentIdParamSchema, UpdateApartmentSchema } from "@/lib/validation/apartments.validation";
import { ApartmentHasLeasesError } from "@/lib/errors";

export const prerender = false;

/**
 * GET /api/apartments/:id
 *
 * Zwraca szczegółowe informacje o konkretnym mieszkaniu.
 *
 * Autoryzacja:
 * - Owner może zobaczyć tylko swoje mieszkania
 * - Tenant może zobaczyć tylko mieszkanie z aktywnym najmem
 *
 * @returns 200 - ApartmentDetailsDTO
 * @returns 400 - Invalid UUID format
 * @returns 401 - Unauthorized
 * @returns 404 - Apartment not found or no access (RLS)
 * @returns 500 - Internal Server Error
 */
export async function GET(context: APIContext) {
  // 1. Sprawdzenie autoryzacji
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
    // 2. Walidacja path parameter
    const { id } = ApartmentIdParamSchema.parse(context.params);

    // 3. Pobranie szczegółów mieszkania
    const apartmentService = new ApartmentService(context.locals.supabase);
    const apartment = await apartmentService.getApartmentDetails(id);

    // 4. Sprawdzenie czy znaleziono mieszkanie
    if (!apartment) {
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

    // 5. Zwrócenie odpowiedzi
    return new Response(JSON.stringify(apartment), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Obsługa błędów walidacji
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

    // Logowanie błędu serwera
    console.error("GET /api/apartments/:id error:", {
      userId: user.id,
      apartmentId: context.params.id,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Odpowiedź błędu serwera
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

/**
 * PATCH /api/apartments/:id
 *
 * Aktualizuje dane mieszkania (partial update).
 * Tylko właściciel może edytować swoje mieszkanie.
 *
 * @returns 200 - Zaktualizowane mieszkanie
 * @returns 400 - Invalid UUID/validation error
 * @returns 401 - Unauthorized
 * @returns 404 - Apartment not found or no access (RLS)
 * @returns 500 - Internal Server Error
 */
export async function PATCH(context: APIContext) {
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

    const body = await context.request.json();

    const validated = UpdateApartmentSchema.parse(body);

    const apartmentService = new ApartmentService(context.locals.supabase);
    const apartment = await apartmentService.updateApartment(id, validated);

    if (!apartment) {
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

    return new Response(JSON.stringify(apartment), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: "Validation Error",
          message: "Nieprawidłowe dane",
          details: error.flatten().fieldErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.error("PATCH /api/apartments/:id error:", {
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

/**
 * DELETE /api/apartments/:id
 *
 * Usuwa mieszkanie z bazy danych.
 * Tylko właściciel może usunąć swoje mieszkanie.
 * Nie można usunąć mieszkania z najmami (wymuszane przez trigger).
 *
 * @returns 204 - No Content (sukces)
 * @returns 400 - Invalid UUID/apartment has leases
 * @returns 401 - Unauthorized
 * @returns 404 - Apartment not found or no access (RLS)
 * @returns 500 - Internal Server Error
 */
export async function DELETE(context: APIContext) {
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

    const apartmentService = new ApartmentService(context.locals.supabase);
    const deleted = await apartmentService.deleteApartment(id);

    if (!deleted) {
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

    return new Response(null, {
      status: 204,
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

    if (error instanceof ApartmentHasLeasesError) {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: error.message,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.error("DELETE /api/apartments/:id error:", {
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
