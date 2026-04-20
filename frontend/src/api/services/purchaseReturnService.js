import axiosInstance from "../axiosInstance";

const BASE_URL = "/purchase/purchase-returns/";

const mapPurchaseReturn = (purchaseReturn) => ({
  ...purchaseReturn,
  supplierId: purchaseReturn.supplier?.id || purchaseReturn.supplier_id || "",
  purchaseInvoiceId:
    purchaseReturn.purchase_invoice?.id || purchaseReturn.purchase_invoice_id || "",
  grossAmount: purchaseReturn.gross_amount ?? purchaseReturn.grossAmount ?? 0,
  lines: (purchaseReturn.lines || []).map((line) => ({
    ...line,
    productId: line.product?.id || line.product_id || "",
    productName: line.product?.name || "",
    soldQuantity: line.sold_quantity ?? line.soldQuantity ?? "0.00",
    maxReturnQuantity: line.max_return_quantity ?? line.maxReturnQuantity ?? "0.00",
  })),
});

class PurchaseReturnService {
  async list({ page = 1, limit = 20, search = "" }) {
    const response = await axiosInstance.get(BASE_URL, {
      params: { page, limit, search },
    });

    const items = response.data.data || response.data.results || [];
    return {
      data: items.map(mapPurchaseReturn),
      total: response.data.total || 0,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  }

  async getById(id) {
    const response = await axiosInstance.get(`${BASE_URL}${id}/`);
    return mapPurchaseReturn(response.data);
  }

  async create(payload) {
    const response = await axiosInstance.post(BASE_URL, payload);
    return {
      data: mapPurchaseReturn(response.data.data || response.data),
      message: response.data.message || "Purchase return created successfully",
    };
  }

  async update(id, payload) {
    const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
    return {
      data: mapPurchaseReturn(response.data.data || response.data),
      message: response.data.message || "Purchase return updated successfully",
    };
  }

  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return {
      data: null,
      message: response.data.message || "Purchase return deleted successfully",
    };
  }

  async getInvoiceOptions(supplierId) {
    if (!supplierId) {
      return [];
    }

    const response = await axiosInstance.get(`${BASE_URL}invoice-options/`, {
      params: { supplier_id: supplierId },
    });
    return response.data.data || [];
  }

  async getInvoiceLines(purchaseInvoiceId, purchaseReturnId = "") {
    if (!purchaseInvoiceId) {
      return null;
    }

    const response = await axiosInstance.get(`${BASE_URL}invoice-lines/`, {
      params: {
        purchase_invoice_id: purchaseInvoiceId,
        purchase_return_id: purchaseReturnId || "",
      },
    });

    const data = response.data.data || {};
    return {
      ...data,
      lines: (data.lines || []).map((line) => ({
        ...line,
        purchaseInvoiceLineId:
          line.purchase_invoice_line_id || line.purchaseInvoiceLineId || "",
        productId: line.product_id || line.productId || "",
        productName: line.product_name || line.productName || "",
        purchasedQuantity:
          line.purchased_quantity ?? line.purchasedQuantity ?? "0.00",
        soldQuantity: line.sold_quantity ?? line.soldQuantity ?? "0.00",
        returnQuantity: line.return_quantity ?? line.returnQuantity ?? "0.00",
        maxReturnQuantity:
          line.max_return_quantity ?? line.maxReturnQuantity ?? "0.00",
      })),
    };
  }
}

export default new PurchaseReturnService();
