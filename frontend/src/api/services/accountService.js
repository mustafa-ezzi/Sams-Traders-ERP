import axiosInstance from "../axiosInstance";
import { createAcrossDimensions } from "../createAcrossDimensions";

const accountService = {
  async list(params) {
    const response = await axiosInstance.get("/accounts/accounts/", { params });
    return response.data;
  },
  async getById(id) {
    const response = await axiosInstance.get(`/accounts/accounts/${id}/`);
    return response.data;
  },
  async listOpeningAccounts() {
    const response = await axiosInstance.get("/accounts/accounts/opening-accounts/");
    return response.data.data || { root: null, banks: [] };
  },
  async createOpeningBank(payload) {
    const { response } = await createAcrossDimensions((tenantId) =>
      axiosInstance.post("/accounts/accounts/opening-banks/", payload, {
        headers: tenantId ? { "x-tenant-id": tenantId } : {},
      })
    );
    return response.data;
  },
  async createOpeningAccountItem(payload) {
    const { response } = await createAcrossDimensions((tenantId) =>
      axiosInstance.post("/accounts/accounts/opening-account-items/", payload, {
        headers: tenantId ? { "x-tenant-id": tenantId } : {},
      })
    );
    return response.data;
  },
  async create(payload) {
    const { response } = await createAcrossDimensions((tenantId) =>
      axiosInstance.post("/accounts/accounts/", payload, {
        headers: tenantId ? { "x-tenant-id": tenantId } : {},
      })
    );
    return response.data;
  },
  async update(id, payload) {
    const response = await axiosInstance.put(`/accounts/accounts/${id}/`, payload);
    return response.data;
  },
  async remove(id) {
    const response = await axiosInstance.delete(`/accounts/accounts/${id}/`);
    return response.data;
  },
  async getLedgerReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/ledger-report/", {
      params,
      headers: selectedTenant ? { "x-tenant-id": selectedTenant } : {},
    });
    return response.data.data || {};
  },
  async getPartyLedgerReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/party-ledger-report/", {
      params,
      headers: selectedTenant ? { "x-tenant-id": selectedTenant } : {},
    });
    return response.data.data || {};
  },
  async getBalanceSheetReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/balance-sheet-report/", {
      params,
      headers: selectedTenant ? { "x-tenant-id": selectedTenant } : {},
    });
    return response.data.data || {};
  },
  async getCoaCompletenessReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/coa-completeness-report/", {
      params,
      headers: selectedTenant ? { "x-tenant-id": selectedTenant } : {},
    });
    return response.data.data || {};
  },
  async getDashboardOverview(selectedTenant = "", period = "all") {
    const response = await axiosInstance.get("/accounts/accounts/dashboard-overview/", {
      params: { period },
      headers: selectedTenant ? { "x-tenant-id": selectedTenant } : {},
    });
    return response.data.data || {};
  },
};

export default accountService;
