import { z } from "zod";

const toNumber = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? value : Number(trimmed);
  }

  return value;
};

const uuidField = (label) => z.string().uuid(`${label} must be a valid UUID`);

const nonNegativeNumber = (label) =>
  z.preprocess(
    toNumber,
    z.number().min(0, `${label} must be greater than or equal to 0`)
  );

const positiveNumber = (label) =>
  z.preprocess(
    toNumber,
    z.number().gt(0, `${label} must be greater than 0`)
  );

const paginationNumber = (fieldName, defaultValue) =>
  z.preprocess(
    toNumber,
    z
      .number()
      .int(`${fieldName} must be an integer`)
      .min(1, `${fieldName} must be at least 1`)
      .default(defaultValue)
  );

export const productMaterialSchema = z.object({
  rawMaterialId: uuidField("rawMaterialId"),
  quantity: positiveNumber("Quantity"),
  rate: nonNegativeNumber("Rate"),
});

export const productBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  productType: z.enum(["READY_MADE", "MANUFACTURED"]),
  packagingCost: nonNegativeNumber("Packaging cost"),
  materials: z.array(productMaterialSchema).default([]),
});

export const productListQuerySchema = z.object({
  search: z.string().trim().optional().default(""),
  page: paginationNumber("page", 1),
  limit: paginationNumber("limit", 20).pipe(
    z.number().max(100, "limit cannot be greater than 100")
  ),
});
