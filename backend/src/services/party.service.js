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
            businessName: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            phoneNumber: {
              contains: search,
            },
          },
          {
            email: {
              contains: search,
              mode: "insensitive",
            },
          },
        ],
      }
    : {}),
});

const mapPartyData = (tenantId, data) => ({
  tenantId,
  name: data.name,
  businessName: data.businessName,
  email: data.email || null,
  phoneNumber: data.phoneNumber,
  address: data.address,
});

const ensureUniqueBusinessName = async (model, tenantId, businessName, excludeId) => {
  const existing = await prisma[model].findFirst({
    where: {
      tenantId,
      businessName,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });

  if (existing) {
    throw new HttpError(400, `${model === "customer" ? "Customer" : "Supplier"} with this business name already exists`);
  }
};

const getPartyLabel = (model) => (model === "customer" ? "Customer" : "Supplier");

export const createParty = async (model, tenantId, data) => {
  await ensureUniqueBusinessName(model, tenantId, data.businessName);

  return prisma[model].create({
    data: mapPartyData(tenantId, data),
  });
};

export const getParties = async (model, tenantId, query) => {
  const { search, page, limit } = query;
  const where = buildListWhere(tenantId, search);
  const skip = (page - 1) * limit;

  const [data, total] = await prisma.$transaction([
    prisma[model].findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma[model].count({ where }),
  ]);

  return {
    data,
    total,
    page,
    limit,
  };
};

export const getPartyById = async (model, tenantId, id) => {
  const record = await prisma[model].findFirst({
    where: {
      id,
      tenantId,
      deletedAt: null,
    },
  });

  if (!record) {
    throw new HttpError(404, `${getPartyLabel(model)} not found`);
  }

  return record;
};

export const updateParty = async (model, tenantId, id, data) => {
  await getPartyById(model, tenantId, id);
  await ensureUniqueBusinessName(model, tenantId, data.businessName, id);

  return prisma[model].update({
    where: { id },
    data: mapPartyData(tenantId, data),
  });
};

export const deleteParty = async (model, tenantId, id) => {
  await getPartyById(model, tenantId, id);

  await prisma[model].update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });
};
