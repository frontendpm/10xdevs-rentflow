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
import { Alert, AlertDescription } from "@/components/ui/alert";

const registerTenantSchema = z
  .object({
    full_name: z.string().trim().min(2, "Imię musi mieć co najmniej 2 znaki"),
    email: z.string().trim().email("Nieprawidłowy adres e-mail"),
    password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków"),
    passwordConfirm: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków"),
    acceptTerms: z.boolean().refine((v) => v, {
      message: "Musisz zaakceptować Regulamin i Politykę Prywatności",
    }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Hasła muszą być identyczne",
    path: ["passwordConfirm"],
  });

type RegisterTenantFormValues = z.infer<typeof registerTenantSchema>;

type TenantRegisterApiError = {
  message: string;
  code?: string;
} | null;

interface TenantRegisterFormProps {
  token: string;
}

export default function TenantRegisterForm({ token }: TenantRegisterFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<TenantRegisterApiError>(null);

  const form = useForm<RegisterTenantFormValues>({
    resolver: zodResolver(registerTenantSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      passwordConfirm: "",
      acceptTerms: false,
    },
    mode: "onTouched",
  });

  async function onSubmit(values: RegisterTenantFormValues) {
    setIsSubmitting(true);
    setGlobalError(null);

    try {
      // Krok 1: Rejestracja lokatora przez Supabase Auth
      const signupResponse = await fetch(
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
              role: "tenant",
            },
          }),
        }
      );

      const signupData = await signupResponse.json();

      console.log("Supabase signup response:", signupData);

      if (signupData.error) {
        const errorMessage =
          signupData.error.message === "User already registered"
            ? "Ten adres e-mail jest już używany."
            : signupData.error.message.includes("email")
              ? "Nieprawidłowy adres e-mail."
              : "Wystąpił błąd podczas rejestracji. Spróbuj ponownie później.";

        setGlobalError({
          message: errorMessage,
          code: signupData.error.code,
        });
        return;
      }

      if (!signupData.user) {
        console.error("No user in signup response:", signupData);
        setGlobalError({
          message: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.",
        });
        return;
      }

      // Krok 2: Akceptacja zaproszenia (powiązanie lokatora z mieszkaniem)
      const acceptResponse = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
      });

      const acceptData = await acceptResponse.json();

      if (!acceptResponse.ok) {
        console.error("Accept invitation error:", acceptData);

        // Obsługa różnych błędów biznesowych
        if (acceptData.error === "Bad Request") {
          if (acceptData.message.includes("wygasł lub został już wykorzystany")) {
            // INVALID_TOKEN
            setGlobalError({
              message: acceptData.message,
            });
            // Redirect na stronę błędu zaproszenia po 2 sekundach
            setTimeout(() => {
              window.location.href = "/invitation-expired";
            }, 2000);
            return;
          } else if (acceptData.message.includes("przypisane do aktywnego najmu")) {
            // USER_HAS_LEASE
            setGlobalError({
              message: acceptData.message,
            });
            return;
          } else if (acceptData.message.includes("ma już aktywnego lokatora")) {
            // APARTMENT_HAS_LEASE
            setGlobalError({
              message: `${acceptData.message} Skontaktuj się z właścicielem.`,
            });
            return;
          }
        }

        if (acceptResponse.status === 401) {
          // Sesja wygasła
          setGlobalError({
            message: "Sesja wygasła. Zaloguj się ponownie, aby dokończyć proces.",
          });
          setTimeout(() => {
            window.location.href = `/login?redirect=/register/tenant?token=${token}`;
          }, 2000);
          return;
        }

        // Błąd ogólny
        setGlobalError({
          message: "Wystąpił błąd podczas akceptacji zaproszenia. Spróbuj ponownie później.",
        });
        return;
      }

      // Sukces - redirect do dashboardu
      console.log("Registration and invitation acceptance successful");
      window.location.href = "/dashboard";
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
        <Alert variant="destructive">
          <AlertDescription>{globalError.message}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Imię i nazwisko</FormLabel>
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
            name="passwordConfirm"
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
            {isSubmitting ? "Tworzenie konta..." : "Załóż konto"}
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
