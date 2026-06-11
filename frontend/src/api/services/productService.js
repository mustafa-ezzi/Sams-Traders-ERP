import axiosInstance from "../axiosInstance";
import { createAcrossDimensions } from "../createAcrossDimensions";

const productService = {
  async list(params) {
    const response = await axiosInstance.get("/inventory/products", { params });
    return response.data;
  },
  async getById(id) {
    const response = await axiosInstance.get(`/inventory/products/${id}/`);
    return response.data;
  },
  async create(payload, tenantIds) {
    const { response, isMulti, tenantIds: targets } = await createAcrossDimensions(
      (tenantId) =>
        axiosInstance.post("/inventory/products/", payload, {
          headers: tenantId ? { "x-tenant-id": tenantId } : {},
        }),
      tenantIds,
    );
    return {
      ...response.data,
      message: isMulti
        ? `Product created in ${targets.join(", ")}`
        : response.data?.message || "Product created successfully",
    };
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
