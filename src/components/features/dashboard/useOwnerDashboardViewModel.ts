import type { DashboardOwnerDTO } from '@/types';
import type { OwnerDashboardViewModel, OwnerDashboardApartmentCardVM } from './types';

/**
 * Hook/funkcja mapująca DashboardOwnerDTO na OwnerDashboardViewModel
 * 
 * Przekształca surowe dane z API na format gotowy do wyświetlenia:
 * - Wylicza etykiety statusu lokatora
 * - Formatuje saldo
 * - Określa czy są przeterminowane płatności
 * - Generuje ścieżki nawigacji
 * 
 * @param dashboard - DTO z danymi dashboardu właściciela
 * @returns ViewModel gotowy do renderowania
 */
export function useOwnerDashboardViewModel(dashboard: DashboardOwnerDTO): OwnerDashboardViewModel {
  const apartments: OwnerDashboardApartmentCardVM[] = (dashboard.apartments || []).map((apartment) => {
    // Wyliczenie statusu lokatora
    const tenantStatusLabel =
      apartment.lease_status === 'active' && apartment.tenant
        ? `Lokator: ${apartment.tenant.full_name}`
        : 'Oczekuje na lokatora';

    // Wyliczenie całkowitego zadłużenia
    const totalDue = apartment.financial_summary.total_unpaid + apartment.financial_summary.total_overdue;

    // Formatowanie salda
    const balanceLabel = totalDue === 0 ? 'Saldo: 0 zł' : `Saldo: -${totalDue.toFixed(2)} zł`;

    // Sprawdzenie czy są przeterminowane kwoty
    const isOverdue = apartment.financial_summary.total_overdue > 0;

    return {
      id: apartment.id,
      name: apartment.name,
      address: apartment.address,
      tenantStatusLabel,
      balanceLabel,
      isOverdue,
      href: `/apartments/${apartment.id}`,
    };
  });

  return {
    apartments,
    hasApartments: apartments.length > 0,
  };
}

