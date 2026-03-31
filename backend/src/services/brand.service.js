import prisma from "../lib/prisma.js";
import { HttpError } from "../utils/httpError.js";

const buildWhere = (tenantId, search) => ({
  tenantId,
  deletedAt: null,
  ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
});

const ensureUniqueName = async (tenantId, name, excludeId) => {
  const existing = await prisma.brand.findFirst({
    where: {
      tenantId,
      name,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (existing) throw new HttpError(400, "Brand with this name already exists");
};

export const createBrand = async (tenantId, data) => {
  await ensureUniqueName(tenantId, data.name);
  return prisma.brand.create({ data: { tenantId, name: data.name } });
};

export const getBrands = async (tenantId, query) => {
  const where = buildWhere(tenantId, query.search);
  const skip = (query.page - 1) * query.limit;
  const [data, total] = await prisma.$transaction([
    prisma.brand.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: query.limit }),
    prisma.brand.count({ where }),
  ]);
  return { data, total, page: query.page, limit: query.limit };
};

export const getBrandById = async (tenantId, id) => {
  const record = await prisma.brand.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!record) throw new HttpError(404, "Brand not found");
  return record;
};

export const updateBrand = async (tenantId, id, data) => {
  await getBrandById(tenantId, id);
  await ensureUniqueName(tenantId, data.name, id);
  return prisma.brand.update({ where: { id }, data: { tenantId, name: data.name } });
};

export const deleteBrand = async (tenantId, id) => {
  await getBrandById(tenantId, id);
  await prisma.brand.update({ where: { id }, data: { deletedAt: new Date() } });
};

