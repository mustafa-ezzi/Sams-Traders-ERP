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

export const openingStockBodySchema = z.object({
  date: z.string().trim().min(1, "Date is required").pipe(z.coerce.date()),
  warehouseId: z.string().uuid("warehouseId must be a valid UUID"),
  rawMaterialId: z.string().uuid("rawMaterialId must be a valid UUID"),
  purchaseQuantity: z.preprocess(
    toNumber,
    z.number().min(0, "Purchase quantity must be at least 0")
  ),
  sellingQuantity: z.preprocess(
    toNumber,
    z.number().min(0, "Selling quantity must be at least 0")
  ),
});

export const openingStockListQuerySchema = z.object({
  search: z.string().trim().optional().default(""),
  page: paginationNumber("page", 1),
  limit: paginationNumber("limit", 20).pipe(
    z.number().max(100, "limit cannot be greater than 100")
  ),
});
