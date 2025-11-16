import type { DashboardOwnerDTO } from "@/types";
import { useOwnerDashboardViewModel } from "./useOwnerDashboardViewModel";
import { OwnerDashboardHeader } from "./owner-dashboard-header";
import { OwnerDashboardContent } from "./owner-dashboard-content";

interface OwnerDashboardIslandProps {
  dashboard: DashboardOwnerDTO;
}

/**
 * Główny kontener React dla widoku dashboardu właściciela
 * Przyjmuje surowy DashboardOwnerDTO, mapuje na ViewModel
 * i deleguje renderowanie do komponentów prezentacyjnych
 */
export function OwnerDashboardIsland({ dashboard }: OwnerDashboardIslandProps) {
  const viewModel = useOwnerDashboardViewModel(dashboard);

  return (
    <div className="space-y-8">
      <OwnerDashboardHeader />
      <OwnerDashboardContent viewModel={viewModel} />
    </div>
  );
}
