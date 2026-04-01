import prisma from "../lib/prisma.js";
import { HttpError } from "../utils/httpError.js";

const buildListWhere = (tenantId, search) => ({
  tenantId,
  deletedAt: null,
  ...(search
    ? {
        OR: [
          {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            location: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      }
    : {}),
});

const ensureUniqueName = async (tenantId, name, excludeId) => {
  const existing = await prisma.warehouse.findFirst({
    where: {
      tenantId,
      name,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });

  if (existing) {
    throw new HttpError(400, "Warehouse with this name already exists");
  }
};

const mapWarehouseData = (tenantId, data) => ({
  tenantId,
  name: data.name,
  location: data.location,
});

export const createWarehouse = async (tenantId, data) => {
  await ensureUniqueName(tenantId, data.name);

  return prisma.warehouse.create({
    data: mapWarehouseData(tenantId, data),
  });
};

export const getWarehouses = async (tenantId, query) => {
  const { search, page, limit } = query;
  const where = buildListWhere(tenantId, search);
  const skip = (page - 1) * limit;

  const [data, total] = await prisma.$transaction([
    prisma.warehouse.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.warehouse.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    limit,
  };
};

export const getWarehouseById = async (tenantId, id) => {
  const warehouse = await prisma.warehouse.findFirst({
    where: {
      id,
      tenantId,
      deletedAt: null,
    },
  });

  if (!warehouse) {
    throw new HttpError(404, "Warehouse not found");
  }

  return warehouse;
};

export const updateWarehouse = async (tenantId, id, data) => {
  await getWarehouseById(tenantId, id);
  await ensureUniqueName(tenantId, data.name, id);

  return prisma.warehouse.update({
    where: { id },
    data: mapWarehouseData(tenantId, data),
  });
};

export const deleteWarehouse = async (tenantId, id) => {
  const openingStockCount = await prisma.openingStock.count({
    where: {
      tenantId,
      warehouseId: id,
      deletedAt: null,
    },
  });

  if (openingStockCount > 0) {
    throw new HttpError(
      400,
      "Warehouse cannot be deleted because opening stock entries exist"
    );
  }

  await getWarehouseById(tenantId, id);

  await prisma.warehouse.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });
};
