import type { SupabaseClient } from "@/db/supabase.client";
import type { UserProfileDTO, UpdateUserProfileCommand } from "@/types";

/**
 * Pobiera profil aktualnie zalogowanego użytkownika
 *
 * @param supabase - Klient Supabase z context.locals
 * @param userId - ID użytkownika z JWT token (auth.uid())
 * @returns UserProfileDTO lub null jeśli nie znaleziono
 * @throws Error jeśli wystąpi błąd bazy danych (inny niż 'nie znaleziono')
 *
 * @example
 * ```ts
 * const profile = await getCurrentUser(
 *   context.locals.supabase,
 *   context.locals.user.id
 * );
 * ```
 */
export async function getCurrentUser(supabase: SupabaseClient, userId: string): Promise<UserProfileDTO | null> {
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).single();

  if (error) {
    // PGRST116: Nie znaleziono rekordu (nie jest to błąd krytyczny)
    if (error.code === "PGRST116") {
      console.warn("[UserService.getCurrentUser] Profil użytkownika nie znaleziony:", {
        userId,
        code: error.code,
      });
      return null;
    }

    // Inny błąd bazy danych - loguj i rzuć wyjątek
    console.error("[UserService.getCurrentUser] Błąd bazy danych:", {
      code: error.code,
      message: error.message,
      userId,
    });

    throw error;
  }

  return data as UserProfileDTO;
}

/**
 * Aktualizuje profil aktualnie zalogowanego użytkownika (tylko pole full_name)
 *
 * @param supabase - Klient Supabase z context.locals
 * @param userId - ID użytkownika (z context.locals.user.id)
 * @param data - Dane do aktualizacji (full_name)
 * @returns Zaktualizowany profil użytkownika
 * @throws Error jeśli aktualizacja się nie powiedzie lub użytkownik nie został znaleziony
 *
 * @example
 * ```ts
 * const updatedProfile = await updateCurrentUserProfile(
 *   context.locals.supabase,
 *   context.locals.user.id,
 *   { full_name: "Jan Nowak" }
 * );
 * ```
 */
export async function updateCurrentUserProfile(
  supabase: SupabaseClient,
  userId: string,
  data: UpdateUserProfileCommand
): Promise<UserProfileDTO> {
  const { data: profile, error } = await supabase
    .from("users")
    .update({
      full_name: data.full_name,
    })
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    console.error("[UserService.updateCurrentUserProfile] Błąd bazy danych:", {
      code: error.code,
      message: error.message,
      userId,
    });
    throw error;
  }

  if (!profile) {
    throw new Error("User not found");
  }

  return profile as UserProfileDTO;
}
