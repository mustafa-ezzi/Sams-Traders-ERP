import axios from "axios";

const adminAxiosInstance = axios.create({
  // baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api",
  baseURL: import.meta.env.VITE_API_BASE_URL || "https://backend-production-d32f.up.railway.app/api",

});

adminAxiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("adminToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

adminAxiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminRefreshToken");
      window.location.href = "/admin/login";
    }
    return Promise.reject(error);
  }
);

export default adminAxiosInstance;
