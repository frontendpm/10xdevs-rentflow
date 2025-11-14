import { DashboardEmptyState } from "./dashboard-empty-state";
import { ApartmentList } from "./apartment-list";
import type { OwnerDashboardViewModel } from "./types";

interface OwnerDashboardContentProps {
  viewModel: OwnerDashboardViewModel;
}

/**
 * Zawartość dashboardu właściciela
 * Wybiera między pustym stanem a listą mieszkań
 */
export function OwnerDashboardContent({ viewModel }: OwnerDashboardContentProps) {
  if (!viewModel.hasApartments) {
    return (
      <DashboardEmptyState
        title="Nie dodałeś jeszcze żadnych mieszkań"
        description="Dodaj swoje pierwsze mieszkanie, aby zacząć korzystać z Rentflow."
        actionLabel="Dodaj swoje pierwsze mieszkanie"
        actionHref="/apartments/new"
      />
    );
  }

  return <ApartmentList apartments={viewModel.apartments} />;
}

