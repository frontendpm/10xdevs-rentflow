import type { APIContext } from "astro";
import { z } from "zod";
import { getCurrentUser, updateCurrentUserProfile } from "@/lib/services/user.service";
import type { UpdateUserProfileCommand } from "@/types";

/**
 * GET /api/users/me
 *
 * Endpoint zwracający profil aktualnie zalogowanego użytkownika.
 * Wymaga autoryzacji poprzez JWT token w nagłówku Authorization.
 *
 * @returns 200 - Profil użytkownika
 * @returns 401 - Brak autoryzacji
 * @returns 404 - Profil nie znaleziony
 * @returns 500 - Błąd serwera
 */
export const prerender = false;

// Zod validation schema dla aktualizacji profilu
const updateUserProfileSchema = z.object({
  full_name: z.string().trim().min(2, "Imię musi mieć co najmniej 2 znaki"),
});

export async function GET(context: APIContext): Promise<Response> {
  try {
    // 1. Guard clause - weryfikacja autentykacji
    if (!context.locals.user) {
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

    // 2. Pobranie profilu użytkownika
    const userProfile = await getCurrentUser(context.locals.supabase, context.locals.user.id);

    // 3. Guard clause - sprawdzenie czy profil istnieje
    if (!userProfile) {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "Profil użytkownika nie został znaleziony",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 4. Happy path - zwrócenie profilu
    return new Response(JSON.stringify(userProfile), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    // 5. Obsługa błędów
    console.error("[GET /api/users/me] Nieoczekiwany błąd:", error);

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
 * PATCH /api/users/me
 *
 * Endpoint aktualizujący profil aktualnie zalogowanego użytkownika.
 * W wersji MVP można edytować tylko pole full_name.
 * Wymaga autoryzacji poprzez JWT token w nagłówku Authorization.
 *
 * @returns 200 - Zaktualizowany profil użytkownika
 * @returns 400 - Błąd walidacji danych
 * @returns 401 - Brak autoryzacji
 * @returns 404 - Użytkownik nie znaleziony
 * @returns 500 - Błąd serwera
 */
export async function PATCH(context: APIContext): Promise<Response> {
  try {
    // 1. Weryfikacja autoryzacji
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

    // 2. Parsowanie i walidacja request body
    let body: unknown;
    try {
      body = await context.request.json();
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          message: "Nieprawidłowy format żądania",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 3. Walidacja za pomocą Zod
    const validationResult = updateUserProfileSchema.safeParse(body);
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Validation Error",
          message: "Nieprawidłowe dane",
          details: validationResult.error.flatten().fieldErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const validated = validationResult.data as UpdateUserProfileCommand;

    // 4. Wywołanie serwisu
    const supabase = context.locals.supabase;
    const updatedProfile = await updateCurrentUserProfile(supabase, user.id, validated);

    // 5. Zwrócenie zaktualizowanego profilu
    return new Response(JSON.stringify(updatedProfile), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Obsługa błędu "User not found"
    if (error instanceof Error && error.message === "User not found") {
      return new Response(
        JSON.stringify({
          error: "Not Found",
          message: "Użytkownik nie został znaleziony",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Ogólny błąd serwera
    console.error("[PATCH /api/users/me] Nieoczekiwany błąd:", error);
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
