import type { TenantDashboardNavCardVM } from "./types";
import { DashboardNavCard } from "./dashboard-nav-card";

interface TenantDashboardSectionsProps {
  cards: TenantDashboardNavCardVM[];
}

/**
 * Sekcja zawierająca karty nawigacyjne dla lokatora
 * Wyświetla listę opłat, protokół odbioru i protokół zwrotu
 */
export function TenantDashboardSections({ cards }: TenantDashboardSectionsProps) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">Przejdź do sekcji</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <DashboardNavCard
            key={card.title}
            title={card.title}
            description={card.description}
            href={card.href}
            icon={card.icon}
          />
        ))}
      </div>
    </section>
  );
}
