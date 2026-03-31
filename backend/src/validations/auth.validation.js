import { z } from "zod";

export const loginBodySchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
  tenantId: z.enum(["SAMS_TRADERS", "AM_TRADERS"]),
});

