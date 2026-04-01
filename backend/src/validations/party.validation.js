import { z } from "zod";

const paginationNumber = (fieldName, defaultValue) =>
  z.preprocess(
    (value) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed === "" ? value : Number(trimmed);
      }

      return value;
    },
    z
      .number()
      .int(`${fieldName} must be an integer`)
      .min(1, `${fieldName} must be at least 1`)
      .default(defaultValue)
  );

export const partyBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  businessName: z.string().trim().min(1, "Business name is required"),
  email: z
    .string()
    .trim()
    .email("Email must be valid")
    .optional()
    .or(z.literal("")),
  phoneNumber: z.string().trim().min(1, "Phone number is required"),
  address: z.string().trim().min(1, "Address is required"),
});

export const partyListQuerySchema = z.object({
  search: z.string().trim().optional().default(""),
  page: paginationNumber("page", 1),
  limit: paginationNumber("limit", 20).pipe(
    z.number().max(100, "limit cannot be greater than 100")
  ),
});
