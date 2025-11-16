import type { APIContext } from "astro";
import { z } from "zod";
import { ChargesService } from "@/lib/services/charges.service";
import { updateChargeSchema } from "@/lib/validation/charges.validation";

export const prerender = false;

/**
 * GET /api/charges/:id
 *
 * Zwraca szczegółowe informacje o opłacie wraz z listą wpłat.
 *
 * Autoryzacja:
 * - Owner może zobaczyć opłaty dla swoich mieszkań (RLS)
 * - Tenant może zobaczyć opłaty dla mieszkania z aktywnym najmem (RLS)
 *
 * @returns 200 - ChargeDetailsDTO (opłata z listą wpłat)
 * @returns 400 - Bad Request (nieprawidłowy UUID)
 * @returns 401 - Unauthorized
 * @returns 404 - Not Found (opłata nie istnieje lub brak dostępu)
 * @returns 500 - Internal Server Error
 */
export async function GET(context: APIContext): Promise<Response> {
  const { params, locals } = context;
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

  // 2. Walidacja chargeId
  const chargeId = params.id;
  if (!chargeId) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Brak ID opłaty",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Walidacja formatu UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(chargeId)) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Nieprawidłowy format ID opłaty",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Wywołanie serwisu
  try {
    const chargesService = new ChargesService(supabase);
    const result = await chargesService.getChargeById(chargeId);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[GET /api/charges/:id] Error:", {
      userId: user.id,
      chargeId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Obsługa specyficznych błędów
    if (error.message === "CHARGE_NOT_FOUND") {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "Opłata nie została znaleziona",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Błąd ogólny
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Wystąpił błąd podczas pobierania opłaty",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * PATCH /api/charges/:id
 *
 * Aktualizuje dane opłaty (partial update, tylko właściciel).
 *
 * Reguły biznesowe (wymuszane przez DB triggers):
 * - Nie można edytować opłaty ze statusem "paid"
 * - Kwota nie może być niższa niż suma wpłat
 *
 * Autoryzacja:
 * - Tylko owner może edytować opłaty (RLS)
 *
 * Request body (wszystkie pola opcjonalne):
 * - amount?: number (> 0, max 2 miejsca po przecinku, max 999,999.99)
 * - due_date?: string (format YYYY-MM-DD)
 * - type?: 'rent' | 'bill' | 'other'
 * - comment?: string | null (max 300 znaków)
 *
 * @returns 200 - ChargeListItemDTO (zaktualizowana opłata)
 * @returns 400 - Validation Error / Business Rule Violation
 * @returns 401 - Unauthorized
 * @returns 403 - Forbidden (nie jest właścicielem)
 * @returns 404 - Not Found (opłata nie istnieje)
 * @returns 500 - Internal Server Error
 */
export async function PATCH(context: APIContext): Promise<Response> {
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
  const { data: userData, error: userError } = await supabase.from("users").select("role").eq("id", user.id).single();

  if (userError || !userData) {
    console.error("[PATCH /api/charges/:id] Błąd pobierania roli:", {
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
        message: "Tylko właściciele mogą edytować opłaty",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Walidacja chargeId
  const chargeId = params.id;
  if (!chargeId) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Brak ID opłaty",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Walidacja formatu UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(chargeId)) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Nieprawidłowy format ID opłaty",
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
    validatedData = updateChargeSchema.parse(requestBody);
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
    const result = await chargesService.updateCharge(chargeId, validatedData);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[PATCH /api/charges/:id] Error:", {
      userId: user.id,
      chargeId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Obsługa błędów reguł biznesowych
    if (error.message === "CHARGE_FULLY_PAID") {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "Nie można edytować w pełni opłaconej opłaty",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (error.message === "AMOUNT_TOO_LOW") {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "Kwota opłaty nie może być niższa niż suma dokonanych wpłat",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (error.message === "CHARGE_NOT_FOUND") {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "Opłata nie została znaleziona",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Błąd ogólny
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Wystąpił błąd podczas aktualizacji opłaty",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * DELETE /api/charges/:id
 *
 * Usuwa opłatę wraz z załącznikiem (tylko właściciel).
 *
 * Reguła biznesowa:
 * - Nie można usunąć opłaty ze statusem "paid"
 *
 * Autoryzacja:
 * - Tylko owner może usuwać opłaty (RLS)
 *
 * @returns 204 - No Content (opłata usunięta)
 * @returns 400 - Bad Request (opłata jest opłacona)
 * @returns 401 - Unauthorized
 * @returns 403 - Forbidden (nie jest właścicielem)
 * @returns 404 - Not Found (opłata nie istnieje)
 * @returns 500 - Internal Server Error
 */
export async function DELETE(context: APIContext): Promise<Response> {
  const { params, locals } = context;
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
  const { data: userData, error: userError } = await supabase.from("users").select("role").eq("id", user.id).single();

  if (userError || !userData) {
    console.error("[DELETE /api/charges/:id] Błąd pobierania roli:", {
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
        message: "Tylko właściciele mogą usuwać opłaty",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Walidacja chargeId
  const chargeId = params.id;
  if (!chargeId) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Brak ID opłaty",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Walidacja formatu UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(chargeId)) {
    return new Response(
      JSON.stringify({
        error: "Bad Request",
        message: "Nieprawidłowy format ID opłaty",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 4. Wywołanie serwisu
  try {
    const chargesService = new ChargesService(supabase);
    await chargesService.deleteCharge(chargeId);

    // Success - 204 No Content
    return new Response(null, { status: 204 });
  } catch (error: any) {
    console.error("[DELETE /api/charges/:id] Error:", {
      userId: user.id,
      chargeId,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Obsługa specyficznych błędów
    if (error.message === "CHARGE_NOT_FOUND") {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "Opłata nie została znaleziona",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (error.message === "CANNOT_DELETE_PAID_CHARGE") {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "Nie można usunąć w pełni opłaconej opłaty",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Błąd ogólny
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: "Wystąpił błąd podczas usuwania opłaty",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
