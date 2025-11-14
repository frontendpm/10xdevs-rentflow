import { Button } from "@/components/ui/button";

interface DashboardEmptyStateProps {
  title: string;
  description?: string;
  actionLabel: string;
  actionHref: string;
}

/**
 * Stan pustej listy mieszkań na dashboardzie właściciela
 */
export function DashboardEmptyState({
  title,
  description,
  actionLabel,
  actionHref,
}: DashboardEmptyStateProps) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 px-6 py-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
      <div className="mx-auto max-w-md">
        <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
          {title}
        </h3>
        {description && (
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            {description}
          </p>
        )}
        <div className="mt-6">
          <Button asChild>
            <a href={actionHref}>{actionLabel}</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

