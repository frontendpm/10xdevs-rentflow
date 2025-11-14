import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { apartmentFormSchema } from "@/lib/validation/apartments.validation";
import type { ApartmentFormValues } from "@/types/onboarding";

interface ApartmentFormProps {
  defaultValues?: ApartmentFormValues;
  mode?: 'onboarding' | 'standalone';
  onSubmit: (values: ApartmentFormValues) => Promise<void> | void;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function ApartmentForm({
  defaultValues,
  mode = 'standalone',
  onSubmit,
  isSubmitting = false,
  submitButtonText,
}: ApartmentFormProps) {
  const form = useForm<ApartmentFormValues>({
    resolver: zodResolver(apartmentFormSchema),
    defaultValues: defaultValues || {
      name: "",
      address: "",
    },
    mode: "onChange",
  });

  const handleSubmit = async (values: ApartmentFormValues) => {
    await onSubmit(values);
  };

  const getPlaceholders = () => {
    if (mode === 'onboarding') {
      return {
        name: "np. Mieszkanie przy Głównej 15",
        address: "ul. Główna 15/3, 00-001 Warszawa",
      };
    }
    return {
      name: "Nazwa mieszkania",
      address: "Pełny adres",
    };
  };

  const placeholders = getPlaceholders();
  const buttonText = submitButtonText || (mode === 'onboarding' ? 'Dalej' : 'Zapisz');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nazwa mieszkania</FormLabel>
              <FormControl>
                <Input
                  placeholder={placeholders.name}
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Adres</FormLabel>
              <FormControl>
                <Input
                  placeholder={placeholders.address}
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting || !form.formState.isValid}
        >
          {isSubmitting ? "Zapisywanie..." : buttonText}
        </Button>
      </form>
    </Form>
  );
}

