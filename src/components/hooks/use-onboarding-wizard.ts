import { useState } from "react";
import type {
  OnboardingWizardState,
  OnboardingStep,
  ApartmentFormValues,
  OnboardingApartmentVM,
} from "@/types/onboarding";
import type { CreateApartmentCommand, CreateInvitationResponseDTO } from "@/types";
import { getAuthHeaders } from "@/lib/utils/auth";

export function useOnboardingWizard() {
  const [state, setState] = useState<OnboardingWizardState>({
    currentStep: 1,
    apartment: undefined,
    invitation: undefined,
    isCreatingApartment: false,
    isGeneratingInvitation: false,
    error: null,
  });

  const createApartment = async (values: ApartmentFormValues) => {
    setState((prev) => ({
      ...prev,
      isCreatingApartment: true,
      error: null,
    }));

    try {
      const command: CreateApartmentCommand = {
        name: values.name,
        address: values.address,
      };

      const response = await fetch("/api/apartments", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(command),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 400) {
          throw new Error(errorData.message || "Dane formularza są nieprawidłowe");
        } else if (response.status === 403) {
          throw new Error("Tylko właściciele mogą dodawać mieszkania");
        } else if (response.status === 500) {
          throw new Error("Wystąpił błąd serwera. Spróbuj ponownie później");
        } else {
          throw new Error("Nie udało się dodać mieszkania");
        }
      }

      const apartment = await response.json();

      const apartmentVM: OnboardingApartmentVM = {
        id: apartment.id,
        name: apartment.name,
        address: apartment.address,
      };

      setState((prev) => ({
        ...prev,
        apartment: apartmentVM,
        currentStep: 2,
        isCreatingApartment: false,
      }));

      return apartmentVM;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd";
      setState((prev) => ({
        ...prev,
        isCreatingApartment: false,
        error: message,
      }));
      throw error;
    }
  };

  const generateInvitation = async () => {
    if (!state.apartment) {
      throw new Error("Brak danych mieszkania");
    }

    setState((prev) => ({
      ...prev,
      isGeneratingInvitation: true,
      invitation: {
        url: "",
        status: "loading",
      },
    }));

    try {
      const response = await fetch(`/api/apartments/${state.apartment.id}/invitations`, {
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

      const data: CreateInvitationResponseDTO = await response.json();

      setState((prev) => ({
        ...prev,
        isGeneratingInvitation: false,
        invitation: {
          url: data.invitation_url,
          status: "ready",
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wystąpił nieoczekiwany błąd";
      setState((prev) => ({
        ...prev,
        isGeneratingInvitation: false,
        invitation: {
          url: "",
          status: "error",
          errorMessage: message,
        },
      }));
      throw error;
    }
  };

  const goToStep = (step: OnboardingStep) => {
    if (step === 2 && !state.apartment) {
      return;
    }
    setState((prev) => ({ ...prev, currentStep: step }));
  };

  const finish = () => {
    window.location.href = "/dashboard";
  };

  return {
    state,
    createApartment,
    generateInvitation,
    goToStep,
    finish,
  };
}
