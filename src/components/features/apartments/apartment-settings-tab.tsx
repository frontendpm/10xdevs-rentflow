import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import InvitationLinkGenerator from "@/components/features/onboarding/invitation-link-generator";
import type { InvitationLinkVM, ApartmentDetailsDTO, InvitationListDTO } from "@/types";
import { toast } from "sonner";
import { getAuthHeaders } from "@/lib/utils/auth";
import { hasActiveLease as checkActiveLease } from "@/lib/utils/lease";

interface ApartmentSettingsTabProps {
  apartment: ApartmentDetailsDTO;
}

export default function ApartmentSettingsTab({ apartment }: ApartmentSettingsTabProps) {
  const [invitation, setInvitation] = useState<InvitationLinkVM | undefined>(undefined);
  const [isLoadingInvitation, setIsLoadingInvitation] = useState(true);

  // Load existing pending invitation on mount
  useEffect(() => {
    const loadPendingInvitation = async () => {
      try {
        const response = await fetch(`/api/apartments/${apartment.id}/invitations`, {
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          setIsLoadingInvitation(false);
          return;
        }

        const data: InvitationListDTO = await response.json();

        // Find the most recent pending invitation
        const pendingInvitation = data.invitations.find((inv) => inv.status === "pending");

        if (pendingInvitation) {
          const appUrl = import.meta.env.PUBLIC_APP_URL || window.location.origin;
          const invitationUrl = `${appUrl}/register/tenant?token=${pendingInvitation.token}`;

          setInvitation({
            url: invitationUrl,
            status: "ready",
          });
        }
      } catch (error) {
        console.error("Error loading pending invitation:", error);
      } finally {
        setIsLoadingInvitation(false);
      }
    };

    loadPendingInvitation();
  }, [apartment.id]);

  const handleGenerateInvitation = async () => {
    setInvitation({ url: "", status: "loading" });

    try {
      const response = await fetch(`/api/apartments/${apartment.id}/invitations`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 400) {
          throw new Error(errorData.message || "To mieszkanie ma już aktywnego lokatora");
        } else if (response.status === 403) {
          throw new Error("Nie masz uprawnień do wykonania tej akcji");
        } else if (response.status === 500) {
          throw new Error("Wystąpił błąd serwera. Spróbuj ponownie później");
        } else {
          throw new Error("Nie udało się wygenerować linku");
        }
      }

      const data = await response.json();

      setInvitation({
        url: data.invitation_url,
        status: "ready",
      });

      toast.success("Link zapraszający został wygenerowany");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd";

      setInvitation({
        url: "",
        status: "error",
        errorMessage: message,
      });

      toast.error("Błąd", {
        description: message,
      });
    }
  };

  const hasActiveLease = checkActiveLease(apartment);

  return (
    <div className="space-y-6">
      {/* Sekcja: Zarządzanie lokatorem */}
      <Card>
        <CardHeader>
          <CardTitle>Lokator</CardTitle>
          <CardDescription>
            {hasActiveLease ? "Zarządzaj aktywnym najmem" : "Zaproś lokatora do mieszkania"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {hasActiveLease ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">Aktywny lokator</h3>
                <div className="mt-2 space-y-1 text-sm">
                  <p className="text-neutral-700 dark:text-neutral-300">
                    <span className="font-medium">Imię:</span> {apartment.lease.tenant.full_name}
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300">
                    <span className="font-medium">Email:</span> {apartment.lease.tenant.email}
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300">
                    <span className="font-medium">Data rozpoczęcia:</span>{" "}
                    {new Date(apartment.lease.start_date).toLocaleDateString("pl-PL")}
                  </p>
                </div>
              </div>

              <Button variant="destructive" disabled>
                Zakończ najem
              </Button>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                Funkcja zakończenia najmu będzie dostępna wkrótce
              </p>
            </div>
          ) : isLoadingInvitation ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-primary" />
              <span className="ml-2 text-sm text-neutral-600 dark:text-neutral-400">Ładowanie...</span>
            </div>
          ) : (
            <InvitationLinkGenerator
              apartment={{
                id: apartment.id,
                name: apartment.name,
                address: apartment.address,
              }}
              invitation={invitation}
              onGenerate={handleGenerateInvitation}
            />
          )}
        </CardContent>
      </Card>

      {/* Sekcja: Edycja mieszkania (placeholder) */}
      <Card>
        <CardHeader>
          <CardTitle>Edycja mieszkania</CardTitle>
          <CardDescription>Zmień nazwę lub adres mieszkania</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Funkcja edycji mieszkania będzie dostępna wkrótce
          </p>
        </CardContent>
      </Card>

      {/* Sekcja: Usuwanie mieszkania (placeholder) */}
      <Card>
        <CardHeader>
          <CardTitle>Usuwanie mieszkania</CardTitle>
          <CardDescription>Trwale usuń mieszkanie z systemu</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            Funkcja usuwania mieszkania będzie dostępna wkrótce
          </p>
          <Button variant="destructive" disabled>
            Usuń mieszkanie
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
