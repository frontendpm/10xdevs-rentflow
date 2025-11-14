import type { APIContext } from "astro";
import { z } from "zod";
import { ApartmentService } from "@/lib/services/apartment.service";
import { apartmentFormSchema, GetApartmentsQuerySchema } from "@/lib/validation/apartments.validation";
import type { ApartmentListDTO } from "@/types";
import { ForbiddenError } from "@/lib/errors";

/**
 * GET /api/apartments
 *
 * Endpoint zwracający listę mieszkań dla zalogowanego użytkownika.
 * - Dla właściciela (owner): wszystkie jego mieszkania z informacją o aktywnym najmie.
 * - Dla lokatora (tenant): tylko mieszkanie z aktywnym najmem, wraz z właścicielem.
 *
 * Query params:
 * - include_archived (opcjonalny): "true" | "false" (domyślnie "false")
 *
 * @returns 200 - Lista mieszkań (ApartmentListDTO)
 * @returns 400 - Błąd walidacji query params
 * @returns 401 - Brak autoryzacji
 * @returns 500 - Błąd serwera / nieprawidłowa rola użytkownika
 */
export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  try {
    const user = context.locals.user;

    // 1. Guard clause - weryfikacja autoryzacji
    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Brak autoryzacji",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const supabase = context.locals.supabase;
    const apartmentService = new ApartmentService(supabase);

    // 2. Walidacja query params za pomocą Zod
    const url = new URL(context.request.url);
    const searchParams = url.searchParams;

    const validationResult = GetApartmentsQuerySchema.safeParse({
      include_archived: searchParams.get("include_archived") ?? undefined,
    });

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Validation Error",
          message: "Nieprawidłowe parametry",
          details: validationResult.error.flatten().fieldErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { include_archived } = validationResult.data;

    // 3. Pobranie roli użytkownika z bazy danych
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (userError || !userData) {
      console.error("[GET /api/apartments] Użytkownik nie znaleziony lub błąd bazy:", {
        userId: user.id,
        error: userError,
      });

      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          message: "Wystąpił błąd serwera",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { role } = userData;

    // 4. Pobranie listy mieszkań w zależności od roli
    let apartments: ApartmentListDTO["apartments"];

    if (role === "owner") {
      apartments = await apartmentService.getApartmentsForOwner(
        user.id,
        include_archived,
      );
    } else if (role === "tenant") {
      apartments = await apartmentService.getApartmentsForTenant(user.id);
    } else {
      console.error("[GET /api/apartments] Nieprawidłowa rola użytkownika:", {
        userId: user.id,
        role,
      });

      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          message: "Nieprawidłowa rola użytkownika",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const responseBody: ApartmentListDTO = {
      apartments,
    };

    // 5. Happy path - zwrócenie listy mieszkań
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    console.error("[GET /api/apartments] Nieoczekiwany błąd:", error);

    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Wystąpił błąd serwera",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

/**
 * POST /api/apartments
 *
 * Endpoint tworzący nowe mieszkanie dla zalogowanego właściciela.
 * Tylko użytkownicy z rolą 'owner' mogą tworzyć mieszkania.
 *
 * Request body:
 * {
 *   "name": "Kawalerka na Woli",
 *   "address": "ul. Złota 44, Warszawa"
 * }
 *
 * @returns 201 - Utworzone mieszkanie
 * @returns 400 - Błąd walidacji danych
 * @returns 401 - Brak autoryzacji
 * @returns 403 - Użytkownik nie jest właścicielem
 * @returns 500 - Błąd serwera
 */
export async function POST(context: APIContext): Promise<Response> {
  const user = context.locals.user;

  // 1. Guard clause - weryfikacja autoryzacji
  if (!user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        message: "Brak autoryzacji",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    // 2. Parsowanie request body
    const body = await context.request.json();

    // 3. Walidacja danych wejściowych
    const validated = apartmentFormSchema.parse(body);

    // 4. Utworzenie mieszkania przez serwis (RLS sprawdzi uprawnienia)
    const apartmentService = new ApartmentService(context.locals.supabase);
    const apartment = await apartmentService.createApartment(user.id, validated);

    // 5. Happy path - zwrócenie utworzonego mieszkania
    return new Response(JSON.stringify(apartment), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Location": `/api/apartments/${apartment.id}`,
      },
    });
  } catch (error) {
    // Obsługa błędów walidacji Zod
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
        },
      );
    }

    // Obsługa błędu uprawnień
    if (error instanceof ForbiddenError) {
      return new Response(
        JSON.stringify({
          error: "Forbidden",
          message: error.message,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Obsługa błędów parsowania JSON
    if (error instanceof SyntaxError) {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "Nieprawidłowy format danych",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Logowanie nieoczekiwanych błędów
    console.error("[POST /api/apartments] Nieoczekiwany błąd:", {
      userId: user.id,
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
      },
    );
  }
}


