import axiosInstance from "../axiosInstance";
import { createAcrossDimensions } from "../createAcrossDimensions";

const tenantHeader = (tenantId = "") => {
  if (!tenantId) {
    return {};
  }
  if (Array.isArray(tenantId)) {
    const codes = [...new Set(tenantId.filter(Boolean))];
    if (!codes.length) {
      return {};
    }
    return {
      "x-tenant-id": codes[0],
      "x-tenant-ids": codes.join(","),
    };
  }
  return {
    "x-tenant-id": tenantId,
    "x-tenant-ids": tenantId,
  };
};

const mergeById = (items) => {
  const map = new Map();
  items.forEach((item) => {
    if (item?.id) map.set(String(item.id), item);
  });
  return [...map.values()];
};

const rawMaterialService = {
  async list(params, tenantId = "") {
    const response = await axiosInstance.get("/inventory/raw-materials", {
      params,
      headers: tenantHeader(tenantId),
    });
    return response.data;
  },
  async listAll(tenantId = "") {
    const collected = [];
    let page = 1;
    let total = Infinity;
    while (collected.length < total && page <= 50) {
      const response = await this.list(
        { page, limit: 100, search: "", ordering: "name,id" },
        tenantId,
      );
      const rows = response.data || [];
      total = Number(response.total ?? collected.length + rows.length);
      collected.push(...rows);
      if (!rows.length) break;
      page += 1;
    }
    return mergeById(collected);
  },
  async options(tenantId = "") {
    const response = await axiosInstance.get("/inventory/raw-materials/options/", {
      headers: tenantHeader(tenantId),
    });
    return response.data.data || [];
  },
  async getById(id) {
    const response = await axiosInstance.get(`/inventory/raw-materials/${id}/`);
    return response.data;
  },
  async create(payload, tenantIds) {
    const { response, isMulti, tenantIds: targets } = await createAcrossDimensions(
      (tenantId) =>
        axiosInstance.post("/inventory/raw-materials/", payload, {
          headers: tenantId ? { "x-tenant-id": tenantId } : {},
        }),
      tenantIds,
    );
    return {
      ...response.data,
      message: isMulti
        ? `Raw material created in ${targets.join(", ")}`
        : response.data?.message || "Raw material created successfully",
    };
  },
  async update(id, payload) {
    const response = await axiosInstance.put(`/inventory/raw-materials/${id}/`, payload);
    return response.data;
  },
  async remove(id) {
    const response = await axiosInstance.delete(`/inventory/raw-materials/${id}/`);
    return response.data;
  },
};

export default rawMaterialService;
