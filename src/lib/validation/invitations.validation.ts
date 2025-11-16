import { z } from "zod";

export const CreateInvitationParamsSchema = z.object({
  id: z.string().uuid({ message: "Nieprawidłowy format ID mieszkania" }),
});

export const GetInvitationsParamsSchema = z.object({
  id: z.string().uuid({ message: "Nieprawidłowy format ID mieszkania" }),
});

export const ValidateInvitationParamsSchema = z.object({
  token: z.string().min(1, { message: "Token jest wymagany" }),
});

export const AcceptInvitationParamsSchema = z.object({
  token: z.string().min(1, { message: "Token jest wymagany" }),
});
