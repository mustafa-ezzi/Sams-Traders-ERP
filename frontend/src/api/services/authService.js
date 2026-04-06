import axiosInstance from "../axiosInstance";

const authService = {
  async login(payload) {
    const response = await axiosInstance.post("/login/", payload);
    return response.data;
  },
};

export default authService;

