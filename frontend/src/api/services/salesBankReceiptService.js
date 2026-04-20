import axiosInstance from "../axiosInstance";

const BASE_URL = "/sales/sales-bank-receipts/";

const mapReceipt = (receipt) => ({
  ...receipt,
  customerId: receipt.customer?.id || receipt.customer_id || "",
  salesInvoiceId: receipt.sales_invoice?.id || receipt.sales_invoice_id || "",
  bankAccountId: receipt.bank_account?.id || receipt.bank_account_id || "",
  amount: receipt.amount ?? 0,
  invoiceNetAmount: receipt.invoice_net_amount ?? receipt.invoiceNetAmount ?? 0,
  invoiceReturnedAmount:
    receipt.invoice_returned_amount ?? receipt.invoiceReturnedAmount ?? 0,
  invoiceReceivedAmount:
    receipt.invoice_received_amount ?? receipt.invoiceReceivedAmount ?? 0,
  invoiceBalanceAmount:
    receipt.invoice_balance_amount ?? receipt.invoiceBalanceAmount ?? 0,
});

class SalesBankReceiptService {
  async list({ page = 1, limit = 20, search = "" }) {
    const response = await axiosInstance.get(BASE_URL, {
      params: { page, limit, search },
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
    return mapReceipt(response.data);
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

    return response.data.data || [];
  }
}

export default new SalesBankReceiptService();
