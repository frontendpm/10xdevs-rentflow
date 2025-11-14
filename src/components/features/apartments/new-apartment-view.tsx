import { useState } from "react";
import { toast } from "sonner";
import ApartmentForm from "./apartment-form";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import type { ApartmentFormValues } from "@/types/onboarding";
import type { Tables } from "@/db/database.types";

interface NewApartmentViewProps {
  redirectPath?: string;
}

export default function NewApartmentView({
  redirectPath = "/dashboard",
}: NewApartmentViewProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: ApartmentFormValues) => {
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/apartments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json();

        // Obsługa różnych błędów HTTP
        if (response.status === 401) {
          toast.error("Sesja wygasła. Zaloguj się ponownie.");
          window.location.href = "/login?redirect=/apartments/new";
          return;
        }

        if (response.status === 403) {
          toast.error("Tylko właściciele mogą dodawać mieszkania");
          window.location.href = "/dashboard";
          return;
        }

        if (response.status === 400) {
          toast.error(errorData.message || "Nieprawidłowe dane");
          return;
        }

        // Ogólny błąd serwera
        toast.error("Wystąpił błąd serwera. Spróbuj ponownie.");
        return;
      }

      // Sukces - pokaż toast i przekieruj
      const apartment: Tables<"apartments"> = await response.json();

      toast.success("Mieszkanie zostało dodane");

      // Krótkie opóźnienie przed redirectem, aby użytkownik zobaczył toast
      setTimeout(() => {
        window.location.href = redirectPath;
      }, 500);
    } catch (error) {
      console.error("[NewApartmentView] Błąd podczas tworzenia mieszkania:", error);
      toast.error(
        "Nie udało się połączyć z serwerem. Sprawdź połączenie internetowe i spróbuj ponownie."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Dodaj mieszkanie" },
        ]}
      />

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          Dodaj mieszkanie
        </h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Uzupełnij dane nowego mieszkania, aby dodać je do swojego dashboardu.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <ApartmentForm
          mode="standalone"
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitButtonText="Dodaj mieszkanie"
        />
      </div>
    </div>
  );
}
