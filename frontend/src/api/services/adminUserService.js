import adminAxiosInstance from "../adminAxiosInstance";

const BASE_URL = "/accounts/admin/users/";

const adminUserService = {
  async list() {
    const response = await adminAxiosInstance.get(BASE_URL);
    return response.data.results || response.data || [];
  },
  async create(payload) {
    const response = await adminAxiosInstance.post(BASE_URL, payload);
    return response.data;
  },
  async update(id, payload) {
    const response = await adminAxiosInstance.patch(`${BASE_URL}${id}/`, payload);
    return response.data;
  },
  async remove(id) {
    const response = await adminAxiosInstance.delete(`${BASE_URL}${id}/`);
    return response.data;
  },
};

export default adminUserService;
