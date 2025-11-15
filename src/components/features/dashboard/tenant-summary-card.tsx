import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, User, AlertTriangle } from 'lucide-react';

interface TenantSummaryCardProps {
  apartmentName: string;
  apartmentAddress: string;
  ownerName: string;
  totalDueLabel: string;
  hasOverdue: boolean;
}

/**
 * Karta podsumowania finansowego lokatora
 * Wyświetla podstawowe informacje o mieszkaniu, właścicielu
 * oraz zwięzłe podsumowanie salda
 */
export function TenantSummaryCard({
  apartmentName,
  apartmentAddress,
  ownerName,
  totalDueLabel,
  hasOverdue,
}: TenantSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="h-5 w-5" />
          {apartmentName}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{apartmentAddress}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>Właściciel: {ownerName}</span>
        </div>

        <div className="rounded-lg bg-muted p-4">
          <p className="text-lg font-semibold">{totalDueLabel}</p>
          {hasOverdue && (
            <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>Część tej kwoty jest po terminie</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
