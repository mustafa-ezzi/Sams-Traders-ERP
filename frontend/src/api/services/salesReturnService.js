import axiosInstance from "../axiosInstance";

const BASE_URL = "/sales/sales-returns/";

const mapSalesReturn = (salesReturn) => ({
  ...salesReturn,
  customerId: salesReturn.customer?.id || salesReturn.customer_id || "",
  salesInvoiceId: salesReturn.sales_invoice?.id || salesReturn.sales_invoice_id || "",
  grossAmount: salesReturn.gross_amount ?? salesReturn.grossAmount ?? 0,
  lines: (salesReturn.lines || []).map((line) => ({
    ...line,
    productId: line.product?.id || line.product_id || "",
    productName: line.product?.name || "",
    soldQuantity: line.sold_quantity ?? line.soldQuantity ?? "0.00",
    maxReturnQuantity: line.max_return_quantity ?? line.maxReturnQuantity ?? "0.00",
  })),
});

class SalesReturnService {
  async list({ page = 1, limit = 20, search = "" }) {
    const response = await axiosInstance.get(BASE_URL, {
      params: { page, limit, search },
    });

    const items = response.data.data || response.data.results || [];
    return {
      data: items.map(mapSalesReturn),
      total: response.data.total || 0,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  }

  async getById(id) {
    const response = await axiosInstance.get(`${BASE_URL}${id}/`);
    return mapSalesReturn(response.data);
  }

  async create(payload) {
    const response = await axiosInstance.post(BASE_URL, payload);
    return {
      data: mapSalesReturn(response.data.data || response.data),
      message: response.data.message || "Sales return created successfully",
    };
  }

  async update(id, payload) {
    const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
    return {
      data: mapSalesReturn(response.data.data || response.data),
      message: response.data.message || "Sales return updated successfully",
    };
  }

  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return {
      data: null,
      message: response.data.message || "Sales return deleted successfully",
    };
  }

  async getInvoiceOptions(customerId) {
    if (!customerId) {
      return [];
    }

    const response = await axiosInstance.get(`${BASE_URL}invoice-options/`, {
      params: { customer_id: customerId },
    });
    return response.data.data || [];
  }

  async getInvoiceLines(salesInvoiceId, salesReturnId = "") {
    if (!salesInvoiceId) {
      return null;
    }

    const response = await axiosInstance.get(`${BASE_URL}invoice-lines/`, {
      params: {
        sales_invoice_id: salesInvoiceId,
        sales_return_id: salesReturnId || "",
      },
    });

    const data = response.data.data || {};
    return {
      ...data,
      lines: (data.lines || []).map((line) => ({
        ...line,
        salesInvoiceLineId: line.sales_invoice_line_id || line.salesInvoiceLineId || "",
        productId: line.product_id || line.productId || "",
        productName: line.product_name || line.productName || "",
        soldQuantity: line.sold_quantity ?? line.soldQuantity ?? "0.00",
        returnQuantity: line.return_quantity ?? line.returnQuantity ?? "0.00",
        maxReturnQuantity: line.max_return_quantity ?? line.maxReturnQuantity ?? "0.00",
      })),
    };
  }
}

export default new SalesReturnService();
