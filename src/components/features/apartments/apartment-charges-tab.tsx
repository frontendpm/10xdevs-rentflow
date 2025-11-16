import { useApartmentCharges } from "@/components/hooks/use-apartment-charges";
import ChargeList from "@/components/features/charges/charge-list";
import { Button } from "@/components/ui/button";
import { Plus, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";

interface ApartmentChargesTabProps {
  apartmentId: string;
  role: "owner" | "tenant";
}

export default function ApartmentChargesTab({ apartmentId, role }: ApartmentChargesTabProps) {
  const { chargesByMonth, isLoading, error, noActiveLease, refetch } = useApartmentCharges(apartmentId);

  // Wyświetl toast w przypadku błędu
  useEffect(() => {
    if (error) {
      toast.error("Błąd", {
        description: error,
      });
    }
  }, [error]);

  // Stan ładowania
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Ładowanie opłat...</p>
        </div>
      </div>
    );
  }

  // Stan błędu
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 dark:text-red-400 mb-4" />
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Wystąpił błąd</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6 max-w-md">{error}</p>
        <Button onClick={refetch} variant="outline">
          Spróbuj ponownie
        </Button>
      </div>
    );
  }

  // Stan braku aktywnego najmu
  if (noActiveLease) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-yellow-100 dark:bg-yellow-900/20 p-6 mb-6">
          <AlertCircle className="h-12 w-12 text-yellow-600 dark:text-yellow-500" />
        </div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          {role === "owner" ? "Brak lokatora" : "Najem został zakończony"}
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6 max-w-md">
          {role === "owner"
            ? "Najpierw zaproś lokatora do mieszkania, aby móc dodawać opłaty."
            : "Najem dla tego mieszkania został zakończony. Skontaktuj się z właścicielem."}
        </p>
        {role === "owner" && (
          <Button onClick={() => (window.location.href = `/apartments/${apartmentId}#ustawienia`)}>
            Przejdź do zakładki Ustawienia
          </Button>
        )}
      </div>
    );
  }

  // Stan pusty - brak opłat
  const hasCharges = chargesByMonth && Object.keys(chargesByMonth).length > 0;

  if (!hasCharges) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-6 mb-6">
          <Plus className="h-12 w-12 text-neutral-400 dark:text-neutral-600" />
        </div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          {role === "owner" ? "Brak dodanych opłat" : "Brak opłat"}
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6 max-w-md">
          {role === "owner"
            ? "Nie dodałeś jeszcze żadnych opłat dla tego mieszkania. Dodaj pierwszą opłatę, aby rozpocząć rozliczanie się z lokatorem."
            : "Właściciel nie dodał jeszcze żadnych opłat dla tego mieszkania."}
        </p>
        {role === "owner" && (
          <Button onClick={() => (window.location.href = `/charges/new?apartmentId=${apartmentId}`)}>
            <Plus className="h-4 w-4 mr-2" />
            Dodaj pierwszą opłatę
          </Button>
        )}
      </div>
    );
  }

  // Stan z danymi - wyświetlenie listy opłat
  return (
    <div className="space-y-6">
      {/* Nagłówek z przyciskiem dodawania (tylko dla właściciela) */}
      {role === "owner" && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Opłaty</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              Zarządzaj opłatami dla tego mieszkania
            </p>
          </div>
          <Button onClick={() => (window.location.href = `/charges/new?apartmentId=${apartmentId}`)}>
            <Plus className="h-4 w-4 mr-2" />
            Dodaj opłatę
          </Button>
        </div>
      )}

      {/* Lista opłat */}
      <ChargeList chargesByMonth={chargesByMonth} readOnly={role === "tenant"} />
    </div>
  );
}
