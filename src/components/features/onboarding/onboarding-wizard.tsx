import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useOnboardingWizard } from "@/components/hooks/use-onboarding-wizard";
import ProgressIndicator from "./progress-indicator";
import ApartmentForm from "@/components/features/apartments/apartment-form";
import InvitationLinkGenerator from "./invitation-link-generator";
import type { ApartmentFormValues } from "@/types/onboarding";

export default function OnboardingWizard() {
  const { state, createApartment, generateInvitation, goToStep, finish } = useOnboardingWizard();

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state.error]);

  const handleApartmentSubmit = async (values: ApartmentFormValues) => {
    try {
      await createApartment(values);
      toast.success("Mieszkanie zostało dodane");
    } catch (error) {
      console.error("Błąd podczas tworzenia mieszkania:", error);
    }
  };

  const handleGenerateInvitation = async () => {
    try {
      await generateInvitation();
      toast.success("Link zapraszający został wygenerowany");
    } catch (error) {
      console.error("Błąd podczas generowania linku:", error);
    }
  };

  const canFinish = state.invitation?.status === 'ready';

  return (
    <>
      <Card className="border-neutral-200 dark:border-neutral-800">
        <CardHeader>
          <CardTitle className="text-2xl">
            {state.currentStep === 1 ? "Dodaj swoje pierwsze mieszkanie" : "Zaproś lokatora"}
          </CardTitle>
          <CardDescription>
            {state.currentStep === 1
              ? "Zacznijmy od podstawowych informacji o Twoim mieszkaniu"
              : "Wygeneruj link zapraszający dla swojego lokatora"}
          </CardDescription>
          <div className="pt-4">
            <ProgressIndicator step={state.currentStep} totalSteps={2} />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {state.currentStep === 1 && (
            <ApartmentForm
              mode="onboarding"
              onSubmit={handleApartmentSubmit}
              isSubmitting={state.isCreatingApartment}
            />
          )}

          {state.currentStep === 2 && state.apartment && (
            <div className="space-y-6">
              <InvitationLinkGenerator
                apartment={state.apartment}
                invitation={state.invitation}
                onGenerate={handleGenerateInvitation}
              />

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => goToStep(1)}
                  disabled={state.isGeneratingInvitation}
                  className="flex-1"
                >
                  Wstecz
                </Button>
                <Button
                  onClick={finish}
                  disabled={!canFinish}
                  className="flex-1"
                >
                  Zakończ
                </Button>
              </div>

              {!canFinish && (
                <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
                  Wygeneruj link zapraszający, aby zakończyć kreator
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Toaster />
    </>
  );
}

