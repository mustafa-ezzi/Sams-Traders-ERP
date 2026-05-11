import axiosInstance from "../axiosInstance";

const BASE = "/auth/tenant-staff/";

const tenantStaffService = {
  async list() {
    const response = await axiosInstance.get(BASE);
    return response.data;
  },
  async create(payload) {
    const response = await axiosInstance.post(BASE, payload);
    return response.data;
  },
  async update(id, payload) {
    const response = await axiosInstance.put(`${BASE}${id}/`, payload);
    return response.data;
  },
  async remove(id) {
    const response = await axiosInstance.delete(`${BASE}${id}/`);
    return response.data;
  },
};

export default tenantStaffService;
