/**
 * Typy dla widoku Onboardingu
 * 
 * Ten plik zawiera typy ViewModels używane w kreatorze onboardingu
 * oraz typy walidacji formularzy.
 */

export type OnboardingStep = 1 | 2;

/**
 * Minimalny zestaw danych o mieszkaniu w kreatorze
 */
export interface OnboardingApartmentVM {
  id: string;
  name: string;
  address: string;
}

/**
 * Stan widoku linku zapraszającego
 */
export interface InvitationLinkVM {
  url: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  errorMessage?: string;
}

/**
 * Stan globalny kreatora onboardingu
 */
export interface OnboardingWizardState {
  currentStep: OnboardingStep;
  apartment?: OnboardingApartmentVM;
  invitation?: InvitationLinkVM;
  isCreatingApartment: boolean;
  isGeneratingInvitation: boolean;
  error?: string | null;
}

/**
 * Wartości formularza dodawania mieszkania
 */
export interface ApartmentFormValues {
  name: string;
  address: string;
}

