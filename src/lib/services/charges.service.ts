import type { SupabaseClient } from "@/db/supabase.client";
import type {
  ChargesListDTO,
  ChargeListItemDTO,
  CreateChargeCommand,
  ChargeDetailsDTO,
  UpdateChargeCommand,
  UploadChargeAttachmentResponseDTO,
} from "@/types";

/**
 * ChargesService
 *
 * Serwis odpowiedzialny za operacje na opłatach (charges).
 * Implementuje logikę biznesową dla endpointów:
 * - GET /api/apartments/:id/charges
 * - POST /api/apartments/:id/charges
 * - GET /api/charges/:id
 * - PATCH /api/charges/:id
 * - DELETE /api/charges/:id
 * - POST /api/charges/:id/attachment
 * - DELETE /api/charges/:id/attachment
 */
export class ChargesService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Pobiera listę opłat dla mieszkania, pogrupowaną według miesięcy
   *
   * @param apartmentId - UUID mieszkania
   * @param filters - Opcjonalne filtry (lease_id, month, status, overdue)
   * @returns Lista opłat pogrupowana według miesięcy (YYYY-MM)
   *
   * @throws Error('APARTMENT_NOT_FOUND') - Mieszkanie nie istnieje
   * @throws Error('NO_ACTIVE_LEASE') - Brak aktywnego najmu
   * @throws Error('DATABASE_ERROR') - Błąd bazy danych
   */
  async getChargesForApartment(
    apartmentId: string,
    filters: {
      lease_id?: string;
      month?: string;
      status?: "unpaid" | "partially_paid" | "paid";
      overdue?: boolean;
    }
  ): Promise<ChargesListDTO> {
    console.log("[ChargesService.getChargesForApartment] Start:", {
      apartmentId,
      filters,
      timestamp: new Date().toISOString(),
    });

    // 1. Weryfikacja czy mieszkanie istnieje
    const { data: apartment, error: apartmentError } = await this.supabase
      .from("apartments")
      .select("id, owner_id")
      .eq("id", apartmentId)
      .single();

    if (apartmentError || !apartment) {
      console.error("[ChargesService.getChargesForApartment] Mieszkanie nie znalezione:", {
        apartmentId,
        error: apartmentError,
      });
      throw new Error("APARTMENT_NOT_FOUND");
    }

    // 2. Pobierz lease_id (z filtra lub aktywny najem)
    let leaseId = filters.lease_id;

    if (!leaseId) {
      const { data: lease, error: leaseError } = await this.supabase
        .from("leases")
        .select("id")
        .eq("apartment_id", apartmentId)
        .eq("status", "active")
        .single();

      if (leaseError || !lease) {
        console.error("[ChargesService.getChargesForApartment] Brak aktywnego najmu:", {
          apartmentId,
          error: leaseError,
        });
        throw new Error("NO_ACTIVE_LEASE");
      }

      leaseId = lease.id;
    }

    console.log("[ChargesService.getChargesForApartment] Znaleziono najem:", {
      leaseId,
    });

    // 3. Budowanie zapytania do charges_with_status
    let query = this.supabase.from("charges_with_status").select("*").eq("lease_id", leaseId);

    // Aplikowanie filtrów
    if (filters.month) {
      // Filtrowanie po miesiącu: due_date >= YYYY-MM-01 AND due_date < YYYY-(MM+1)-01
      query = query
        .filter("due_date", "gte", `${filters.month}-01`)
        .filter("due_date", "lt", `${this.getNextMonth(filters.month)}-01`);
    }

    if (filters.status) {
      query = query.eq("payment_status", filters.status);
    }

    if (filters.overdue !== undefined) {
      query = query.eq("is_overdue", filters.overdue);
    }

    // Sortowanie malejące po dacie wymagalności
    query = query.order("due_date", { ascending: false });

    const { data: charges, error: chargesError } = await query;

    if (chargesError) {
      console.error("[ChargesService.getChargesForApartment] Błąd pobierania opłat:", {
        error: chargesError,
      });
      throw new Error("DATABASE_ERROR");
    }

    console.log("[ChargesService.getChargesForApartment] Pobrano opłaty:", {
      count: charges?.length || 0,
    });

    // 4. Generowanie signed URLs dla załączników (równolegle)
    const chargesWithUrls = await Promise.all(
      (charges || []).map(async (charge) => {
        let attachment_url = null;

        if (charge.attachment_path) {
          const { data: signedUrl } = await this.supabase.storage
            .from("charge-attachments")
            .createSignedUrl(charge.attachment_path, 3600); // 1 godzina

          if (signedUrl) {
            attachment_url = signedUrl.signedUrl;
          }
        }

        // Usunięcie pól wewnętrznych
        const { created_by: _created_by, lease_id: _lease_id, ...chargeDto } = charge;

        return {
          ...chargeDto,
          attachment_url,
        } as ChargeListItemDTO;
      })
    );

    // 5. Grupowanie po miesiącach (YYYY-MM)
    const chargesByMonth: Record<string, ChargeListItemDTO[]> = {};

    for (const charge of chargesWithUrls) {
      const month = charge.due_date.substring(0, 7); // Wyciągamy YYYY-MM

      if (!chargesByMonth[month]) {
        chargesByMonth[month] = [];
      }

      chargesByMonth[month].push(charge);
    }

    console.log("[ChargesService.getChargesForApartment] Pogrupowano opłaty:", {
      monthsCount: Object.keys(chargesByMonth).length,
      months: Object.keys(chargesByMonth),
    });

    return { charges_by_month: chargesByMonth };
  }

  /**
   * Tworzy nową opłatę dla mieszkania
   *
   * @param apartmentId - UUID mieszkania
   * @param data - Dane opłaty (amount, due_date, type, comment)
   * @param userId - ID zalogowanego użytkownika (właściciela)
   * @returns Utworzona opłata z obliczonym statusem płatności
   *
   * @throws Error('APARTMENT_NOT_FOUND') - Mieszkanie nie istnieje
   * @throws Error('FORBIDDEN') - User nie jest właścicielem
   * @throws Error('NO_ACTIVE_LEASE') - Brak aktywnego najmu
   * @throws Error('DATABASE_ERROR') - Błąd bazy danych
   */
  async createCharge(apartmentId: string, data: CreateChargeCommand, userId: string): Promise<ChargeListItemDTO> {
    console.log("[ChargesService.createCharge] Start:", {
      apartmentId,
      userId,
      data,
      timestamp: new Date().toISOString(),
    });

    // 1. Weryfikacja że mieszkanie istnieje i user jest właścicielem
    const { data: apartment, error: apartmentError } = await this.supabase
      .from("apartments")
      .select("id, owner_id")
      .eq("id", apartmentId)
      .single();

    if (apartmentError || !apartment) {
      console.error("[ChargesService.createCharge] Mieszkanie nie znalezione:", {
        apartmentId,
        error: apartmentError,
      });
      throw new Error("APARTMENT_NOT_FOUND");
    }

    // Dodatkowa weryfikacja ownership
    if (apartment.owner_id !== userId) {
      console.error("[ChargesService.createCharge] User nie jest właścicielem:", {
        apartmentId,
        userId,
        ownerId: apartment.owner_id,
      });
      throw new Error("FORBIDDEN");
    }

    // 2. Pobranie aktywnego najmu
    const { data: lease, error: leaseError } = await this.supabase
      .from("leases")
      .select("id")
      .eq("apartment_id", apartmentId)
      .eq("status", "active")
      .single();

    if (leaseError || !lease) {
      console.error("[ChargesService.createCharge] Brak aktywnego najmu:", {
        apartmentId,
        error: leaseError,
      });
      throw new Error("NO_ACTIVE_LEASE");
    }

    console.log("[ChargesService.createCharge] Znaleziono najem:", {
      leaseId: lease.id,
    });

    // 3. Wstawienie nowej opłaty
    const { data: insertedCharge, error: insertError } = await this.supabase
      .from("charges")
      .insert({
        lease_id: lease.id,
        amount: data.amount,
        due_date: data.due_date,
        type: data.type,
        comment: data.comment || null,
        created_by: userId,
      })
      .select("id")
      .single();

    if (insertError || !insertedCharge) {
      console.error("[ChargesService.createCharge] Błąd tworzenia opłaty:", {
        error: insertError,
      });
      throw new Error("DATABASE_ERROR");
    }

    console.log("[ChargesService.createCharge] Utworzono opłatę:", {
      chargeId: insertedCharge.id,
    });

    // 4. Pobranie utworzonej opłaty z charges_with_status (computed fields)
    const { data: createdCharge, error: fetchError } = await this.supabase
      .from("charges_with_status")
      .select("*")
      .eq("id", insertedCharge.id)
      .single();

    if (fetchError || !createdCharge) {
      console.error("[ChargesService.createCharge] Błąd pobierania utworzonej opłaty:", {
        chargeId: insertedCharge.id,
        error: fetchError,
      });
      throw new Error("DATABASE_ERROR");
    }

    // 5. Usunięcie pól wewnętrznych
    const { created_by: _created_by, lease_id: _lease_id, ...chargeDto } = createdCharge;

    return {
      ...chargeDto,
      attachment_url: null, // Brak załącznika przy utworzeniu
    } as ChargeListItemDTO;
  }

  /**
   * Pobiera szczegółowe informacje o opłacie wraz z listą wpłat
   *
   * @param chargeId - UUID opłaty
   * @returns Szczegóły opłaty z listą wpłat
   *
   * @throws Error('CHARGE_NOT_FOUND') - Opłata nie istnieje lub brak dostępu (RLS)
   * @throws Error('DATABASE_ERROR') - Błąd bazy danych
   */
  async getChargeById(chargeId: string): Promise<ChargeDetailsDTO> {
    console.log("[ChargesService.getChargeById] Start:", {
      chargeId,
      timestamp: new Date().toISOString(),
    });

    // 1. Pobranie opłaty z charges_with_status
    const { data: charge, error: chargeError } = await this.supabase
      .from("charges_with_status")
      .select("*")
      .eq("id", chargeId)
      .single();

    if (chargeError || !charge) {
      console.error("[ChargesService.getChargeById] Opłata nie znaleziona:", {
        chargeId,
        error: chargeError,
      });
      throw new Error("CHARGE_NOT_FOUND");
    }

    console.log("[ChargesService.getChargeById] Znaleziono opłatę:", {
      chargeId: charge.id,
      paymentStatus: charge.payment_status,
    });

    // 2. Generowanie signed URL dla załącznika
    let attachment_url = null;
    if (charge.attachment_path) {
      const { data: signedUrl } = await this.supabase.storage
        .from("charge-attachments")
        .createSignedUrl(charge.attachment_path, 3600); // 1 godzina

      if (signedUrl) {
        attachment_url = signedUrl.signedUrl;
      }
    }

    // 3. Pobranie wpłat dla opłaty
    const { data: payments, error: paymentsError } = await this.supabase
      .from("payments")
      .select("*")
      .eq("charge_id", chargeId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (paymentsError) {
      console.error("[ChargesService.getChargeById] Błąd pobierania wpłat:", {
        chargeId,
        error: paymentsError,
      });
      throw new Error("DATABASE_ERROR");
    }

    console.log("[ChargesService.getChargeById] Pobrano wpłaty:", {
      chargeId,
      paymentsCount: payments?.length || 0,
    });

    // 4. Złożenie danych
    const { created_by: _created_by, lease_id: _lease_id, ...chargeDto } = charge;

    return {
      ...chargeDto,
      attachment_url,
      payments: payments || [],
    } as ChargeDetailsDTO;
  }

  /**
   * Aktualizuje dane opłaty (partial update)
   *
   * @param chargeId - UUID opłaty
   * @param data - Dane do aktualizacji (amount, due_date, type, comment)
   * @returns Zaktualizowana opłata
   *
   * @throws Error('CHARGE_NOT_FOUND') - Opłata nie istnieje lub brak dostępu
   * @throws Error('CHARGE_FULLY_PAID') - Nie można edytować w pełni opłaconej opłaty (DB trigger)
   * @throws Error('AMOUNT_TOO_LOW') - Kwota niższa niż suma wpłat (DB trigger)
   * @throws Error('DATABASE_ERROR') - Błąd bazy danych
   */
  async updateCharge(chargeId: string, data: UpdateChargeCommand): Promise<ChargeListItemDTO> {
    console.log("[ChargesService.updateCharge] Start:", {
      chargeId,
      data,
      timestamp: new Date().toISOString(),
    });

    // 1. Budowanie obiektu aktualizacji (tylko podane pola)

    const updateData: Record<string, unknown> = {};
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.due_date !== undefined) updateData.due_date = data.due_date;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.comment !== undefined) updateData.comment = data.comment;

    console.log("[ChargesService.updateCharge] Dane do aktualizacji:", {
      chargeId,
      fieldsToUpdate: Object.keys(updateData),
    });

    // 2. Aktualizacja opłaty
    const { error: updateError } = await this.supabase.from("charges").update(updateData).eq("id", chargeId);

    if (updateError) {
      console.error("[ChargesService.updateCharge] Błąd aktualizacji:", {
        chargeId,
        error: updateError,
      });

      // Sprawdzenie naruszenia reguł biznesowych (DB triggers)
      if (updateError.message?.includes("Cannot edit a fully paid charge")) {
        throw new Error("CHARGE_FULLY_PAID");
      }
      if (updateError.message?.includes("cannot be less than total payments")) {
        throw new Error("AMOUNT_TOO_LOW");
      }

      throw new Error("DATABASE_ERROR");
    }

    // 3. Pobranie zaktualizowanej opłaty z charges_with_status
    const { data: updatedCharge, error: fetchError } = await this.supabase
      .from("charges_with_status")
      .select("*")
      .eq("id", chargeId)
      .single();

    if (fetchError || !updatedCharge) {
      console.error("[ChargesService.updateCharge] Błąd pobierania zaktualizowanej opłaty:", {
        chargeId,
        error: fetchError,
      });
      throw new Error("CHARGE_NOT_FOUND");
    }

    console.log("[ChargesService.updateCharge] Opłata zaktualizowana:", {
      chargeId,
      updatedFields: Object.keys(updateData),
    });

    // 4. Generowanie signed URL dla załącznika
    let attachment_url = null;
    if (updatedCharge.attachment_path) {
      const { data: signedUrl } = await this.supabase.storage
        .from("charge-attachments")
        .createSignedUrl(updatedCharge.attachment_path, 3600);
      if (signedUrl) attachment_url = signedUrl.signedUrl;
    }

    // 5. Usunięcie pól wewnętrznych
    const { created_by: _created_by, lease_id: _lease_id, ...chargeDto } = updatedCharge;

    return { ...chargeDto, attachment_url } as ChargeListItemDTO;
  }

  /**
   * Usuwa opłatę wraz z załącznikiem
   *
   * @param chargeId - UUID opłaty
   *
   * @throws Error('CHARGE_NOT_FOUND') - Opłata nie istnieje lub brak dostępu
   * @throws Error('CANNOT_DELETE_PAID_CHARGE') - Nie można usunąć w pełni opłaconej opłaty
   * @throws Error('DATABASE_ERROR') - Błąd bazy danych
   */
  async deleteCharge(chargeId: string): Promise<void> {
    console.log("[ChargesService.deleteCharge] Start:", {
      chargeId,
      timestamp: new Date().toISOString(),
    });

    // 1. Pobranie opłaty (weryfikacja dostępu + attachment_path)
    const { data: charge, error: fetchError } = await this.supabase
      .from("charges_with_status")
      .select("id, attachment_path, payment_status")
      .eq("id", chargeId)
      .single();

    if (fetchError || !charge) {
      console.error("[ChargesService.deleteCharge] Opłata nie znaleziona:", {
        chargeId,
        error: fetchError,
      });
      throw new Error("CHARGE_NOT_FOUND");
    }

    console.log("[ChargesService.deleteCharge] Znaleziono opłatę:", {
      chargeId: charge.id,
      paymentStatus: charge.payment_status,
      hasAttachment: !!charge.attachment_path,
    });

    // 2. Reguła biznesowa: nie można usunąć w pełni opłaconej opłaty
    if (charge.payment_status === "paid") {
      console.error("[ChargesService.deleteCharge] Próba usunięcia opłaconej opłaty:", {
        chargeId,
        paymentStatus: charge.payment_status,
      });
      throw new Error("CANNOT_DELETE_PAID_CHARGE");
    }

    // 3. Usunięcie załącznika z Storage (jeśli istnieje)
    if (charge.attachment_path) {
      const { error: deleteStorageError } = await this.supabase.storage
        .from("charge-attachments")
        .remove([charge.attachment_path]);

      if (deleteStorageError) {
        console.warn(
          `[ChargesService.deleteCharge] Błąd usuwania załącznika dla opłaty ${chargeId}:`,
          deleteStorageError
        );
        // Kontynuujemy z DELETE z bazy nawet jeśli Storage delete fails
      } else {
        console.log("[ChargesService.deleteCharge] Usunięto załącznik:", {
          chargeId,
          attachmentPath: charge.attachment_path,
        });
      }
    }

    // 4. Usunięcie opłaty z bazy (CASCADE usuwa payments)
    const { error: deleteError } = await this.supabase.from("charges").delete().eq("id", chargeId);

    if (deleteError) {
      console.error("[ChargesService.deleteCharge] Błąd usuwania opłaty:", {
        chargeId,
        error: deleteError,
      });
      throw new Error("DATABASE_ERROR");
    }

    console.log("[ChargesService.deleteCharge] Opłata usunięta:", {
      chargeId,
    });

    // Success - no return value (204 No Content)
  }

  /**
   * Dodaje załącznik do opłaty
   *
   * @param chargeId - UUID opłaty
   * @param file - Plik do przesłania
   * @returns Dane załącznika z signed URL
   *
   * @throws Error('NO_FILE_UPLOADED') - Nie przesłano pliku
   * @throws Error('INVALID_FILE_TYPE') - Nieprawidłowy typ pliku
   * @throws Error('FILE_TOO_LARGE') - Plik przekracza 5MB
   * @throws Error('CHARGE_NOT_FOUND') - Opłata nie istnieje lub brak dostępu
   * @throws Error('STORAGE_UPLOAD_ERROR') - Błąd uploadu do Storage
   * @throws Error('DATABASE_ERROR') - Błąd bazy danych
   */
  async uploadAttachment(chargeId: string, file: File): Promise<UploadChargeAttachmentResponseDTO> {
    console.log("[ChargesService.uploadAttachment] Start:", {
      chargeId,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      timestamp: new Date().toISOString(),
    });

    // 1. Walidacja pliku (importujemy funkcję pomocniczą)
    const { validateAttachmentFile } = await import("@/lib/utils/file-validation");
    const validation = validateAttachmentFile(file);
    if (!validation.valid) {
      console.error("[ChargesService.uploadAttachment] Walidacja pliku nieudana:", {
        chargeId,
        error: validation.error,
      });
      throw new Error(validation.error);
    }

    console.log("[ChargesService.uploadAttachment] Plik zwalidowany:", {
      chargeId,
      extension: validation.extension,
    });

    // 2. Pobranie opłaty i apartment_id
    const { data: charge, error: fetchError } = await this.supabase
      .from("charges")
      .select(
        `
        id,
        attachment_path,
        lease:leases!inner(
          apartment:apartments!inner(id)
        )
      `
      )
      .eq("id", chargeId)
      .single();

    if (fetchError || !charge) {
      console.error("[ChargesService.uploadAttachment] Opłata nie znaleziona:", {
        chargeId,
        error: fetchError,
      });
      throw new Error("CHARGE_NOT_FOUND");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apartmentId = (charge.lease as any).apartment.id;

    console.log("[ChargesService.uploadAttachment] Znaleziono opłatę:", {
      chargeId,
      apartmentId,
      hasOldAttachment: !!charge.attachment_path,
    });

    // 3. Usunięcie starego załącznika (jeśli istnieje)
    if (charge.attachment_path) {
      await this.supabase.storage.from("charge-attachments").remove([charge.attachment_path]);
      // Ignorujemy błędy - czyszczenie starego pliku jest non-critical
      console.log("[ChargesService.uploadAttachment] Usunięto stary załącznik:", {
        chargeId,
        oldPath: charge.attachment_path,
      });
    }

    // 4. Generowanie ścieżki pliku
    const filePath = `${apartmentId}/${chargeId}.${validation.extension}`;

    console.log("[ChargesService.uploadAttachment] Ścieżka pliku:", {
      chargeId,
      filePath,
    });

    // 5. Upload do Storage
    const { error: uploadError } = await this.supabase.storage.from("charge-attachments").upload(filePath, file, {
      contentType: file.type,
      upsert: true, // Zastąp jeśli istnieje
    });

    if (uploadError) {
      console.error("[ChargesService.uploadAttachment] Błąd uploadu do Storage:", {
        chargeId,
        filePath,
        error: uploadError,
      });
      throw new Error("STORAGE_UPLOAD_ERROR");
    }

    console.log("[ChargesService.uploadAttachment] Plik przesłany do Storage:", {
      chargeId,
      filePath,
    });

    // 6. Aktualizacja attachment_path w bazie
    const { error: updateError } = await this.supabase
      .from("charges")
      .update({ attachment_path: filePath })
      .eq("id", chargeId);

    if (updateError) {
      console.error("[ChargesService.uploadAttachment] Błąd aktualizacji attachment_path:", {
        chargeId,
        error: updateError,
      });
      // Próba czyszczenia przesłanego pliku
      await this.supabase.storage.from("charge-attachments").remove([filePath]);
      throw new Error("DATABASE_ERROR");
    }

    // 7. Generowanie signed URL
    const { data: signedUrl } = await this.supabase.storage.from("charge-attachments").createSignedUrl(filePath, 3600);

    if (!signedUrl) {
      console.error("[ChargesService.uploadAttachment] Błąd generowania signed URL:", {
        chargeId,
        filePath,
      });
      throw new Error("FAILED_TO_GENERATE_URL");
    }

    console.log("[ChargesService.uploadAttachment] Załącznik dodany:", {
      chargeId,
      filePath,
    });

    return {
      id: chargeId,
      attachment_path: filePath,
      attachment_url: signedUrl.signedUrl,
    };
  }

  /**
   * Usuwa załącznik z opłaty
   *
   * @param chargeId - UUID opłaty
   *
   * @throws Error('CHARGE_NOT_FOUND') - Opłata nie istnieje lub brak dostępu
   * @throws Error('NO_ATTACHMENT') - Brak załącznika do usunięcia
   * @throws Error('DATABASE_ERROR') - Błąd bazy danych
   */
  async deleteAttachment(chargeId: string): Promise<void> {
    console.log("[ChargesService.deleteAttachment] Start:", {
      chargeId,
      timestamp: new Date().toISOString(),
    });

    // 1. Pobranie opłaty (weryfikacja dostępu + attachment_path)
    const { data: charge, error: fetchError } = await this.supabase
      .from("charges")
      .select("id, attachment_path")
      .eq("id", chargeId)
      .single();

    if (fetchError || !charge) {
      console.error("[ChargesService.deleteAttachment] Opłata nie znaleziona:", {
        chargeId,
        error: fetchError,
      });
      throw new Error("CHARGE_NOT_FOUND");
    }

    // 2. Sprawdzenie czy załącznik istnieje
    if (!charge.attachment_path) {
      console.error("[ChargesService.deleteAttachment] Brak załącznika:", {
        chargeId,
      });
      throw new Error("NO_ATTACHMENT");
    }

    console.log("[ChargesService.deleteAttachment] Znaleziono załącznik:", {
      chargeId,
      attachmentPath: charge.attachment_path,
    });

    // 3. Usunięcie pliku z Storage
    const { error: deleteStorageError } = await this.supabase.storage
      .from("charge-attachments")
      .remove([charge.attachment_path]);

    if (deleteStorageError) {
      console.warn(`[ChargesService.deleteAttachment] Błąd usuwania z Storage:`, deleteStorageError);
      // Kontynuujemy z UPDATE bazy nawet jeśli Storage delete fails
    } else {
      console.log("[ChargesService.deleteAttachment] Usunięto z Storage:", {
        chargeId,
        attachmentPath: charge.attachment_path,
      });
    }

    // 4. Aktualizacja attachment_path = null w bazie
    const { error: updateError } = await this.supabase
      .from("charges")
      .update({ attachment_path: null })
      .eq("id", chargeId);

    if (updateError) {
      console.error("[ChargesService.deleteAttachment] Błąd aktualizacji bazy:", {
        chargeId,
        error: updateError,
      });
      throw new Error("DATABASE_ERROR");
    }

    console.log("[ChargesService.deleteAttachment] Załącznik usunięty:", {
      chargeId,
    });

    // Success - no return value (204 No Content)
  }

  /**
   * Funkcja pomocnicza do obliczenia następnego miesiąca
   *
   * @param month - Miesiąc w formacie YYYY-MM
   * @returns Następny miesiąc w formacie YYYY-MM
   *
   * @example
   * getNextMonth('2025-01') // => '2025-02'
   * getNextMonth('2025-12') // => '2026-01'
   */
  private getNextMonth(month: string): string {
    const [year, monthNum] = month.split("-").map(Number);
    const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
    const nextYear = monthNum === 12 ? year + 1 : year;
    return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
  }
}
