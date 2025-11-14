import type { SupabaseClient } from "@/db/supabase.client";
import type {
  ApartmentListItemOwnerDTO,
  ApartmentListItemTenantDTO,
  ApartmentDetailsDTO,
  CreateApartmentCommand,
  UpdateApartmentCommand,
  ApartmentSummaryDTO,
  FinancialSummary,
} from "@/types";
import type { Tables } from "@/db/database.types";
import { ForbiddenError, ApartmentHasLeasesError } from "@/lib/errors";

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

  /**
   * Pobiera szczegółowe informacje o konkretnym mieszkaniu wraz z danymi o aktywnym najmie.
   * 
   * RLS automatycznie filtruje wyniki:
   * - Owner może zobaczyć tylko swoje mieszkania
   * - Tenant może zobaczyć tylko mieszkanie z aktywnym najmem
   * 
   * @param apartmentId - UUID mieszkania
   * @returns Dane mieszkania z opcjonalnym lease info lub null jeśli nie znaleziono
   * @throws {Error} - Jeśli wystąpi błąd zapytania do bazy
   */
  async getApartmentDetails(
    apartmentId: string
  ): Promise<ApartmentDetailsDTO | null> {
    // Query z LEFT JOIN na aktywny najem i lokatora
    const { data, error } = await this.supabase
      .from('apartments')
      .select(`
        *,
        leases!left (
          id,
          status,
          start_date,
          tenant_id,
          users!leases_tenant_id_fkey (
            id,
            full_name,
            email
          )
        )
      `)
      .eq('id', apartmentId)
      .eq('leases.status', 'active')
      .maybeSingle();

    if (error) {
      console.error('[ApartmentService.getApartmentDetails] Błąd pobierania mieszkania:', {
        apartmentId,
        error,
      });
      throw error;
    }

    // RLS może zwrócić null jeśli użytkownik nie ma dostępu
    if (!data) {
      return null;
    }

    // Transformacja do DTO
    const apartment: ApartmentDetailsDTO = {
      ...data,
    };

    // Dodanie lease info jeśli istnieje aktywny najem
    if (data.leases && Array.isArray(data.leases) && data.leases.length > 0) {
      const lease = data.leases[0];
      if (lease && lease.users) {
        apartment.lease = {
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
    }

    // Usuń pole leases z response (zostało przetransformowane do lease)
    delete (apartment as any).leases;

    return apartment;
  }

  /**
   * Aktualizuje dane mieszkania (partial update).
   * Tylko właściciel może edytować swoje mieszkanie.
   * 
   * @param apartmentId - UUID mieszkania
   * @param command - Dane do aktualizacji (name i/lub address)
   * @returns Zaktualizowane mieszkanie lub null jeśli nie znaleziono/brak dostępu
   * @throws {Error} - Jeśli wystąpi błąd zapytania do bazy
   */
  async updateApartment(
    apartmentId: string,
    command: UpdateApartmentCommand
  ): Promise<Tables<'apartments'> | null> {
    const updateData: Partial<Tables<'apartments'>> = {};
    
    if (command.name !== undefined) {
      updateData.name = command.name;
    }
    if (command.address !== undefined) {
      updateData.address = command.address;
    }

    const { data, error } = await this.supabase
      .from('apartments')
      .update(updateData)
      .eq('id', apartmentId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[ApartmentService.updateApartment] Błąd aktualizacji mieszkania:', {
        apartmentId,
        error,
      });
      throw error;
    }

    return data;
  }

  /**
   * Usuwa mieszkanie z bazy danych.
   * Tylko właściciel może usunąć swoje mieszkanie.
   * Database trigger zapobiega usunięciu mieszkania z najmami.
   * 
   * @param apartmentId - UUID mieszkania
   * @returns true jeśli usunięto, false jeśli nie znaleziono
   * @throws {ApartmentHasLeasesError} - Jeśli mieszkanie ma najmy (trigger)
   * @throws {Error} - Jeśli wystąpi inny błąd bazy danych
   */
  async deleteApartment(apartmentId: string): Promise<boolean> {
    const { error, count } = await this.supabase
      .from('apartments')
      .delete({ count: 'exact' })
      .eq('id', apartmentId);

    if (error) {
      if (
        error.code === 'P0001' ||
        error.message?.includes('existing leases')
      ) {
        throw new ApartmentHasLeasesError(
          'Nie można usunąć mieszkania z istniejącymi najmami. Najpierw usuń wszystkie najmy.'
        );
      }
      
      console.error('[ApartmentService.deleteApartment] Błąd usuwania mieszkania:', {
        apartmentId,
        error,
      });
      throw error;
    }

    return count !== null && count > 0;
  }

  /**
   * Pobiera podsumowanie mieszkania z metrykami finansowymi.
   * Tylko dla właścicieli.
   * 
   * @param apartmentId - UUID mieszkania
   * @returns Podsumowanie mieszkania lub null jeśli nie znaleziono
   * @throws {Error} - Jeśli wystąpi błąd zapytania do bazy
   */
  async getApartmentSummary(
    apartmentId: string
  ): Promise<ApartmentSummaryDTO | null> {
    const { data: apartment, error: aptError } = await this.supabase
      .from('apartments')
      .select(`
        id,
        name,
        address,
        leases!left (
          id,
          status,
          tenant:users!leases_tenant_id_fkey (
            full_name
          )
        )
      `)
      .eq('id', apartmentId)
      .eq('leases.status', 'active')
      .maybeSingle();

    if (aptError) {
      console.error('[ApartmentService.getApartmentSummary] Błąd pobierania mieszkania:', {
        apartmentId,
        error: aptError,
      });
      throw aptError;
    }

    if (!apartment) {
      return null;
    }

    let financialSummary: FinancialSummary = {
      total_unpaid: 0,
      total_partially_paid: 0,
      total_overdue: 0,
      upcoming_charges_count: 0
    };

    const activeLease = apartment.leases && Array.isArray(apartment.leases) && apartment.leases.length > 0 
      ? apartment.leases[0] 
      : null;

    if (activeLease) {
      const { data: charges } = await this.supabase
        .from('charges_with_status')
        .select('payment_status, remaining_amount, is_overdue, due_date')
        .eq('lease_id', activeLease.id);

      if (charges && charges.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        
        financialSummary = {
          total_unpaid: charges
            .filter(c => c.payment_status === 'unpaid')
            .reduce((sum, c) => sum + (c.remaining_amount || 0), 0),
          total_partially_paid: charges
            .filter(c => c.payment_status === 'partially_paid')
            .reduce((sum, c) => sum + (c.remaining_amount || 0), 0),
          total_overdue: charges
            .filter(c => c.is_overdue)
            .reduce((sum, c) => sum + (c.remaining_amount || 0), 0),
          upcoming_charges_count: charges
            .filter(c => c.due_date && c.due_date >= today && c.payment_status !== 'paid')
            .length
        };
      }
    }

    const summary: ApartmentSummaryDTO = {
      apartment: {
        id: apartment.id,
        name: apartment.name,
        address: apartment.address
      },
      lease: activeLease && activeLease.tenant ? {
        id: activeLease.id,
        status: activeLease.status,
        tenant: {
          full_name: activeLease.tenant.full_name
        }
      } : undefined,
      financial_summary: financialSummary
    };

    return summary;
  }
}


