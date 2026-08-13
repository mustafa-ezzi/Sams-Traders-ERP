import axiosInstance from "../axiosInstance";

const BASE_URL = "/accounts/journal-vouchers/";

const mapLine = (line) => ({
  ...line,
  tenantId: line.tenant_id || "",
  accountId: line.account?.id || line.account_id || "",
  description: line.description || "",
  debit: line.debit ?? 0,
  credit: line.credit ?? 0,
});

const mapVoucher = (voucher) => ({
  ...voucher,
  lines: (voucher.lines || []).map(mapLine),
  accountSummary: voucher.account_summary || "",
  dimensionSummary: voucher.dimension_summary || "",
  lineCount: voucher.line_count ?? (voucher.lines || []).length,
  totalDebit: voucher.total_debit ?? 0,
  totalCredit: voucher.total_credit ?? 0,
  amount: voucher.amount ?? 0,
});

class JournalVoucherService {
  async list({ page = 1, limit = 20, search = "", ordering = "" }) {
    const response = await axiosInstance.get(BASE_URL, {
      params: { page, limit, search, ordering },
    });

    const items = response.data.data || response.data.results || [];
    return {
      data: items.map(mapVoucher),
      total: response.data.total || 0,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  }

  async getById(id) {
    const response = await axiosInstance.get(`${BASE_URL}${id}/`);
    return mapVoucher(response.data);
  }

  async create(payload) {
    const response = await axiosInstance.post(BASE_URL, payload);
    return {
      data: mapVoucher(response.data.data || response.data),
      message: response.data.message || "Journal voucher created successfully",
    };
  }

  async update(id, payload) {
    const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
    return {
      data: mapVoucher(response.data.data || response.data),
      message: response.data.message || "Journal voucher updated successfully",
    };
  }

  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return {
      data: null,
      message: response.data.message || "Journal voucher deleted successfully",
    };
  }
}

export default new JournalVoucherService();
