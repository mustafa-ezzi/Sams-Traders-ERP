import axiosInstance from "../axiosInstance";

const BASE_URL = "/accounts/dimensions/";

const dimensionService = {
  async list() {
    const response = await axiosInstance.get(BASE_URL);
    return response.data.results || response.data.data || response.data || [];
  },
  async create(payload) {
    const response = await axiosInstance.post(BASE_URL, payload);
    return response.data;
  },
  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return response.data;
  },
};

export default dimensionService;
