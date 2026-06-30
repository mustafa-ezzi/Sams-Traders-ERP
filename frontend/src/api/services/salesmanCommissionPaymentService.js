import axiosInstance from "../axiosInstance";

const BASE_URL = "/sales/salesman-commission-payments/";

const mapPayment = (payment) => ({
  ...payment,
  salesmanId: payment.salesman?.id || payment.salesman_id || "",
  salesInvoiceId: payment.sales_invoice?.id || payment.sales_invoice_id || "",
  paymentAccountId: payment.payment_account?.id || payment.payment_account_id || "",
  payment: payment.payment ?? 0,
  commissionAmount: payment.commission_amount ?? payment.commissionAmount ?? 0,
  commissionPaidAmount:
    payment.commission_paid_amount ?? payment.commissionPaidAmount ?? 0,
  commissionPendingAmount:
    payment.commission_pending_amount ?? payment.commissionPendingAmount ?? 0,
});

class SalesmanCommissionPaymentService {
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
      message:
        response.data.message ||
        "Salesman commission voucher created successfully",
    };
  }

  async update(id, payload) {
    const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
    return {
      data: mapPayment(response.data.data || response.data),
      message:
        response.data.message ||
        "Salesman commission voucher updated successfully",
    };
  }

  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return {
      data: null,
      message:
        response.data.message ||
        "Salesman commission voucher deleted successfully",
    };
  }

  async getInvoiceOptions(salesmanId, paymentId = "") {
    if (!salesmanId) {
      return [];
    }

    const response = await axiosInstance.get(`${BASE_URL}invoice-options/`, {
      params: {
        salesman_id: salesmanId,
        payment_id: paymentId || "",
      },
    });

    return response.data.data || [];
  }
}

export default new SalesmanCommissionPaymentService();
