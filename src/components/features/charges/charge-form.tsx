import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getAuthHeaders, getAuthToken } from "@/lib/utils/auth";
import {
  validateAttachmentFile,
  FILE_VALIDATION_ERROR_MESSAGES,
} from "@/lib/utils/file-validation";
import type { CreateChargeCommand } from "@/types";
import { AlertTriangle, FileIcon, Trash2, Upload } from "lucide-react";

// =============================================================================
// TYPES
// =============================================================================

interface ChargeFormProps {
  apartmentId: string;
  apartmentName: string;
}

// =============================================================================
// VALIDATION SCHEMA
// =============================================================================

// Typ formularza
type ChargeFormValues = {
  amount: string;
  dueDate: string;
  type: "rent" | "bill" | "other";
  comment: string;
  attachment: File | null;
};

const chargeFormSchema = z.object({
  amount: z
    .string()
    .min(1, "Kwota jest wymagana")
    .refine(
      (val) => {
        const num = parseFloat(val.replace(",", "."));
        return !isNaN(num) && num > 0;
      },
      { message: "Kwota musi być większa od 0" }
    )
    .refine(
      (val) => {
        const num = parseFloat(val.replace(",", "."));
        const decimalPlaces = (val.replace(",", ".").split(".")[1] || "").length;
        return !isNaN(num) && decimalPlaces <= 2;
      },
      { message: "Kwota może mieć maksymalnie 2 miejsca po przecinku" }
    ),
  dueDate: z.string().min(1, "Data wymagalności jest wymagana"),
  type: z.enum(["rent", "bill", "other"], {
    required_error: "Typ opłaty jest wymagany",
    invalid_type_error: "Wybierz typ opłaty",
  }),
  comment: z.string().max(300, "Komentarz może mieć maksymalnie 300 znaków"),
  attachment: z.custom<File | null>(),
}) satisfies z.ZodType<ChargeFormValues>;

// =============================================================================
// COMPONENT
// =============================================================================

