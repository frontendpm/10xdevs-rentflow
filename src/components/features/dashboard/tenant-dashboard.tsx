import type { DashboardTenantDTO } from '@/types';
import { useTenantDashboardViewModel } from './useTenantDashboardViewModel';
import { TenantSummaryCard } from './tenant-summary-card';
import { TenantDashboardSections } from './tenant-dashboard-sections';

interface TenantDashboardIslandProps {
  dashboard: DashboardTenantDTO;
}

/**
 * Główny kontener React dla widoku dashboardu lokatora
 * Przyjmuje surowy DashboardTenantDTO, mapuje na ViewModel
 * i deleguje renderowanie do komponentów prezentacyjnych
 */
export function TenantDashboardIsland({ dashboard }: TenantDashboardIslandProps) {
  const viewModel = useTenantDashboardViewModel(dashboard);

  // Guard clause - brak danych mieszkania
  if (!viewModel.apartmentId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950">
        <p className="text-lg font-semibold text-amber-900 dark:text-amber-100">
          Brak aktywnego najmu
        </p>
        <p className="mt-2 text-amber-700 dark:text-amber-300">
          Najem dla tego mieszkania został zakończony. Skontaktuj się z właścicielem.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <TenantSummaryCard
        apartmentName={viewModel.apartmentName}
        apartmentAddress={viewModel.apartmentAddress}
        ownerName={viewModel.ownerName}
        totalDueLabel={viewModel.totalDueLabel}
        hasOverdue={viewModel.hasOverdue}
      />
      <TenantDashboardSections cards={viewModel.navCards} />
    </div>
  );
}
