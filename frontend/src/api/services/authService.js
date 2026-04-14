import axiosInstance from "../axiosInstance";

const authService = {
  /**
   * Login with email, password, and tenant_id
   * Backend returns: { access, refresh, user: { id, email, tenant_id } }
   */
  async login(payload) {
    try {
      const response = await axiosInstance.post("/auth/login/", payload);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Logout - clears stored tokens
   */
  logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("tenantId");
  },
};

export default authService;

