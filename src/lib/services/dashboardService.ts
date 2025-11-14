import type { SupabaseClient } from "@/db/supabase.client";
import type { DashboardOwnerDTO, DashboardTenantDTO, DashboardApartmentItem, DashboardStatistics } from "@/types";

/**
 * Pobiera dane dashboardu dla właściciela (owner)
 *
 * Zwraca listę wszystkich mieszkań właściciela wraz z:
 * - Informacjami o aktywnym najmie (jeśli istnieje)
 * - Podsumowaniem finansowym dla każdego mieszkania
 * - Ogólnymi statystykami (liczba mieszkań, aktywne najmy, kwoty)
 *
 * @param supabase - Klient Supabase z context.locals
 * @param ownerId - ID właściciela (z context.locals.user.id)
 * @returns DashboardOwnerDTO z listą mieszkań i statystykami
 * @throws Error jeśli wystąpi błąd bazy danych
 *
 * @example
 * ```ts
 * const dashboard = await getOwnerDashboard(
 *   context.locals.supabase,
 *   context.locals.user.id
 * );
 * // dashboard.role === 'owner'
 * // dashboard.apartments - lista mieszkań z podsumowaniami
 * // dashboard.statistics - ogólne statystyki
 * ```
 */
export async function getOwnerDashboard(supabase: SupabaseClient, ownerId: string): Promise<DashboardOwnerDTO> {
  // 1. Pobranie wszystkich mieszkań właściciela
  const { data: apartments, error: apartmentsError } = await supabase
    .from("apartments")
    .select("id, name, address")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (apartmentsError) {
    console.error("[DashboardService.getOwnerDashboard] Błąd pobierania mieszkań:", {
      ownerId,
      error: apartmentsError,
    });
    throw new Error(`Failed to fetch apartments: ${apartmentsError.message}`);
  }

  // 2. Dla każdego mieszkania pobierz informacje o najmie i finansach
  const apartmentItems: DashboardApartmentItem[] = await Promise.all(
    (apartments || []).map(async (apartment) => {
      // 2a. Pobranie aktywnego najmu z informacją o lokatorze
      const { data: lease } = await supabase
        .from("leases")
        .select(
          `
          id,
          status,
          tenant_id,
          users!leases_tenant_id_fkey (full_name)
        `
        )
        .eq("apartment_id", apartment.id)
        .eq("status", "active")
        .maybeSingle();

      // 2b. Obliczenie podsumowania finansowego
      let total_unpaid = 0;
      let total_overdue = 0;

      if (lease) {
        // Pobranie opłat z view charges_with_status
        const { data: charges } = await supabase
          .from("charges_with_status")
          .select("remaining_amount, is_overdue, payment_status")
          .eq("lease_id", lease.id);

        // Obliczenie total_unpaid (suma remaining_amount dla unpaid i partially_paid)
        total_unpaid = (charges || []).reduce((sum, charge) => {
          if (["unpaid", "partially_paid"].includes(charge.payment_status || "")) {
            return sum + (charge.remaining_amount || 0);
          }
          return sum;
        }, 0);

        // Obliczenie total_overdue (suma remaining_amount dla przeterminowanych)
        total_overdue = (charges || []).reduce((sum, charge) => {
          if (charge.is_overdue) {
            return sum + (charge.remaining_amount || 0);
          }
          return sum;
        }, 0);
      }

      // 2c. Zwrócenie danych mieszkania z najmem i finansami
      return {
        id: apartment.id,
        name: apartment.name,
        address: apartment.address,
        lease_status: lease?.status,
        tenant: lease?.users ? { full_name: lease.users.full_name } : undefined,
        financial_summary: {
          total_unpaid,
          total_overdue,
        },
      };
    })
  );

  // 3. Obliczenie ogólnych statystyk
  const statistics: DashboardStatistics = {
    total_apartments: apartmentItems.length,
    active_leases: apartmentItems.filter((a) => a.lease_status === "active").length,
    total_unpaid: apartmentItems.reduce((sum, a) => sum + a.financial_summary.total_unpaid, 0),
    total_overdue: apartmentItems.reduce((sum, a) => sum + a.financial_summary.total_overdue, 0),
  };

  return {
    role: "owner",
    apartments: apartmentItems,
    statistics,
  };
}

