import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface DashboardNavCardProps {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Reużywalna karta nawigacyjna w dashboardzie
 * Prezentuje ikonę, tytuł i opis sekcji
 * Cała karta jest linkiem do innego widoku
 */
export function DashboardNavCard({ title, description, href, icon: Icon }: DashboardNavCardProps) {
  return (
    <a
      href={href}
      className="block transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
    >
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </a>
  );
}
