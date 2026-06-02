import axios from "axios";

// const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://backend-production-d32f.up.railway.app/api";


const adminAuthService = {
  async login(payload) {
    const response = await axios.post(`${BASE_URL}/auth/admin/login/`, payload);
    return response.data;
  },
  logout() {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminRefreshToken");
  },
};

export default adminAuthService;
