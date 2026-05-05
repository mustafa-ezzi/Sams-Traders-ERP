import axiosInstance from "../axiosInstance";

const BASE_URL = "/accounts/inquiries/";

const supportInquiryService = {
  async list(params) {
    const response = await axiosInstance.get(BASE_URL, { params });
    return response.data;
  },
  async create(payload) {
    const response = await axiosInstance.post(BASE_URL, payload);
    return response.data;
  },
};

export default supportInquiryService;

