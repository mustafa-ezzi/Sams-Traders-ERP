import axiosInstance from "../axiosInstance";

const BASE_URL = "/sales/sales-invoices/";

const mapInvoice = (invoice) => ({
  ...invoice,
  customerId: invoice.customer?.id || "",
  warehouseId: invoice.warehouse?.id || "",
  invoiceDiscount: invoice.invoice_discount ?? invoice.invoiceDiscount ?? 0,
  grossAmount: invoice.gross_amount ?? invoice.grossAmount ?? 0,
  netAmount: invoice.net_amount ?? invoice.netAmount ?? 0,
  returnedAmount: invoice.returned_amount ?? invoice.returnedAmount ?? 0,
  receivedAmount: invoice.received_amount ?? invoice.receivedAmount ?? 0,
  balanceAmount: invoice.balance_amount ?? invoice.balanceAmount ?? 0,
  lines: (invoice.lines || []).map((line) => ({
    ...line,
    productId: line.product?.id || line.product_id || "",
    productName: line.product?.name || "",
    availableQuantity: line.available_quantity ?? line.availableQuantity ?? "0.00",
  })),
});

class SalesInvoiceService {
  async list({ page = 1, limit = 20, search = "" }) {
    const response = await axiosInstance.get(BASE_URL, {
      params: { page, limit, search },
    });

    const items = response.data.data || response.data.results || [];
    return {
      data: items.map(mapInvoice),
      total: response.data.total || 0,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  }

  async getById(id) {
    const response = await axiosInstance.get(`${BASE_URL}${id}/`);
    return mapInvoice(response.data);
  }

  async create(payload) {
    const response = await axiosInstance.post(BASE_URL, payload);
    return {
      data: mapInvoice(response.data.data || response.data),
      message: response.data.message || "Sales invoice created successfully",
    };
  }

  async update(id, payload) {
    const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
    return {
      data: mapInvoice(response.data.data || response.data),
      message: response.data.message || "Sales invoice updated successfully",
    };
  }

  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return {
      data: null,
      message: response.data.message || "Sales invoice deleted successfully",
    };
  }

  async getProductOptions(warehouseId, search = "") {
    const response = await axiosInstance.get(`${BASE_URL}product-options/`, {
      params: {
        warehouse_id: warehouseId || "",
        search,
      },
    });
    return response.data.data || [];
  }
}

export default new SalesInvoiceService();
