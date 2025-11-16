import { Button } from "@/components/ui/button";

/**
 * Nagłówek dashboardu właściciela z tytułem i przyciskiem CTA
 */
export function OwnerDashboardHeader() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">Twoje mieszkania</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Zarządzaj swoimi mieszkaniami i monitoruj płatności
        </p>
      </div>
      <Button asChild>
        <a href="/apartments/new">Dodaj mieszkanie</a>
      </Button>
    </div>
  );
}