/**
 * Pobiera dane dashboardu dla lokatora (tenant)
 *
 * Zwraca informacje o mieszkaniu lokatora wraz z:
 * - Danymi właściciela
 * - Podsumowaniem finansowym (kwoty do zapłaty, przeterminowane)
 * - Listą nadchodzących opłat (maksymalnie 5)
 *
 * @param supabase - Klient Supabase z context.locals
 * @param tenantId - ID lokatora (z context.locals.user.id)
 * @returns DashboardTenantDTO z danymi mieszkania i finansami
 * @throws Error jeśli nie znaleziono aktywnego najmu lub wystąpił błąd bazy danych
 *
 * @example
 * ```ts
 * const dashboard = await getTenantDashboard(
 *   context.locals.supabase,
 *   context.locals.user.id
 * );
 * // dashboard.role === 'tenant'
 * // dashboard.apartment - dane mieszkania i właściciela
 * // dashboard.financial_summary - kwoty i nadchodzące opłaty
 * ```
 */
export async function getTenantDashboard(supabase: SupabaseClient, tenantId: string): Promise<DashboardTenantDTO> {
  // 1. Pobranie mieszkania lokatora z aktywnym najmem
  const { data: leaseData, error: leaseError } = await supabase
    .from("leases")
    .select(
      `
      id,
      apartments (
        id,
        name,
        address,
        owner_id,
        users!apartments_owner_id_fkey (
          id,
          full_name,
          email
        )
      )
    `
    )
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .single();

  // Guard clause - sprawdzenie czy lokator ma aktywny najem
  if (leaseError || !leaseData || !leaseData.apartments) {
    console.error("[DashboardService.getTenantDashboard] Brak aktywnego najmu:", {
      tenantId,
      error: leaseError,
    });
    throw new Error("No active lease found for tenant");
  }

  const apartment = leaseData.apartments;
  const owner = apartment.users;

  // 2. Pobranie opłat dla obliczenia financial summary
  const { data: charges } = await supabase
    .from("charges_with_status")
    .select("remaining_amount, is_overdue, payment_status, due_date")
    .eq("lease_id", leaseData.id);

  // 2a. Obliczenie total_due (suma remaining_amount dla unpaid i partially_paid)
  const total_due = (charges || []).reduce((sum, charge) => {
    if (["unpaid", "partially_paid"].includes(charge.payment_status || "")) {
      return sum + (charge.remaining_amount || 0);
    }
    return sum;
  }, 0);

  // 2b. Obliczenie total_overdue (suma remaining_amount dla przeterminowanych)
  const total_overdue = (charges || []).reduce((sum, charge) => {
    if (charge.is_overdue) {
      return sum + (charge.remaining_amount || 0);
    }
    return sum;
  }, 0);

  // 3. Pobranie nadchodzących opłat (upcoming charges)
  const today = new Date().toISOString().split("T")[0];
  const { data: upcomingChargesData } = await supabase
    .from("charges_with_status")
    .select("id, amount, due_date, type")
    .eq("lease_id", leaseData.id)
    .neq("payment_status", "paid")
    .gte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(5);

  // Filtrowanie i walidacja nadchodzących opłat (upewnienie się, że wszystkie wymagane pola są non-null)
  const upcomingCharges = (upcomingChargesData || [])
    .filter(
      (charge): charge is { id: string; amount: number; due_date: string; type: "rent" | "bill" | "other" } =>
        charge.id !== null && charge.amount !== null && charge.due_date !== null && charge.type !== null
    )
    .map((charge) => ({
      id: charge.id,
      amount: charge.amount,
      due_date: charge.due_date,
      type: charge.type,
    }));

  // 4. Zwrócenie danych dashboardu lokatora
  return {
    role: "tenant",
    apartment: {
      id: apartment.id,
      name: apartment.name,
      address: apartment.address,
      owner: {
        id: owner.id,
        full_name: owner.full_name,
        email: owner.email,
      },
    },
    financial_summary: {
      total_due,
      total_overdue,
      upcoming_charges: upcomingCharges,
    },
  };
}
