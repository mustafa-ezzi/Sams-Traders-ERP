import axiosInstance from "./axiosInstance";

export const createMasterService = (resource) => ({
  async list(params) {
    const response = await axiosInstance.get(`/${resource}`, { params });
    return response.data;
  },
  async create(payload) {
    const response = await axiosInstance.post(`/${resource}`, payload);
    return response.data;
  },
  async update(id, payload) {
    const response = await axiosInstance.put(`/${resource}/${id}`, payload);
    return response.data;
  },
  async remove(id) {
    const response = await axiosInstance.delete(`/${resource}/${id}`);
    return response.data;
  },
});

