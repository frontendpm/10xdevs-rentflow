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


