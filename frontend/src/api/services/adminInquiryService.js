import adminAxiosInstance from "../adminAxiosInstance";

const BASE_URL = "/accounts/admin/inquiries/";

const adminInquiryService = {
  async list() {
    const response = await adminAxiosInstance.get(BASE_URL);
    return response.data.results || response.data || [];
  },
  async close(id) {
    const response = await adminAxiosInstance.patch(`${BASE_URL}${id}/`, {
      status: "CLOSED",
    });
    return response.data;
  },
  async reply(id, adminReply) {
    const response = await adminAxiosInstance.patch(`${BASE_URL}${id}/`, {
      admin_reply: adminReply,
      status: "CLOSED",
    });
    return response.data;
  },
};

export default adminInquiryService;

