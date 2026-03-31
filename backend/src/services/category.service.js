import prisma from "../lib/prisma.js";
import { HttpError } from "../utils/httpError.js";

const buildWhere = (tenantId, search) => ({
  tenantId,
  deletedAt: null,
  ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
});

const ensureUniqueName = async (tenantId, name, excludeId) => {
  const existing = await prisma.category.findFirst({
    where: {
      tenantId,
      name,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (existing) throw new HttpError(400, "Category with this name already exists");
};

export const createCategory = async (tenantId, data) => {
  await ensureUniqueName(tenantId, data.name);
  return prisma.category.create({ data: { tenantId, name: data.name } });
};

export const getCategories = async (tenantId, query) => {
  const where = buildWhere(tenantId, query.search);
  const skip = (query.page - 1) * query.limit;
  const [data, total] = await prisma.$transaction([
    prisma.category.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: query.limit }),
    prisma.category.count({ where }),
  ]);
  return { data, total, page: query.page, limit: query.limit };
};

export const getCategoryById = async (tenantId, id) => {
  const record = await prisma.category.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!record) throw new HttpError(404, "Category not found");
  return record;
};

export const updateCategory = async (tenantId, id, data) => {
  await getCategoryById(tenantId, id);
  await ensureUniqueName(tenantId, data.name, id);
  return prisma.category.update({ where: { id }, data: { tenantId, name: data.name } });
};

export const deleteCategory = async (tenantId, id) => {
  await getCategoryById(tenantId, id);
  await prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
};

