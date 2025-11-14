import { z } from "zod";

export const apartmentFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Nazwa mieszkania musi mieć co najmniej 3 znaki"),
  address: z
    .string()
    .trim()
    .min(5, "Adres musi mieć co najmniej 5 znaków"),
});

export type ApartmentFormSchema = z.infer<typeof apartmentFormSchema>;

export const GetApartmentsQuerySchema = z.object({
  include_archived: z
    .string()
    .optional()
    .transform((val) => val === "true"),
});
