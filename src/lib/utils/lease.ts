import type { ApartmentDetailsDTO } from "@/types";

/**
 * Sprawdza czy mieszkanie ma aktywny najem
 *
 * @param apartment - Szczegóły mieszkania
 * @returns true jeśli najem istnieje i ma status "active", false w przeciwnym razie
 */
export function hasActiveLease(apartment: ApartmentDetailsDTO): boolean {
  return Boolean(apartment.lease && apartment.lease.status === "active");
}

/**
 * Sprawdza czy mieszkanie ma jakikolwiek najem (aktywny lub archiwalny)
 *
 * @param apartment - Szczegóły mieszkania
 * @returns true jeśli najem istnieje, false w przeciwnym razie
 */
export function hasAnyLease(apartment: ApartmentDetailsDTO): boolean {
  return Boolean(apartment.lease);
}
