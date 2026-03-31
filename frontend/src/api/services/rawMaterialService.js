import axiosInstance from "../axiosInstance";

const rawMaterialService = {
  async list(params) {
    const response = await axiosInstance.get("/raw-materials", { params });
    return response.data;
  },
  async create(payload) {
    const response = await axiosInstance.post("/raw-materials", payload);
    return response.data;
  },
  async update(id, payload) {
    const response = await axiosInstance.put(`/raw-materials/${id}`, payload);
    return response.data;
  },
  async remove(id) {
    const response = await axiosInstance.delete(`/raw-materials/${id}`);
    return response.data;
  },
};

export default rawMaterialService;

