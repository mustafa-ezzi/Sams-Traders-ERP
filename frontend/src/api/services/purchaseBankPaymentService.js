import axiosInstance from "../axiosInstance";

const BASE_URL = "/purchase/purchase-bank-payments/";

const mapPayment = (payment) => ({
  ...payment,
  supplierId: payment.supplier?.id || payment.supplier_id || "",
  purchaseInvoiceId:
    payment.purchase_invoice?.id || payment.purchase_invoice_id || "",
  bankAccountId: payment.bank_account?.id || payment.bank_account_id || "",
  amount: payment.amount ?? 0,
  invoiceNetAmount: payment.invoice_net_amount ?? payment.invoiceNetAmount ?? 0,
  invoiceReturnedAmount:
    payment.invoice_returned_amount ?? payment.invoiceReturnedAmount ?? 0,
  invoicePaidAmount: payment.invoice_paid_amount ?? payment.invoicePaidAmount ?? 0,
  invoiceBalanceAmount:
    payment.invoice_balance_amount ?? payment.invoiceBalanceAmount ?? 0,
});

class PurchaseBankPaymentService {
  async list({ page = 1, limit = 20, search = "" }) {
    const response = await axiosInstance.get(BASE_URL, {
      params: { page, limit, search },
    });

    const items = response.data.data || response.data.results || [];
    return {
      data: items.map(mapPayment),
      total: response.data.total || 0,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  }

  async getById(id) {
    const response = await axiosInstance.get(`${BASE_URL}${id}/`);
    return mapPayment(response.data);
  }

  async create(payload) {
    const response = await axiosInstance.post(BASE_URL, payload);
    return {
      data: mapPayment(response.data.data || response.data),
      message: response.data.message || "Purchase bank payment created successfully",
    };
  }

  async update(id, payload) {
    const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
    return {
      data: mapPayment(response.data.data || response.data),
      message: response.data.message || "Purchase bank payment updated successfully",
    };
  }

  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return {
      data: null,
      message: response.data.message || "Purchase bank payment deleted successfully",
    };
  }

  async getInvoiceOptions(supplierId, paymentId = "") {
    if (!supplierId) {
      return [];
    }

    const response = await axiosInstance.get(`${BASE_URL}invoice-options/`, {
      params: {
        supplier_id: supplierId,
        payment_id: paymentId || "",
      },
    });

    return response.data.data || [];
  }
}

export default new PurchaseBankPaymentService();
