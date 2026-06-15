import axiosInstance from "../axiosInstance";

const BASE_URL = "/accounts/bank-transfers/";

const mapTransfer = (transfer) => ({
  ...transfer,
  fromBankAccountId:
    transfer.from_bank_account?.id || transfer.from_bank_account_id || "",
  toBankAccountId: transfer.to_bank_account?.id || transfer.to_bank_account_id || "",
  amount: transfer.amount ?? 0,
});

class BankTransferService {
  async list({ page = 1, limit = 20, search = "" }) {
    const response = await axiosInstance.get(BASE_URL, {
      params: { page, limit, search },
    });

    const items = response.data.data || response.data.results || [];
    return {
      data: items.map(mapTransfer),
      total: response.data.total || 0,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  }

  async listBankAccounts() {
    const response = await axiosInstance.get(`${BASE_URL}bank-accounts/`);
    return response.data.data || [];
  }

  async getById(id) {
    const response = await axiosInstance.get(`${BASE_URL}${id}/`);
    return mapTransfer(response.data.data || response.data);
  }

  async create(payload) {
    const response = await axiosInstance.post(BASE_URL, payload);
    return {
      data: mapTransfer(response.data.data || response.data),
      message: response.data.message || "Bank transfer created successfully",
    };
  }

  async update(id, payload) {
    const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
    return {
      data: mapTransfer(response.data.data || response.data),
      message: response.data.message || "Bank transfer updated successfully",
    };
  }

  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return {
      data: null,
      message: response.data.message || "Bank transfer deleted successfully",
    };
  }
}

export default new BankTransferService();
