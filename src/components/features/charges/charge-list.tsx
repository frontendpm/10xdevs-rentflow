import type { ChargeListItemDTO } from "@/types";
import ChargeCard from "./charge-card";

interface ChargeListProps {
  chargesByMonth: Record<string, ChargeListItemDTO[]>;
  readOnly?: boolean;
}

// Formatowanie nazwy miesiąca z "YYYY-MM" na "Miesiąc YYYY"
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const monthNames = [
    "Styczeń",
    "Luty",
    "Marzec",
    "Kwiecień",
    "Maj",
    "Czerwiec",
    "Lipiec",
    "Sierpień",
    "Wrzesień",
    "Październik",
    "Listopad",
    "Grudzień",
  ];

  const monthIndex = parseInt(month, 10) - 1;
  const monthName = monthNames[monthIndex] || month;

  return `${monthName} ${year}`;
}

// Sortowanie kluczy miesięcy malejąco (najnowsze na górze)
function sortMonthKeys(monthKeys: string[]): string[] {
  return monthKeys.sort((a, b) => {
    // Porównanie w formacie YYYY-MM (sortowanie leksykograficzne działa poprawnie)
    return b.localeCompare(a);
  });
}

export default function ChargeList({ chargesByMonth, readOnly = false }: ChargeListProps) {
  const monthKeys = Object.keys(chargesByMonth);
  const sortedMonthKeys = sortMonthKeys(monthKeys);

  if (sortedMonthKeys.length === 0) {
    return null;
  }

  return (
    <div className="space-y-8">
      {sortedMonthKeys.map((monthKey) => {
        const charges = chargesByMonth[monthKey];

        // Sortowanie opłat w ramach miesiąca po dacie wymagalności (malejąco)
        const sortedCharges = [...charges].sort((a, b) => {
          // Jeśli brak daty, przenieś na koniec
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
        });

        return (
          <div key={monthKey} className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {formatMonthLabel(monthKey)}
            </h3>
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
              {sortedCharges.map((charge) => (
                <ChargeCard key={charge.id} charge={charge} readOnly={readOnly} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
