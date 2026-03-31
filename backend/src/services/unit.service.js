import prisma from "../lib/prisma.js";
import { HttpError } from "../utils/httpError.js";

const buildListWhere = (tenantId, search) => ({
  tenantId,
  deletedAt: null,
  ...(search
    ? {
        name: {
          contains: search,
          mode: "insensitive",
        },
      }
    : {}),
});

const ensureUniqueName = async (tenantId, name, excludeId) => {
  const existing = await prisma.unit.findFirst({
    where: {
      tenantId,
      name,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });

  if (existing) {
    throw new HttpError(400, "Unit with this name already exists");
  }
};

const mapUnitData = (tenantId, data) => ({
  tenantId,
  name: data.name,
});

export const createUnit = async (tenantId, data) => {
  await ensureUniqueName(tenantId, data.name);

  return prisma.unit.create({
    data: mapUnitData(tenantId, data),
  });
};

export const getUnits = async (tenantId, query) => {
  const { search, page, limit } = query;
  const where = buildListWhere(tenantId, search);
  const skip = (page - 1) * limit;

  const [data, total] = await prisma.$transaction([
    prisma.unit.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.unit.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    limit,
  };
};

export const getUnitById = async (tenantId, id) => {
  const unit = await prisma.unit.findFirst({
    where: {
      id,
      tenantId,
      deletedAt: null,
    },
  });

  if (!unit) {
    throw new HttpError(404, "Unit not found");
  }

  return unit;
};

export const updateUnit = async (tenantId, id, data) => {
  await getUnitById(tenantId, id);
  await ensureUniqueName(tenantId, data.name, id);

  return prisma.unit.update({
    where: { id },
    data: mapUnitData(tenantId, data),
  });
};

export const deleteUnit = async (tenantId, id) => {
  await getUnitById(tenantId, id);

  await prisma.unit.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });
};

