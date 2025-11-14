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

const loginSchema = z.object({
  email: z.string().trim().email("Nieprawidłowy adres e-mail"),
  password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

type LoginErrorState = {
  message: string;
  code?: string;
} | null;

export default function LoginForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<LoginErrorState>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
    mode: "onTouched",
  });

  async function onSubmit(values: LoginFormValues) {
    setIsSubmitting(true);
    setGlobalError(null);

    try {
      const response = await fetch(
        `${import.meta.env.PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
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
          }),
        }
      );

      const data = await response.json();

      console.log("Supabase login response:", data);

      if (data.error || !response.ok) {
        setGlobalError({
          message: "Nieprawidłowy e-mail lub hasło",
          code: data.error?.code,
        });
        return;
      }

      if (!data.access_token) {
        console.error("No access_token in response:", data);
        setGlobalError({
          message: "Wystąpił nieoczekiwany błąd. Spróbuj ponownie później.",
        });
        return;
      }

      localStorage.setItem("rentflow_auth_token", data.access_token);
      if (data.refresh_token) {
        localStorage.setItem("rentflow_refresh_token", data.refresh_token);
      }

      const userResponse = await fetch("/api/users/me", {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!userResponse.ok) {
        console.error("Failed to fetch user profile:", userResponse.status);
        localStorage.removeItem("rentflow_auth_token");
        localStorage.removeItem("rentflow_refresh_token");
        setGlobalError({
          message: "Wystąpił problem podczas logowania. Spróbuj ponownie.",
        });
        return;
      }

      const userData = await userResponse.json();
      console.log("User profile:", userData);

      if (userData.role === "owner") {
        const apartmentsResponse = await fetch("/api/apartments", {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            "Content-Type": "application/json",
          },
        });

        if (apartmentsResponse.ok) {
          const apartmentsData = await apartmentsResponse.json();
          
          if (apartmentsData.apartments && apartmentsData.apartments.length === 0) {
            window.location.href = "/onboarding";
            return;
          }
        }
      }

      window.location.href = "/dashboard";
    } catch (error) {
      console.error("Login error:", error);
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
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    autoFocus
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
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...field}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="text-right">
            <a
              href="/reset-password"
              className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
            >
              Nie pamiętasz hasła?
            </a>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting || !form.formState.isValid}
          >
            {isSubmitting ? "Logowanie..." : "Zaloguj się"}
          </Button>

          <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            Nie masz jeszcze konta?{" "}
            <a
              href="/register"
              className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
            >
              Załóż konto właściciela
            </a>
          </p>
        </form>
      </Form>
    </div>
  );
}

