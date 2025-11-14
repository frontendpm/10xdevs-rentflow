import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Checkbox } from "@/components/ui/checkbox";

const registerOwnerSchema = z
  .object({
    full_name: z.string().trim().min(2, "Imię musi mieć co najmniej 2 znaki"),
    email: z.string().trim().email("Nieprawidłowy adres e-mail"),
    password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków"),
    confirmPassword: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków"),
    acceptTerms: z.boolean().refine((v) => v, {
      message: "Musisz zaakceptować Regulamin i Politykę Prywatności",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Hasła muszą być identyczne",
    path: ["confirmPassword"],
  });

type RegisterOwnerFormValues = z.infer<typeof registerOwnerSchema>;

type RegisterOwnerErrorState = {
  message: string;
  code?: string;
} | null;

export default function RegisterOwnerForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<RegisterOwnerErrorState>(null);

  const form = useForm<RegisterOwnerFormValues>({
    resolver: zodResolver(registerOwnerSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
    mode: "onTouched",
  });

  async function onSubmit(values: RegisterOwnerFormValues) {
    setIsSubmitting(true);
    setGlobalError(null);

    try {
      const response = await fetch(
        `${import.meta.env.PUBLIC_SUPABASE_URL}/auth/v1/signup`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${import.meta.env.PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            email: values.email,
            password: values.password,
            data: {
              full_name: values.full_name,
              role: "owner",
            },
          }),
        }
      );

      const data = await response.json();

      console.log("Supabase signup response:", data);

      if (data.error) {
        const errorMessage =
          data.error.message === "User already registered"
            ? "Ten adres e-mail jest już używany."
            : data.error.message.includes("email")
              ? "Nieprawidłowy adres e-mail."
              : "Wystąpił błąd podczas rejestracji. Spróbuj ponownie później.";

        setGlobalError({
          message: errorMessage,
          code: data.error.code,
        });
        return;
      }

      if (!data.user) {
        console.error("No user in response:", data);
        setGlobalError({
          message: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.",
        });
        return;
      }

      console.log("Registration successful, redirecting to /onboarding");
      window.location.href = "/onboarding";
    } catch (error) {
      console.error("Registration error:", error);
      setGlobalError({
        message:
          "Nie udało się połączyć z serwerem. Sprawdź połączenie internetowe i spróbuj ponownie.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {globalError && (
        <div
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4"
          role="alert"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-destructive">
            {globalError.message}
          </p>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Imię</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Jan Kowalski"
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
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="jan@example.com"
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
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hasło</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••"
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
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Powtórz hasło</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••"
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
            name="acceptTerms"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel className="text-sm font-normal">
                    Akceptuję{" "}
                    <a
                      href="/regulamin"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                    >
                      Regulamin
                    </a>{" "}
                    i{" "}
                    <a
                      href="/polityka-prywatnosci"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                    >
                      Politykę Prywatności
                    </a>
                  </FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || !form.formState.isValid}
          >
            {isSubmitting ? "Rejestracja..." : "Załóż konto"}
          </Button>

          <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            Masz już konto?{" "}
            <a
              href="/login"
              className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
            >
              Zaloguj się
            </a>
          </p>
        </form>
      </Form>
    </div>
  );
}

