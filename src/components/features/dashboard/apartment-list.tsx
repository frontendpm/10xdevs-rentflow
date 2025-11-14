import { ApartmentCard } from "./apartment-card";
import type { OwnerDashboardApartmentCardVM } from "./types";

interface ApartmentListProps {
  apartments: OwnerDashboardApartmentCardVM[];
}

/**
 * Lista mieszkań w formie responsywnej siatki kart
 */
export function ApartmentList({ apartments }: ApartmentListProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {apartments.map((apartment) => (
        <ApartmentCard key={apartment.id} apartment={apartment} />
      ))}
    </div>
  );
}

