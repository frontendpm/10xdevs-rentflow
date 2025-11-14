import type { APIContext } from "astro";
import { getCurrentUser } from "@/lib/services/user.service";

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
