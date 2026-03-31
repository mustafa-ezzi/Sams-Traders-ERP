import prisma from "../lib/prisma.js";
import { HttpError } from "../utils/httpError.js";

const roundToTwo = (value) => Number(Number(value).toFixed(2));

const productInclude = {
  materials: {
    where: {
      deletedAt: null,
    },
    include: {
      rawMaterial: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  },
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
  const existing = await prisma.product.findFirst({
    where: {
      tenantId,
      name,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });

  if (existing) {
    throw new HttpError(400, "Product with this name already exists");
  }
};

const ensureMaterialsAreValid = async (tenantId, productType, materials) => {
  if (productType === "READY_MADE" && materials.length > 0) {
    throw new HttpError(
      400,
      "READY_MADE products cannot have raw material line items"
    );
  }

  if (productType === "MANUFACTURED" && materials.length === 0) {
    throw new HttpError(
      400,
      "MANUFACTURED products must include at least one raw material line item"
    );
  }

  const materialIds = materials.map((material) => material.rawMaterialId);
  const uniqueMaterialIds = new Set(materialIds);

  if (uniqueMaterialIds.size !== materialIds.length) {
    throw new HttpError(
      400,
      "Duplicate raw material line items are not allowed in a product"
    );
  }

  if (uniqueMaterialIds.size === 0) {
    return;
  }

  const rawMaterials = await prisma.rawMaterial.findMany({
    where: {
      id: {
        in: [...uniqueMaterialIds],
      },
      tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (rawMaterials.length !== uniqueMaterialIds.size) {
    throw new HttpError(
      400,
      "One or more raw materials were not found for this tenant"
    );
  }
};

const prepareMaterialLines = (materials) =>
  materials.map((material) => {
    const amount = roundToTwo(material.quantity * material.rate);

    return {
      rawMaterialId: material.rawMaterialId,
      quantity: material.quantity,
      rate: material.rate,
      amount,
    };
  });

const calculateNetAmount = (packagingCost, materials) => {
  const materialsTotal = materials.reduce(
    (sum, material) => sum + material.amount,
    0
  );

  return roundToTwo(materialsTotal + packagingCost);
};

export const createProduct = async (tenantId, data) => {
  await ensureUniqueName(tenantId, data.name);
  await ensureMaterialsAreValid(tenantId, data.productType, data.materials);

  const materialLines = prepareMaterialLines(data.materials);
  const netAmount = calculateNetAmount(data.packagingCost, materialLines);

  return prisma.product.create({
    data: {
      tenantId,
      name: data.name,
      productType: data.productType,
      packagingCost: data.packagingCost,
      netAmount,
      materials: {
        create: materialLines.map((material) => ({
          tenantId,
          ...material,
        })),
      },
    },
    include: productInclude,
  });
};

export const getProducts = async (tenantId, query) => {
  const { search, page, limit } = query;
  const where = buildListWhere(tenantId, search);
  const skip = (page - 1) * limit;

  const [data, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data,
    total,
    page,
    limit,
  };
};

export const getProductById = async (tenantId, id) => {
  const product = await prisma.product.findFirst({
    where: {
      id,
      tenantId,
      deletedAt: null,
    },
    include: productInclude,
  });

  if (!product) {
    throw new HttpError(404, "Product not found");
  }

  return product;
};

export const updateProduct = async (tenantId, id, data) => {
  await getProductById(tenantId, id);
  await ensureUniqueName(tenantId, data.name, id);
  await ensureMaterialsAreValid(tenantId, data.productType, data.materials);

  const materialLines = prepareMaterialLines(data.materials);
  const netAmount = calculateNetAmount(data.packagingCost, materialLines);

  return prisma.$transaction(async (tx) => {
    await tx.productRawMaterial.updateMany({
      where: {
        productId: id,
        tenantId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return tx.product.update({
      where: { id },
      data: {
        tenantId,
        name: data.name,
        productType: data.productType,
        packagingCost: data.packagingCost,
        netAmount,
        materials: {
          create: materialLines.map((material) => ({
            tenantId,
            ...material,
          })),
        },
      },
      include: productInclude,
    });
  });
};

export const deleteProduct = async (tenantId, id) => {
  await getProductById(tenantId, id);

  await prisma.$transaction(async (tx) => {
    await tx.productRawMaterial.updateMany({
      where: {
        productId: id,
        tenantId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    await tx.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  });
};
