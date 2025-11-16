import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check } from "lucide-react";
import type { OnboardingApartmentVM, InvitationLinkVM } from "@/types/onboarding";

interface InvitationLinkGeneratorProps {
  apartment: OnboardingApartmentVM;
  invitation?: InvitationLinkVM;
  onGenerate: () => Promise<void>;
}

export default function InvitationLinkGenerator({ apartment, invitation, onGenerate }: InvitationLinkGeneratorProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!invitation?.url) return;

    try {
      await navigator.clipboard.writeText(invitation.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Nie udało się skopiować linku:", error);
    }
  };

  const isLoading = invitation?.status === "loading";
  const isReady = invitation?.status === "ready";
  const hasError = invitation?.status === "error";

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">Podsumowanie mieszkania</h3>
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-neutral-700 dark:text-neutral-300">
            <span className="font-medium">Nazwa:</span> {apartment.name}
          </p>
          <p className="text-neutral-700 dark:text-neutral-300">
            <span className="font-medium">Adres:</span> {apartment.address}
          </p>
        </div>
      </div>

      {!isReady && !hasError && (
        <div>
          <Button onClick={onGenerate} disabled={isLoading} className="w-full">
            {isLoading ? "Generowanie..." : "Wygeneruj link zapraszający"}
          </Button>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Kliknij przycisk, aby wygenerować link zapraszający dla swojego lokatora.
          </p>
        </div>
      )}

      {hasError && invitation?.errorMessage && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4" role="alert">
          <p className="text-sm font-medium text-destructive">{invitation.errorMessage}</p>
          <Button onClick={onGenerate} variant="outline" className="mt-3" disabled={isLoading}>
            Spróbuj ponownie
          </Button>
        </div>
      )}

      {isReady && invitation?.url && (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              ✓ Link zapraszający został wygenerowany
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="invitation-link" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Link zapraszający
            </label>
            <div className="flex gap-2">
              <Input id="invitation-link" value={invitation.url} readOnly className="flex-1 font-mono text-sm" />
              <Button
                onClick={handleCopy}
                variant="outline"
                size="icon"
                disabled={copied}
                aria-label={copied ? "Skopiowano" : "Kopiuj link"}
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Skopiuj link i wyślij go swojemu lokatorowi e-mailem lub SMS-em. Link jest jednorazowy i wygasa po 7 dniach.
          </p>
        </div>
      )}
    </div>
  );
}
