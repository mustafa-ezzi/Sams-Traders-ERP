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
  const existing = await prisma.size.findFirst({
    where: {
      tenantId,
      name,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });

  if (existing) {
    throw new HttpError(400, "Size with this name already exists");
  }
};

const mapSizeData = (tenantId, data) => ({
  tenantId,
  name: data.name,
});

export const createSize = async (tenantId, data) => {
  await ensureUniqueName(tenantId, data.name);

  return prisma.size.create({
    data: mapSizeData(tenantId, data),
  });
};

export const getSizes = async (tenantId, query) => {
  const { search, page, limit } = query;
  const where = buildListWhere(tenantId, search);
  const skip = (page - 1) * limit;

  const [data, total] = await prisma.$transaction([
    prisma.size.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.size.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    limit,
  };
};

export const getSizeById = async (tenantId, id) => {
  const size = await prisma.size.findFirst({
    where: {
      id,
      tenantId,
      deletedAt: null,
    },
  });

  if (!size) {
    throw new HttpError(404, "Size not found");
  }

  return size;
};

export const updateSize = async (tenantId, id, data) => {
  await getSizeById(tenantId, id);
  await ensureUniqueName(tenantId, data.name, id);

  return prisma.size.update({
    where: { id },
    data: mapSizeData(tenantId, data),
  });
};

export const deleteSize = async (tenantId, id) => {
  await getSizeById(tenantId, id);

  await prisma.size.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });
};

