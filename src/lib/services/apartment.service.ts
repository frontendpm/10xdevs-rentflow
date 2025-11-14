import type { SupabaseClient } from "@/db/supabase.client";
import type {
  ApartmentListItemOwnerDTO,
  ApartmentListItemTenantDTO,
  CreateApartmentCommand,
} from "@/types";
import type { Tables } from "@/db/database.types";
import { ForbiddenError } from "@/lib/errors";

/**
 * Serwis odpowiedzialny za operacje na mieszkaniach dla endpointu GET /api/apartments.
 *
 * W kolejnych krokach zostaną zaimplementowane zapytania do bazy danych
 * zgodnie z planem w dokumentacji.
 */
export class ApartmentService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Zwraca listę mieszkań dla właściciela wraz z informacjami o aktywnym najmie.
   *
   * @param userId - ID właściciela (auth.uid())
   * @param includeArchived - czy dołączyć mieszkania z archiwalnymi najmami
   */
  async getApartmentsForOwner(
    userId: string,
    includeArchived: boolean,
  ): Promise<ApartmentListItemOwnerDTO[]> {
    // 1. Pobranie wszystkich mieszkań właściciela
    const { data: apartments, error: apartmentsError } = await this.supabase
      .from("apartments")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    if (apartmentsError) {
      console.error("[ApartmentService.getApartmentsForOwner] Błąd pobierania mieszkań:", {
        userId,
        error: apartmentsError,
      });
      throw new Error(`Failed to fetch apartments: ${apartmentsError.message}`);
    }

    if (!apartments || apartments.length === 0) {
      return [];
    }

    // 2. Dla każdego mieszkania pobierz informacje o najmie i lokatorze
    const apartmentItems: ApartmentListItemOwnerDTO[] = await Promise.all(
      apartments.map(async (apartment) => {
        // 2a. Budujemy query dla najmu
        let leaseQuery = this.supabase
          .from("leases")
          .select(
            `
            id,
            status,
            start_date,
            tenant_id,
            users!leases_tenant_id_fkey (
              id,
              full_name,
              email
            )
          `
          )
          .eq("apartment_id", apartment.id);

        // Filtrowanie po statusie najmu
        if (includeArchived) {
          leaseQuery = leaseQuery.in("status", ["active", "archived"]);
        } else {
          leaseQuery = leaseQuery.eq("status", "active");
        }

        const { data: lease } = await leaseQuery.maybeSingle();

        // 2b. Budujemy obiekt mieszkania z najmem (jeśli istnieje)
        const apartmentItem: ApartmentListItemOwnerDTO = {
          ...apartment,
        };

        if (lease && lease.users) {
          apartmentItem.lease = {
            id: lease.id,
            status: lease.status,
            start_date: lease.start_date,
            tenant: {
              id: lease.users.id,
              full_name: lease.users.full_name,
              email: lease.users.email,
            },
          };
        }

        return apartmentItem;
      })
    );

    return apartmentItems;
  }

  /**
   * Zwraca mieszkanie dla lokatora z aktywnym najmem.
   *
   * @param userId - ID lokatora (auth.uid())
   */
  async getApartmentsForTenant(
    userId: string,
  ): Promise<ApartmentListItemTenantDTO[]> {
    // 1. Pobranie mieszkania lokatora z aktywnym najmem
    const { data: lease, error: leaseError } = await this.supabase
      .from("leases")
      .select(
        `
        id,
        status,
        apartment_id,
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
      .eq("tenant_id", userId)
      .eq("status", "active")
      .maybeSingle();

    // Guard clause - sprawdzenie czy lokator ma aktywny najem
    if (leaseError) {
      console.error("[ApartmentService.getApartmentsForTenant] Błąd pobierania najmu:", {
        userId,
        error: leaseError,
      });
      throw new Error(`Failed to fetch lease: ${leaseError.message}`);
    }

    // Jeśli lokator nie ma aktywnego najmu, zwracamy pustą tablicę
    if (!lease || !lease.apartments) {
      return [];
    }

    const apartment = lease.apartments;
    const owner = apartment.users;

    // Guard clause - sprawdzenie czy właściciel istnieje
    if (!owner) {
      console.error("[ApartmentService.getApartmentsForTenant] Brak właściciela dla mieszkania:", {
        userId,
        apartmentId: apartment.id,
      });
      throw new Error("Owner not found for apartment");
    }

    // 2. Zwrócenie mieszkania z danymi właściciela
    return [
      {
        id: apartment.id,
        name: apartment.name,
        address: apartment.address,
        owner: {
          id: owner.id,
          full_name: owner.full_name,
          email: owner.email,
        },
      },
    ];
  }

  /**
   * Tworzy nowe mieszkanie dla właściciela.
   *
   * @param userId - ID użytkownika (auth.uid())
   * @param command - Dane mieszkania do utworzenia
   * @throws {ForbiddenError} - Jeśli użytkownik nie jest właścicielem
   * @throws {Error} - Jeśli nie udało się utworzyć mieszkania
   */
  async createApartment(
    userId: string,
    command: CreateApartmentCommand,
  ): Promise<Tables<'apartments'>> {
    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new Error('Nie znaleziono użytkownika');
    }

    if (user.role !== 'owner') {
      throw new ForbiddenError('Tylko właściciele mogą dodawać mieszkania');
    }

    const { data: apartment, error: insertError } = await this.supabase
      .from('apartments')
      .insert({
        name: command.name,
        address: command.address,
        owner_id: userId,
        created_by: userId
      })
      .select()
      .single();

    if (insertError || !apartment) {
      console.error('[ApartmentService.createApartment] Błąd tworzenia mieszkania:', {
        userId,
        error: insertError,
      });
      throw new Error('Nie udało się utworzyć mieszkania');
    }

    return apartment;
  }
}


