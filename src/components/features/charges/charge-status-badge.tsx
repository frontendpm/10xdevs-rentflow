import type { ChargeListItemDTO } from "@/types";
import { Badge } from "@/components/ui/badge";

interface ChargeStatusBadgeProps {
  charge: ChargeListItemDTO;
}

export default function ChargeStatusBadge({ charge }: ChargeStatusBadgeProps) {
  // Logika określania statusu i stylu badge'a
  if (charge.is_overdue) {
    return (
      <Badge variant="destructive" className="bg-red-500 dark:bg-red-600">
        Po terminie
      </Badge>
    );
  }

  if (charge.payment_status === "paid") {
    return (
      <Badge variant="default" className="bg-green-600 dark:bg-green-700 text-white">
        Opłacone
      </Badge>
    );
  }

  if (charge.payment_status === "partially_paid") {
    return (
      <Badge variant="outline" className="border-orange-500 text-orange-700 dark:text-orange-400">
        Częściowo opłacone
      </Badge>
    );
  }

  // payment_status === "unpaid"
  return (
    <Badge variant="outline" className="border-neutral-400 text-neutral-700 dark:text-neutral-400">
      Do opłacenia
    </Badge>
  );
}
