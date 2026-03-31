import prisma from "../lib/prisma.js";
import { HttpError } from "../utils/httpError.js";

const rawMaterialInclude = {
  brand: true,
  category: true,
  size: true,
  purchaseUnit: true,
  sellingUnit: true,
};

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
  const existing = await prisma.rawMaterial.findFirst({
    where: {
      tenantId,
      name,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });

  if (existing) {
    throw new HttpError(400, "Raw material with this name already exists");
  }
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
    ensureReferenceExists("brand", data.brandId, tenantId, "Brand"),
    ensureReferenceExists("category", data.categoryId, tenantId, "Category"),
    ensureReferenceExists("size", data.sizeId, tenantId, "Size"),
    ensureReferenceExists(
      "unit",
      data.purchaseUnitId,
      tenantId,
      "Purchase unit"
    ),
    ensureReferenceExists(
      "unit",
      data.sellingUnitId,
      tenantId,
      "Selling unit"
    ),
  ]);
};

const mapRawMaterialData = (tenantId, data) => ({
  tenantId,
  name: data.name,
  brandId: data.brandId,
  categoryId: data.categoryId,
  sizeId: data.sizeId,
  purchaseUnitId: data.purchaseUnitId,
  sellingUnitId: data.sellingUnitId,
  quantity: data.quantity,
  purchasePrice: data.purchasePrice,
  sellingPrice: data.sellingPrice,
});

export const createRawMaterial = async (tenantId, data) => {
  await ensureUniqueName(tenantId, data.name);
  await ensureReferencesExist(tenantId, data);

  return prisma.rawMaterial.create({
    data: mapRawMaterialData(tenantId, data),
    include: rawMaterialInclude,
  });
};

export const getRawMaterials = async (tenantId, query) => {
  const { search, page, limit } = query;
  const where = buildListWhere(tenantId, search);
  const skip = (page - 1) * limit;

  const [data, total] = await prisma.$transaction([
    prisma.rawMaterial.findMany({
      where,
      include: rawMaterialInclude,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.rawMaterial.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    limit,
  };
};

export const getRawMaterialById = async (tenantId, id) => {
  const rawMaterial = await prisma.rawMaterial.findFirst({
    where: {
      id,
      tenantId,
      deletedAt: null,
    },
    include: rawMaterialInclude,
  });

  if (!rawMaterial) {
    throw new HttpError(404, "Raw material not found");
  }

  return rawMaterial;
};

export const updateRawMaterial = async (tenantId, id, data) => {
  await getRawMaterialById(tenantId, id);
  await ensureUniqueName(tenantId, data.name, id);
  await ensureReferencesExist(tenantId, data);

  return prisma.rawMaterial.update({
    where: { id },
    data: mapRawMaterialData(tenantId, data),
    include: rawMaterialInclude,
  });
};

export const deleteRawMaterial = async (tenantId, id) => {
  await getRawMaterialById(tenantId, id);

  await prisma.rawMaterial.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });
};
