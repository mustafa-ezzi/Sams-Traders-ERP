import axiosInstance from "../axiosInstance";

const BASE = "/accounts/audit-logs/";

const auditLogService = {
  async list({
    page = 1,
    limit = 20,
    search = "",
    action = "",
    entityType = "",
    dateFrom = "",
    dateTo = "",
  } = {}) {
    const response = await axiosInstance.get(BASE, {
      params: {
        page,
        limit,
        search,
        ...(action ? { action } : {}),
        ...(entityType ? { entity_type: entityType } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
      },
    });
    return {
      data: response.data.data || response.data.results || [],
      total: response.data.total || 0,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  },
};

export default auditLogService;
