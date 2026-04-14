import axiosInstance from "./axiosInstance";

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
    const response = await axiosInstance.post(`/inventory/${resource}/`, payload);
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
