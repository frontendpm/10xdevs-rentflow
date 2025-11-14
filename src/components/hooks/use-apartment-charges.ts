import { useState, useEffect, useCallback } from "react";
import type { ChargesListDTO, ChargeListItemDTO } from "@/types";
import { getAuthHeaders } from "@/lib/utils/auth";

interface UseApartmentChargesState {
  chargesByMonth: Record<string, ChargeListItemDTO[]> | null;
  isLoading: boolean;
  error: string | null;
}

interface UseApartmentChargesReturn extends UseApartmentChargesState {
  refetch: () => Promise<void>;
}

export function useApartmentCharges(apartmentId: string): UseApartmentChargesReturn {
  const [state, setState] = useState<UseApartmentChargesState>({
    chargesByMonth: null,
    isLoading: true,
    error: null,
  });

  const fetchCharges = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const response = await fetch(`/api/apartments/${apartmentId}/charges`, {
        method: "GET",
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 401) {
          throw new Error("Sesja wygasła. Zaloguj się ponownie");
        } else if (response.status === 403) {
          throw new Error("Nie masz uprawnień do przeglądania opłat");
        } else if (response.status === 404) {
          throw new Error(errorData.message || "Mieszkanie nie zostało znalezione");
        } else if (response.status === 500) {
          throw new Error("Wystąpił błąd serwera. Spróbuj ponownie później");
        } else {
          throw new Error("Nie udało się pobrać opłat");
        }
      }

      const data: ChargesListDTO = await response.json();

      setState({
        chargesByMonth: data.charges_by_month,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd";

      setState({
        chargesByMonth: null,
        isLoading: false,
        error: message,
      });

      // Jeśli błąd 401, przekieruj na login
      if (message.includes("Sesja wygasła")) {
        setTimeout(() => {
          window.location.href = `/login?redirect=/apartments/${apartmentId}`;
        }, 2000);
      }
    }
  }, [apartmentId]);

  // Pobierz opłaty przy montowaniu komponentu
  useEffect(() => {
    fetchCharges();
  }, [fetchCharges]);

  return {
    chargesByMonth: state.chargesByMonth,
    isLoading: state.isLoading,
    error: state.error,
    refetch: fetchCharges,
  };
}
