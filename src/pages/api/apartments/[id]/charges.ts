import type { APIContext } from "astro";
import { z } from "zod";
import { ChargesService } from "@/lib/services/charges.service";
import { getChargesQuerySchema, createChargeSchema } from "@/lib/validation/charges.validation";

export const prerender = false;

/**
 * GET /api/apartments/:id/charges
 *
 * Zwraca listę opłat dla mieszkania, pogrupowaną według miesięcy.
 * Automatycznie pobiera opłaty dla aktywnego najmu, chyba że podano lease_id.
 *
 * Autoryzacja:
 * - Owner może zobaczyć opłaty dla swoich mieszkań
 * - Tenant może zobaczyć opłaty dla mieszkania z aktywnym najmem
 *
 * Query params (opcjonalne):
 * - lease_id: UUID - konkretny najem (dla widoku historycznego)
 * - month: YYYY-MM - filtrowanie po miesiącu
 * - status: unpaid | partially_paid | paid - filtrowanie po statusie
 * - overdue: true | false - tylko przeterminowane
 *
 * @returns 200 - ChargesListDTO (opłaty pogrupowane po miesiącach)
 * @returns 400 - Validation Error (nieprawidłowe parametry)
 * @returns 401 - Unauthorized
 * @returns 403 - Forbidden (brak dostępu do mieszkania)
 * @returns 404 - Not Found (mieszkanie nie istnieje lub brak aktywnego najmu)
 * @returns 500 - Internal Server Error
 */
export async function GET(context: APIContext): Promise<Response> {
  const { params, url, locals } = context;
  const { supabase, user } = locals;

  // 1. Sprawdzenie autoryzacji
  if (!user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        message: "Brak autoryzacji",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Walidacja apartmentId
  const apartmentId = params.id;
  if (!apartmentId) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Brak ID mieszkania",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Walidacja formatu UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(apartmentId)) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Nieprawidłowy format ID mieszkania",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Walidacja query parameters
  const queryParams = Object.fromEntries(url.searchParams);

  let validatedParams;
  try {
    validatedParams = getChargesQuerySchema.parse(queryParams);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: "Validation Error",
          message: "Nieprawidłowe parametry zapytania",
          details: error.flatten().fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // 4. Wywołanie serwisu
  try {
    const chargesService = new ChargesService(supabase);
    const result = await chargesService.getChargesForApartment(apartmentId, validatedParams);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[GET /api/apartments/:id/charges] Error:", {
      userId: user.id,
      apartmentId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Obsługa specyficznych błędów
    if (error.message === "APARTMENT_NOT_FOUND") {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "Mieszkanie nie zostało znalezione",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (error.message === "NO_ACTIVE_LEASE") {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "Brak aktywnego najmu dla tego mieszkania",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Błąd ogólny
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Wystąpił błąd podczas pobierania opłat",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /api/apartments/:id/charges
 *
 * Tworzy nową opłatę dla mieszkania (tylko właściciel).
 * Opłata jest przypisana do aktywnego najmu mieszkania.
 *
 * Autoryzacja:
 * - Tylko owner może tworzyć opłaty
 * - Wymaga istnienia aktywnego najmu
 *
 * Request body:
 * - amount: number (> 0, max 2 miejsca po przecinku, max 999,999.99)
 * - due_date: string (format YYYY-MM-DD)
 * - type: 'rent' | 'bill' | 'other'
 * - comment?: string (max 300 znaków, opcjonalne)
 *
 * @returns 201 - ChargeListItemDTO (utworzona opłata)
 * @returns 400 - Validation Error (nieprawidłowe dane)
 * @returns 401 - Unauthorized
 * @returns 403 - Forbidden (nie jest właścicielem)
 * @returns 404 - Not Found (mieszkanie nie istnieje lub brak aktywnego najmu)
 * @returns 500 - Internal Server Error
 */
export async function POST(context: APIContext): Promise<Response> {
  const { params, request, locals } = context;
  const { supabase, user } = locals;

  // 1. Sprawdzenie autoryzacji
  if (!user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        message: "Brak autoryzacji",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Sprawdzenie czy user jest właścicielem
  // Pobieramy rolę z bazy danych
  const { data: userData, error: userError } = await supabase.from("users").select("role").eq("id", user.id).single();

  if (userError || !userData) {
    console.error("[POST /api/apartments/:id/charges] Błąd pobierania roli:", {
      userId: user.id,
      error: userError,
    });
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Błąd weryfikacji użytkownika",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (userData.role !== "owner") {
    return new Response(
      JSON.stringify({
        error: "Forbidden",
        message: "Tylko właściciele mogą dodawać opłaty",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Walidacja apartmentId
  const apartmentId = params.id;
  if (!apartmentId) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Brak ID mieszkania",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Walidacja formatu UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(apartmentId)) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Nieprawidłowy format ID mieszkania",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 4. Parsowanie i walidacja request body
  let requestBody;
  try {
    requestBody = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Nieprawidłowy format JSON",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let validatedData;
  try {
    validatedData = createChargeSchema.parse(requestBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          error: "Validation Error",
          message: "Nieprawidłowe dane",
          details: error.flatten().fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // 5. Wywołanie serwisu
  try {
    const chargesService = new ChargesService(supabase);
    const result = await chargesService.createCharge(apartmentId, validatedData, user.id);

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[POST /api/apartments/:id/charges] Error:", {
      userId: user.id,
      apartmentId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Obsługa specyficznych błędów
    if (error.message === "APARTMENT_NOT_FOUND") {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "Mieszkanie nie zostało znalezione",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (error.message === "FORBIDDEN") {
      return new Response(
        JSON.stringify({
          error: "Forbidden",
          message: "Nie masz uprawnień do dodawania opłat dla tego mieszkania",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    if (error.message === "NO_ACTIVE_LEASE") {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "Brak aktywnego najmu dla tego mieszkania",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Błąd ogólny
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Wystąpił błąd podczas tworzenia opłaty",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
