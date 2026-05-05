import adminAxiosInstance from "../adminAxiosInstance";

const adminDimensionService = {
  async list() {
    const response = await adminAxiosInstance.get("/accounts/admin/dimensions/");
    return response.data.results || response.data || [];
  },
};

export default adminDimensionService;
