import axiosInstance from "../axiosInstance";

const productService = {
  async list(params) {
    const response = await axiosInstance.get("/products", { params });
    return response.data;
  },
  async create(payload) {
    const response = await axiosInstance.post("/products", payload);
    return response.data;
  },
  async update(id, payload) {
    const response = await axiosInstance.put(`/products/${id}`, payload);
    return response.data;
  },
  async remove(id) {
    const response = await axiosInstance.delete(`/products/${id}`);
    return response.data;
  },
};

export default productService;

