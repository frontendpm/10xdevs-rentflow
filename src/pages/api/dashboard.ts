import type { APIContext } from "astro";
import { getOwnerDashboard, getTenantDashboard } from "@/lib/services/dashboardService";
import type { DashboardDTO } from "@/types";

/**
 * GET /api/dashboard
 *
 * Endpoint zwracający dane dashboardu w zależności od roli użytkownika.
 * Dla właściciela: lista mieszkań z podsumowaniami finansowymi i statystykami.
 * Dla lokatora: informacje o mieszkaniu i podsumowanie finansowe najmu.
 *
 * @returns 200 - Dashboard data (DashboardOwnerDTO | DashboardTenantDTO)
 * @returns 401 - Brak autoryzacji
 * @returns 500 - Błąd serwera
 */
export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  try {
    // 1. Guard clause - weryfikacja autentykacji
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

    const supabase = context.locals.supabase;

    // 2. Pobranie roli użytkownika z bazy danych
    const { data: userData, error: userError } = await supabase.from("users").select("role").eq("id", user.id).single();

    // 3. Guard clause - sprawdzenie czy użytkownik istnieje w bazie
    if (userError || !userData) {
      console.error("[GET /api/dashboard] Użytkownik nie znaleziony:", {
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
        }
      );
    }

    const { role } = userData;

    // 4. Pobranie danych dashboardu w zależności od roli
    let dashboardData: DashboardDTO;

    if (role === "owner") {
      dashboardData = await getOwnerDashboard(supabase, user.id);
    } else if (role === "tenant") {
      dashboardData = await getTenantDashboard(supabase, user.id);
    } else {
      // Nieznana rola użytkownika
      console.error("[GET /api/dashboard] Nieprawidłowa rola użytkownika:", {
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
        }
      );
    }

    // 5. Happy path - zwrócenie danych dashboardu
    return new Response(JSON.stringify(dashboardData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    // 6. Obsługa błędów
    console.error("[GET /api/dashboard] Nieoczekiwany błąd:", error);

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
