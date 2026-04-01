import prisma from "../lib/prisma.js";
import { HttpError } from "../utils/httpError.js";

const getOpeningStockModel = () => {
  if (!prisma.openingStock) {
    throw new HttpError(
      500,
      "Opening stock Prisma client is not available. Regenerate Prisma client and restart the backend server."
    );
  }

  return prisma.openingStock;
};

const openingStockInclude = {
  warehouse: true,
  rawMaterial: {
    include: {
      brand: true,
      category: true,
      size: true,
      purchaseUnit: true,
      sellingUnit: true,
    },
  },
};

const buildListWhere = (tenantId, search) => ({
  tenantId,
  deletedAt: null,
  ...(search
    ? {
        OR: [
          {
            warehouse: {
              name: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
          {
            rawMaterial: {
              name: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
        ],
      }
    : {}),
});

const normalizeDate = (value) => {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const ensureReferenceExists = async (model, id, tenantId, label) => {
  const record = await prisma[model].findFirst({
    where: {
      id,
      tenantId,
      deletedAt: null,
    },
  });

  if (!record) {
    throw new HttpError(400, `${label} was not found for this tenant`);
  }
};

const ensureReferencesExist = async (tenantId, data) => {
  await Promise.all([
    ensureReferenceExists("warehouse", data.warehouseId, tenantId, "Warehouse"),
    ensureReferenceExists("rawMaterial", data.rawMaterialId, tenantId, "Raw material"),
  ]);
};

const ensureUniqueOpeningStock = async (
  tenantId,
  data,
  excludeId
) => {
  const openingStockModel = getOpeningStockModel();
  const existing = await openingStockModel.findFirst({
    where: {
      tenantId,
      date: normalizeDate(data.date),
      warehouseId: data.warehouseId,
      rawMaterialId: data.rawMaterialId,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });

  if (existing) {
    throw new HttpError(
      400,
      "Opening stock already exists for this date, warehouse, and raw material"
    );
  }
};

const mapOpeningStockData = (tenantId, data) => ({
  tenantId,
  date: normalizeDate(data.date),
  warehouseId: data.warehouseId,
  rawMaterialId: data.rawMaterialId,
  purchaseQuantity: data.purchaseQuantity,
  sellingQuantity: data.sellingQuantity,
});

export const createOpeningStock = async (tenantId, data) => {
  await ensureReferencesExist(tenantId, data);
  await ensureUniqueOpeningStock(tenantId, data);
  const openingStockModel = getOpeningStockModel();

  return openingStockModel.create({
    data: mapOpeningStockData(tenantId, data),
    include: openingStockInclude,
  });
};

export const getOpeningStocks = async (tenantId, query) => {
  const { search, page, limit } = query;
  const where = buildListWhere(tenantId, search);
  const skip = (page - 1) * limit;
  const openingStockModel = getOpeningStockModel();

  const [data, total] = await prisma.$transaction([
    openingStockModel.findMany({
      where,
      include: openingStockInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    openingStockModel.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    limit,
  };
};

export const getOpeningStockById = async (tenantId, id) => {
  const openingStockModel = getOpeningStockModel();
  const openingStock = await openingStockModel.findFirst({
    where: {
      id,
      tenantId,
      deletedAt: null,
    },
    include: openingStockInclude,
  });

  if (!openingStock) {
    throw new HttpError(404, "Opening stock entry not found");
  }

  return openingStock;
};

export const updateOpeningStock = async (tenantId, id, data) => {
  await getOpeningStockById(tenantId, id);
  await ensureReferencesExist(tenantId, data);
  await ensureUniqueOpeningStock(tenantId, data, id);
  const openingStockModel = getOpeningStockModel();

  return openingStockModel.update({
    where: { id },
    data: mapOpeningStockData(tenantId, data),
    include: openingStockInclude,
  });
};

export const deleteOpeningStock = async (tenantId, id) => {
  await getOpeningStockById(tenantId, id);
  const openingStockModel = getOpeningStockModel();

  await openingStockModel.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });
};
