import axiosInstance from "../axiosInstance";

const BASE_URL = "/sales/sales-orders/";

const mapOrder = (order) => ({
  ...order,
  customerId: order.customer?.id || "",
  warehouseId: order.warehouse?.id || "",
  salesmanId: order.salesman?.id || "",
  dcNumber: order.dc_number ?? order.dcNumber ?? "",
  dueDate: order.due_date ?? order.dueDate ?? "",
  orderDiscount: order.order_discount ?? order.orderDiscount ?? 0,
  grossAmount: order.gross_amount ?? order.grossAmount ?? 0,
  netAmount: order.net_amount ?? order.netAmount ?? 0,
  isInvoiced: Boolean(order.is_invoiced ?? order.isInvoiced),
  lines: (order.lines || []).map((line) => ({
    ...line,
    productId: line.product?.id || line.product_id || "",
    productName: line.product?.name || "",
  })),
});

class SalesOrderService {
  async list({ page = 1, limit = 20, search = "", invoiced = "", ordering = "" } = {}) {
    const params = { page, limit, search, ordering };
    if (invoiced === true || invoiced === false) {
      params.invoiced = invoiced ? "true" : "false";
    }
    const response = await axiosInstance.get(BASE_URL, { params });
    const items = response.data.data || response.data.results || [];
    return {
      data: items.map(mapOrder),
      total: response.data.total || 0,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  }

  async getById(id) {
    const response = await axiosInstance.get(`${BASE_URL}${id}/`);
    return mapOrder(response.data);
  }

  async create(payload) {
    const response = await axiosInstance.post(BASE_URL, payload);
    return {
      data: mapOrder(response.data.data || response.data),
      message: response.data.message || "Sales order created successfully",
    };
  }

  async update(id, payload) {
    const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
    return {
      data: mapOrder(response.data.data || response.data),
      message: response.data.message || "Sales order updated successfully",
    };
  }

  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return {
      data: null,
      message: response.data.message || "Sales order deleted successfully",
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

export default new SalesOrderService();
