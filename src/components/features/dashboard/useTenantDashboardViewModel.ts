import { Receipt, ClipboardList, ClipboardCheck } from "lucide-react";
import type { DashboardTenantDTO } from "@/types";
import type { TenantDashboardViewModel, TenantDashboardNavCardVM } from "./types";

/**
 * Formatuje kwotę pieniężną do postaci tekstowej z polskim formatowaniem
 * @param amount - kwota do sformatowania
 * @returns sformatowana kwota (np. "2 000" dla 2000)
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Hook/funkcja mapująca DashboardTenantDTO na TenantDashboardViewModel
 *
 * Przekształca surowe dane z API na format gotowy do wyświetlenia:
 * - Formatuje kwotę do zapłaty
 * - Określa czy są przeterminowane płatności
 * - Buduje karty nawigacyjne z odpowiednimi URL-ami
 *
 * @param dashboard - DTO z danymi dashboardu lokatora
 * @returns ViewModel gotowy do renderowania
 */
export function useTenantDashboardViewModel(dashboard: DashboardTenantDTO): TenantDashboardViewModel {
  // Defensywne pobranie danych z DTO
  const apartment = dashboard.apartment || {
    id: "",
    name: "Nieznane mieszkanie",
    address: "",
    owner: { id: "", full_name: "Nieznany właściciel", email: "" },
  };

  const financialSummary = dashboard.financial_summary || {
    total_due: 0,
    total_overdue: 0,
    upcoming_charges: [],
  };

  // Wyliczenie wartości finansowych
  const totalDue = Math.max(0, financialSummary.total_due);
  const totalOverdue = Math.max(0, financialSummary.total_overdue);
  const hasOverdue = totalOverdue > 0;

  // Formatowanie etykiety kwoty do zapłaty
  const formattedAmount = formatCurrency(totalDue);
  const totalDueLabel = `Łącznie do zapłaty: ${formattedAmount} zł`;

  // Budowanie kart nawigacyjnych
  const navCards: TenantDashboardNavCardVM[] = [
    {
      title: "Lista opłat",
      description: "Zobacz wszystkie swoje opłaty i ich statusy",
      href: `/apartments/${apartment.id}`,
      icon: Receipt,
    },
    {
      title: "Protokół Odbioru",
      description: "Dokumentacja stanu mieszkania przy odbiorze",
      href: `/apartments/${apartment.id}#protokol-odbioru`,
      icon: ClipboardList,
    },
    {
      title: "Protokół Zwrotu",
      description: "Dokumentacja stanu mieszkania przy zwrocie",
      href: `/apartments/${apartment.id}#protokol-zwrotu`,
      icon: ClipboardCheck,
    },
  ];

  return {
    apartmentId: apartment.id,
    apartmentName: apartment.name,
    apartmentAddress: apartment.address,
    ownerName: apartment.owner.full_name,
    totalDue,
    totalOverdue,
    totalDueLabel,
    hasOverdue,
    navCards,
  };
}
