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

const paginationNumber = (fieldName, defaultValue) =>
  z.preprocess(
    toNumber,
    z
      .number()
      .int(`${fieldName} must be an integer`)
      .min(1, `${fieldName} must be at least 1`)
      .default(defaultValue)
  );

export const rawMaterialBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  brandId: uuidField("brandId"),
  categoryId: uuidField("categoryId"),
  sizeId: uuidField("sizeId"),
  purchaseUnitId: uuidField("purchaseUnitId"),
  sellingUnitId: uuidField("sellingUnitId"),
  quantity: nonNegativeNumber("Quantity"),
  purchasePrice: nonNegativeNumber("Purchase price"),
  sellingPrice: nonNegativeNumber("Selling price"),
});

export const rawMaterialListQuerySchema = z.object({
  search: z.string().trim().optional().default(""),
  page: paginationNumber("page", 1),
  limit: paginationNumber("limit", 20).pipe(
    z.number().max(100, "limit cannot be greater than 100")
  ),
});