export default function ChargeForm({ apartmentId, apartmentName }: ChargeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noActiveLeaseError, setNoActiveLeaseError] = useState<string | null>(null);

  const form = useForm<ChargeFormValues>({
    resolver: zodResolver(chargeFormSchema),
    defaultValues: {
      amount: "",
      dueDate: "",
      type: "rent", // Domyślna wartość zgodna z schema
      comment: "",
      attachment: null,
    },
    mode: "onChange",
  });

  const selectedFile = form.watch("attachment");
  const commentLength = form.watch("comment")?.length || 0;
  const commentDescriptionId = "comment-description";

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;

    if (file) {
      const validationResult = validateAttachmentFile(file);

      if (!validationResult.valid && validationResult.error) {
        const errorMessage =
          FILE_VALIDATION_ERROR_MESSAGES[validationResult.error] ||
          "Nieprawidłowy plik";
        toast.error(errorMessage);
        event.target.value = "";
        return;
      }

      form.setValue("attachment", file);
    } else {
      form.setValue("attachment", null);
    }
  };

  const handleRemoveFile = () => {
    form.setValue("attachment", null);
    // Reset input file
    const fileInput = document.getElementById("attachment-input") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type === "application/pdf") {
      return <FileIcon className="h-4 w-4 text-red-500" />;
    }
    return <FileIcon className="h-4 w-4 text-blue-500" />;
  };

  const onSubmit = async (values: ChargeFormValues) => {
    setIsSubmitting(true);
    setNoActiveLeaseError(null);

    try {
      // Przygotuj dane do wysłania
      const command: CreateChargeCommand = {
        amount: parseFloat(values.amount.replace(",", ".")),
        due_date: values.dueDate,
        type: values.type as "rent" | "bill" | "other",
        ...(values.comment && values.comment.trim() && { comment: values.comment.trim() }),
      };

      // Wyślij żądanie utworzenia opłaty
      const createResponse = await fetch(`/api/apartments/${apartmentId}/charges`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(command),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));

        // Obsługa specyficznych błędów
        if (createResponse.status === 404) {
          setNoActiveLeaseError(
            errorData.message || "Brak aktywnego najmu dla tego mieszkania. Nie można dodać opłaty."
          );
          setIsSubmitting(false);
          return;
        }

        if (createResponse.status === 400 && errorData.details) {
          // Mapowanie błędów walidacyjnych na pola formularza
          Object.entries(errorData.details).forEach(([field, message]) => {
            const formField = field === "due_date" ? "dueDate" : field;
            form.setError(formField as keyof ChargeFormValues, {
              type: "manual",
              message: message as string,
            });
          });
          setIsSubmitting(false);
          return;
        }

        if (createResponse.status === 401) {
          toast.error("Sesja wygasła. Zaloguj się ponownie.");
          window.location.href = `/login?redirect=/charges/new?apartmentId=${apartmentId}`;
          return;
        }

        if (createResponse.status === 403) {
          toast.error("Nie masz uprawnień do dodawania opłat.");
          setIsSubmitting(false);
          return;
        }

        throw new Error(errorData.message || "Wystąpił błąd podczas tworzenia opłaty");
      }

      const createdCharge = await createResponse.json();

      // Upload załącznika (jeśli został wybrany)
      if (values.attachment) {
        const formData = new FormData();
        formData.append("file", values.attachment);

        const token = getAuthToken();
        const uploadResponse = await fetch(`/api/charges/${createdCharge.id}/attachment`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        if (!uploadResponse.ok) {
          const uploadError = await uploadResponse.json().catch(() => ({}));

          if (uploadResponse.status === 400 || uploadResponse.status === 413) {
            toast.error(
              uploadError.message ||
                "Wystąpił błąd podczas przesyłania załącznika. Opłata została utworzona bez załącznika."
            );
          } else {
            toast.warning(
              "Opłata została utworzona, ale wystąpił problem z przesłaniem załącznika."
            );
          }
        }
      }

      // Sukces!
      toast.success("Opłata została dodana");
      window.location.href = `/apartments/${apartmentId}`;
    } catch (error) {
      console.error("Błąd podczas tworzenia opłaty:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Wystąpił błąd serwera. Spróbuj ponownie lub skontaktuj się z pomocą (pomoc@rentflow.pl)"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert o braku aktywnego najmu */}
      {noActiveLeaseError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{noActiveLeaseError}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Kwota */}
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Kwota (PLN)</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="np. 2000.00"
                    {...field}
                    disabled={isSubmitting || !!noActiveLeaseError}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Data wymagalności */}
          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data wymagalności</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    {...field}
                    disabled={isSubmitting || !!noActiveLeaseError}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Typ opłaty */}
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Typ opłaty</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={isSubmitting || !!noActiveLeaseError}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz typ opłaty" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="rent">Czynsz</SelectItem>
                    <SelectItem value="bill">Rachunek</SelectItem>
                    <SelectItem value="other">Inne</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Komentarz */}
          <FormField
            control={form.control}
            name="comment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Komentarz (opcjonalnie)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Dodatkowe informacje o opłacie..."
                    className="resize-none"
                    rows={3}
                    maxLength={300}
                    aria-describedby={commentDescriptionId}
                    {...field}
                    disabled={isSubmitting || !!noActiveLeaseError}
                  />
                </FormControl>
                <FormDescription id={commentDescriptionId} className="text-right">
                  {commentLength}/300 znaków
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Załącznik */}
          <div className="space-y-2">
            <FormLabel htmlFor="attachment-input">Załącznik (opcjonalnie)</FormLabel>
            {selectedFile ? (
              <div
                className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900"
                role="status"
                aria-label={`Wybrany plik: ${selectedFile.name}`}
              >
                <div className="flex items-center gap-2">
                  {getFileIcon(selectedFile)}
                  <span className="text-sm font-medium">{selectedFile.name}</span>
                  <span className="text-xs text-neutral-500">
                    ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFile}
                  disabled={isSubmitting}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950"
                  aria-label={`Usuń plik ${selectedFile.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <input
                  id="attachment-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={handleFileChange}
                  disabled={isSubmitting || !!noActiveLeaseError}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-describedby="attachment-help"
                />
                <div
                  className="flex items-center justify-center rounded-md border border-dashed border-neutral-300 p-6 transition-colors hover:border-neutral-400 hover:bg-neutral-50 focus-within:ring-2 focus-within:ring-neutral-950 focus-within:ring-offset-2 dark:border-neutral-700 dark:hover:border-neutral-600 dark:hover:bg-neutral-900 dark:focus-within:ring-neutral-300"
                  role="button"
                  tabIndex={-1}
                >
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Upload className="h-8 w-8 text-neutral-400" />
                    <div>
                      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        Kliknij, aby wybrać plik
                      </span>
                      <p id="attachment-help" className="text-xs text-neutral-500 dark:text-neutral-400">
                        PDF, JPG lub PNG (max. 5MB)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Przyciski akcji */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => (window.location.href = `/apartments/${apartmentId}`)}
              disabled={isSubmitting}
            >
              Anuluj
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !form.formState.isValid || !!noActiveLeaseError}
            >
              {isSubmitting ? "Zapisywanie..." : "Zapisz opłatę"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
