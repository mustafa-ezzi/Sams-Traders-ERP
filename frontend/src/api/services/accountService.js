import axiosInstance from "../axiosInstance";

const accountService = {
  async list(params) {
    const response = await axiosInstance.get("/accounts/accounts/", { params });
    return response.data;
  },
  async getById(id) {
    const response = await axiosInstance.get(`/accounts/accounts/${id}/`);
    return response.data;
  },
  async create(payload) {
    const response = await axiosInstance.post("/accounts/accounts/", payload);
    return response.data;
  },
  async update(id, payload) {
    const response = await axiosInstance.put(`/accounts/accounts/${id}/`, payload);
    return response.data;
  },
  async remove(id) {
    const response = await axiosInstance.delete(`/accounts/accounts/${id}/`);
    return response.data;
  },
};

export default accountService;
