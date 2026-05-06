import axiosInstance from "../axiosInstance";
import { createAcrossDimensions } from "../createAcrossDimensions";

const productService = {
  async list(params) {
    const response = await axiosInstance.get("/inventory/products", { params });
    return response.data;
  },
  async create(payload) {
    const { response } = await createAcrossDimensions((tenantId) =>
      axiosInstance.post("/inventory/products/", payload, {
        headers: tenantId ? { "x-tenant-id": tenantId } : {},
      })
    );
    return response.data;
  },
  async update(id, payload) {
    const response = await axiosInstance.put(`/inventory/products/${id}/`, payload);
    return response.data;
  },
  async remove(id) {
    const response = await axiosInstance.delete(`/inventory/products/${id}/`);
    return response.data;
  },
};

export default productService;
