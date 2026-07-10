import axiosInstance from "../axiosInstance";

const BASE_URL = "/inventory/party-opening-balances/";

const mapRecord = (record) => ({
  ...record,
  tenantId: record.tenant_id || record.tenantId || "",
  customerId: record.customer?.id || record.customer_id || "",
  supplierId: record.supplier?.id || record.supplier_id || "",
  partyName:
    record.customer?.business_name ||
    record.supplier?.business_name ||
    "",
});

class PartyOpeningBalanceService {
  async list({ page = 1, limit = 20, search = "", partyType = "" } = {}) {
    const response = await axiosInstance.get(BASE_URL, {
      params: {
        page,
        limit,
        search,
        party_type: partyType,
      },
    });
    const items = response.data.data || response.data.results || [];
    return {
      data: items.map(mapRecord),
      total: response.data.total || 0,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  }

  async create(payload, tenantId = "") {
    const response = await axiosInstance.post(BASE_URL, payload, {
      headers: tenantId
        ? { "x-tenant-id": tenantId, "x-tenant-ids": tenantId }
        : {},
    });
    return {
      data: mapRecord(response.data.data || response.data),
      message: response.data.message || "Opening balance saved successfully",
    };
  }

  async update(id, payload) {
    const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
    return {
      data: mapRecord(response.data.data || response.data),
      message: response.data.message || "Opening balance updated successfully",
    };
  }

  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return {
      data: null,
      message: response.data.message || "Opening balance deleted successfully",
    };
  }
}

export default new PartyOpeningBalanceService();
