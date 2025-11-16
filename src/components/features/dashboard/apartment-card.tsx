import { Card } from "@/components/ui/card";
import type { OwnerDashboardApartmentCardVM } from "./types";

interface ApartmentCardProps {
  apartment: OwnerDashboardApartmentCardVM;
}

/**
 * Karta mieszkania na dashboardzie właściciela
 * W całości klikalna, prowadzi do szczegółów mieszkania
 */
export function ApartmentCard({ apartment }: ApartmentCardProps) {
  return (
    <a
      href={apartment.href}
      className="group block transition-transform hover:-translate-y-1"
      data-astro-transition={`apartment-${apartment.id}`}
    >
      <Card className="h-full p-6 transition-shadow hover:shadow-md">
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors">
              {apartment.name}
            </h3>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{apartment.address}</p>
          </div>

          <div className="mt-2 flex flex-col gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Status:</span>
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                {apartment.tenantStatusLabel}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Finanse:</span>
              <span
                className={`text-sm font-semibold ${
                  apartment.isOverdue ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-neutral-50"
                }`}
              >
                {apartment.balanceLabel}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </a>
  );
}
