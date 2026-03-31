import { z } from "zod";

const toNumber = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? value : Number(trimmed);
  }

  return value;
};

const paginationNumber = (fieldName, defaultValue) =>
  z.preprocess(
    toNumber,
    z
      .number()
      .int(`${fieldName} must be an integer`)
      .min(1, `${fieldName} must be at least 1`)
      .default(defaultValue)
  );

export const sizeBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export const sizeListQuerySchema = z.object({
  search: z.string().trim().optional().default(""),
  page: paginationNumber("page", 1),
  limit: paginationNumber("limit", 20).pipe(
    z.number().max(100, "limit cannot be greater than 100")
  ),
});

