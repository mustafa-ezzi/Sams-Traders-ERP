import axiosInstance from "../axiosInstance";
import { createAcrossDimensions } from "../createAcrossDimensions";

const rawMaterialService = {
  async list(params, tenantId = "") {
    const response = await axiosInstance.get("/inventory/raw-materials", {
      params,
      headers: tenantId
        ? { "x-tenant-id": tenantId, "x-tenant-ids": tenantId }
        : {},
    });
    return response.data;
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
