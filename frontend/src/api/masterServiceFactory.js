import axiosInstance from "./axiosInstance";
import { createAcrossDimensions } from "./createAcrossDimensions";

export const createMasterService = (resource) => ({
  async list(params) {
    const response = await axiosInstance.get(`/inventory/${resource}`, { params });
    return response.data;
  },
  async getById(id) {
    const response = await axiosInstance.get(`/inventory/${resource}/${id}`);
    return response.data;
  },
  async create(payload) {
    const { response } = await createAcrossDimensions((tenantId) =>
      axiosInstance.post(`/inventory/${resource}/`, payload, {
        headers: tenantId ? { "x-tenant-id": tenantId } : {},
      })
    );
    return response.data;
  },
  async update(id, payload) {
    const response = await axiosInstance.put(`/inventory/${resource}/${id}/`, payload);
    return response.data;
  },
  async remove(id) {
    const response = await axiosInstance.delete(`/inventory/${resource}/${id}/`);
    return response.data;
  },
});
