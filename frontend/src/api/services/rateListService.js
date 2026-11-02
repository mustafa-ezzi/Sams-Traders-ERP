import axiosInstance from "../axiosInstance";

const BASE_URL = "/inventory/rate-lists/";

const mapLine = (line) => ({
  id: line.id,
  productId: line.product_id || line.productId || "",
  groupId: line.group_id || line.groupId || null,
  groupName: line.group_name || line.groupName || "",
  sku: line.sku || "",
  productName: line.product_name || line.productName || "",
  uomName: line.uom_name || line.uomName || "",
  description: line.description || "",
  cost: line.cost ?? 0,
  percentage: line.percentage ?? 0,
  tradePrice: line.trade_price ?? line.tradePrice ?? 0,
  discountPercent: line.discount_percent ?? line.discountPercent ?? 0,
  sellingPrice: line.selling_price ?? line.sellingPrice ?? 0,
  includeInPrint: line.include_in_print ?? line.includeInPrint ?? true,
  sortOrder: line.sort_order ?? line.sortOrder ?? 0,
});

const mapRateList = (record) => ({
  id: record.id,
  tenantId: record.tenant_id || record.tenantId || "",
  title: record.title || "",
  listDate: record.list_date || record.listDate || "",
  notes: record.notes || "",
  lineCount: record.line_count ?? record.lineCount ?? (record.lines || []).length,
  lines: (record.lines || []).map(mapLine),
  createdAt: record.created_at || record.createdAt || "",
  updatedAt: record.updated_at || record.updatedAt || "",
});

const rateListService = {
  async list({ page = 1, limit = 20, search = "", ordering = "" } = {}) {
    const response = await axiosInstance.get(BASE_URL, {
      params: { page, limit, search, ordering },
    });
    const items = response.data.data || response.data.results || [];
    return {
      data: items.map(mapRateList),
      total: response.data.total || 0,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  },

  async getById(id) {
    const response = await axiosInstance.get(`${BASE_URL}${id}/`);
    return mapRateList(response.data);
  },

  async create(payload) {
    const response = await axiosInstance.post(BASE_URL, payload);
    return {
      data: mapRateList(response.data),
      message: response.data?.message || "Rate list created successfully",
    };
  },

  async update(id, payload) {
    const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
    return {
      data: mapRateList(response.data),
      message: response.data?.message || "Rate list updated successfully",
    };
  },

  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return response.data || { message: "Rate list deleted successfully" };
  },
};

export default rateListService;
