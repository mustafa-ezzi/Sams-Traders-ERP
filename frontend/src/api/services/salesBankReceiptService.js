import axiosInstance from "../axiosInstance";

const BASE_URL = "/sales/sales-bank-receipts/";

const mapReceipt = (receipt) => ({
  ...receipt,
  bankAccountId: receipt.bank_account?.id || receipt.bank_account_id || "",
  tenantId: receipt.tenant_id || receipt.tenantId || "",
  dimensionName: receipt.dimension_name || receipt.dimensionName || "",
  amount: receipt.amount ?? 0,
  lineCount: receipt.line_count ?? receipt.lines?.length ?? 0,
  customerSummary: receipt.customer_summary || "",
  referenceSummary: receipt.reference_summary || "",
  recoveryCommissionAmount:
    receipt.recovery_commission_amount ?? receipt.recoveryCommissionAmount ?? 0,
  lines: receipt.lines || [],
});

class SalesBankReceiptService {
  async list({ page = 1, limit = 20, search = "", ordering = "" }) {
    const response = await axiosInstance.get(BASE_URL, {
      params: { page, limit, search, ordering },
    });

    const items = response.data.data || response.data.results || [];
    return {
      data: items.map(mapReceipt),
      total: response.data.total || 0,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  }

  async getById(id) {
    const response = await axiosInstance.get(`${BASE_URL}${id}/`);
    return mapReceipt(response.data.data || response.data);
  }

  async create(payload) {
    const response = await axiosInstance.post(BASE_URL, payload);
    return {
      data: mapReceipt(response.data.data || response.data),
      message: response.data.message || "Sales bank receipt created successfully",
    };
  }

  async update(id, payload) {
    const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
    return {
      data: mapReceipt(response.data.data || response.data),
      message: response.data.message || "Sales bank receipt updated successfully",
    };
  }

  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return {
      data: null,
      message: response.data.message || "Sales bank receipt deleted successfully",
    };
  }

  async getInvoiceOptions(customerId, receiptId = "") {
    if (!customerId) {
      return [];
    }

    const response = await axiosInstance.get(`${BASE_URL}invoice-options/`, {
      params: {
        customer_id: customerId,
        receipt_id: receiptId || "",
      },
    });

    return (response.data.data || []).map((item) => ({
      ...item,
      receipt_against: item.receipt_against || "INVOICE",
    }));
  }
}

export default new SalesBankReceiptService();
