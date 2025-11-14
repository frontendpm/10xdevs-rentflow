import { z } from "zod";

/**
 * Schemat walidacji query params dla GET /api/apartments
 *
 * Obsługiwany parametr:
 * - include_archived: "true" | "false" (opcjonalny, domyślnie "false")
 */
export const GetApartmentsQuerySchema = z.object({
  include_archived: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((val) => val === "true"),
});

export type GetApartmentsQuery = z.infer<typeof GetApartmentsQuerySchema>;

/**
 * Schemat walidacji body dla POST /api/apartments
 *
 * Pola:
 * - name: min 3 znaki, max 100 znaków
 * - address: min 5 znaków, max 200 znaków
 */
export const CreateApartmentSchema = z.object({
  name: z
    .string()
    .min(3, 'Nazwa musi mieć co najmniej 3 znaki')
    .max(100, 'Nazwa nie może przekraczać 100 znaków')
    .trim(),
  address: z
    .string()
    .min(5, 'Adres musi mieć co najmniej 5 znaków')
    .max(200, 'Adres nie może przekraczać 200 znaków')
    .trim()
});

export type CreateApartmentInput = z.infer<typeof CreateApartmentSchema>;

