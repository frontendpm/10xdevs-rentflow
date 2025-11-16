import { z } from "zod";

/**
 * Schema walidacji parametrów query dla GET /api/apartments/:id/charges
 *
 * Opcjonalne filtry:
 * - lease_id: UUID konkretnego najmu (dla widoku historycznego)
 * - month: Format YYYY-MM (np. "2025-01")
 * - status: Status płatności (unpaid, partially_paid, paid)
 * - overdue: Boolean - tylko przeterminowane opłaty
 */
export const getChargesQuerySchema = z.object({
  lease_id: z.string().uuid().optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, {
      message: "Format miesiąca musi być YYYY-MM",
    })
    .optional(),
  status: z
    .enum(["unpaid", "partially_paid", "paid"], {
      errorMap: () => ({ message: "Status musi być: unpaid, partially_paid lub paid" }),
    })
    .optional(),
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),
});

/**
 * Schema walidacji dla POST /api/apartments/:id/charges
 *
 * Pola wymagane:
 * - amount: Kwota > 0, max 2 miejsca po przecinku, max 999,999.99
 * - due_date: Data w formacie YYYY-MM-DD
 * - type: Typ opłaty (rent, bill, other)
 *
 * Pola opcjonalne:
 * - comment: Max 300 znaków
 */
export const createChargeSchema = z.object({
  amount: z
    .number()
    .positive({ message: "Kwota musi być większa od 0" })
    .multipleOf(0.01, { message: "Kwota może mieć maksymalnie 2 miejsca po przecinku" })
    .max(999999.99, { message: "Kwota nie może przekraczać 999 999.99 zł" }),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Data musi być w formacie YYYY-MM-DD" })
    .refine(
      (date) => {
        const parsed = new Date(date);
        return !isNaN(parsed.getTime());
      },
      { message: "Nieprawidłowa data" }
    ),
  type: z.enum(["rent", "bill", "other"], {
    errorMap: () => ({ message: "Typ musi być: rent, bill lub other" }),
  }),
  comment: z.string().max(300, { message: "Komentarz nie może przekraczać 300 znaków" }).optional(),
});

/**
 * Schema walidacji dla PATCH /api/charges/:id
 *
 * Wszystkie pola opcjonalne (partial update):
 * - amount: Kwota > 0, max 2 miejsca po przecinku, max 999,999.99
 * - due_date: Data w formacie YYYY-MM-DD
 * - type: Typ opłaty (rent, bill, other)
 * - comment: Max 300 znaków (nullable)
 *
 * Walidacja: Musi być podane przynajmniej jedno pole do aktualizacji
 */
export const updateChargeSchema = z
  .object({
    amount: z.number().positive({ message: "Kwota musi być większa od 0" }).multipleOf(0.01).max(999999.99).optional(),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    type: z.enum(["rent", "bill", "other"]).optional(),
    comment: z.string().max(300).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Należy podać przynajmniej jedno pole do aktualizacji",
  });

/**
 * Typy inferred z schemas
 */
export type GetChargesQuery = z.infer<typeof getChargesQuerySchema>;
export type CreateChargeInput = z.infer<typeof createChargeSchema>;
export type UpdateChargeInput = z.infer<typeof updateChargeSchema>;
