import axiosInstance from "../axiosInstance";
import { createAcrossDimensions } from "../createAcrossDimensions";

const rawMaterialService = {
  async list(params) {
    const response = await axiosInstance.get("/inventory/raw-materials", { params });
    return response.data;
  },
  async create(payload) {
    const { response } = await createAcrossDimensions((tenantId) =>
      axiosInstance.post("/inventory/raw-materials/", payload, {
        headers: tenantId ? { "x-tenant-id": tenantId } : {},
      })
    );
    return response.data;
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
