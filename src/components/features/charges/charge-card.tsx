import type { ChargeListItemDTO } from "@/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/card";
import ChargeStatusBadge from "./charge-status-badge";
import { FileText, Paperclip } from "lucide-react";

interface ChargeCardProps {
  charge: ChargeListItemDTO;
  readOnly?: boolean;
}

// Mapowanie typów opłat na polskie nazwy
const chargeTypeLabels: Record<string, string> = {
  rent: "Czynsz",
  bill: "Rachunek",
  other: "Inne",
};

// Formatowanie daty w formacie DD.MM.YYYY
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

// Formatowanie kwoty w PLN
function formatAmount(amount: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function ChargeCard({ charge, readOnly = false }: ChargeCardProps) {
  // Guard clause - sprawdzenie wymaganych pól
  if (!charge.id || !charge.due_date || charge.amount === null || !charge.type) {
    return null;
  }

  const handleClick = () => {
    // Przekierowanie do szczegółów opłaty
    if (!readOnly) {
      window.location.href = `/charges/${charge.id}`;
    }
  };

  return (
    <Card
      className={`transition-all ${
        !readOnly
          ? "cursor-pointer hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-700"
          : ""
      }`}
      onClick={handleClick}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
              {chargeTypeLabels[charge.type] || charge.type}
            </CardTitle>
            <CardDescription className="mt-1">
              Termin płatności: {formatDate(charge.due_date)}
            </CardDescription>
          </div>
          <CardAction>
            <ChargeStatusBadge charge={charge} />
          </CardAction>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">Kwota:</span>
          <span className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {formatAmount(charge.amount)}
          </span>
        </div>

        {charge.payment_status !== "unpaid" && charge.total_paid !== null && (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Wpłacono:</span>
              <span className="text-sm font-medium text-green-600 dark:text-green-500">
                {formatAmount(charge.total_paid)}
              </span>
            </div>

            {charge.payment_status === "partially_paid" && charge.remaining_amount !== null && (
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">Pozostało:</span>
                <span className="text-sm font-medium text-orange-600 dark:text-orange-500">
                  {formatAmount(charge.remaining_amount)}
                </span>
              </div>
            )}
          </>
        )}

        {charge.comment && (
          <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{charge.comment}</p>
          </div>
        )}

        {charge.attachment_url && (
          <div className="pt-2 flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            <Paperclip className="h-4 w-4" />
            <span>Załącznik dostępny</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
