import axiosInstance from "../axiosInstance";

const tenantHeader = (selectedTenant = "") =>
  selectedTenant ? { "x-tenant-id": selectedTenant } : {};

const accountService = {
  async list(params) {
    const response = await axiosInstance.get("/accounts/accounts/", { params });
    return response.data;
  },
  async getById(id) {
    const response = await axiosInstance.get(`/accounts/accounts/${id}/`);
    return response.data;
  },
  async listOpeningAccounts(selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/opening-accounts/", {
      headers: tenantHeader(selectedTenant),
    });
    return response.data.data || { root: null, banks: [] };
  },
  async createOpeningBank(payload) {
    const response = await axiosInstance.post(
      "/accounts/accounts/opening-banks/",
      payload,
    );
    return response.data;
  },
  async updateOpeningBank(bankCode, payload) {
    const response = await axiosInstance.put(
      `/accounts/accounts/opening-banks/${bankCode}/`,
      payload,
    );
    return response.data;
  },
  async deleteOpeningBank(bankCode) {
    const response = await axiosInstance.delete(
      `/accounts/accounts/opening-banks/${bankCode}/`,
    );
    return response.data;
  },
  async createOpeningAccountItem(payload, selectedTenant = "") {
    const response = await axiosInstance.post(
      "/accounts/accounts/opening-account-items/",
      payload,
      {
        headers: tenantHeader(selectedTenant),
      },
    );
    return response.data;
  },
  async create(payload) {
    const response = await axiosInstance.post("/accounts/accounts/", payload);
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
      headers: tenantHeader(selectedTenant),
    });
    return response.data.data || {};
  },
  async getPartyLedgerReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/party-ledger-report/", {
      params,
      headers: tenantHeader(selectedTenant),
    });
    return response.data.data || {};
  },
  async getBalanceSheetReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/balance-sheet-report/", {
      params,
      headers: tenantHeader(selectedTenant),
    });
    return response.data.data || {};
  },
  async getCoaCompletenessReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/coa-completeness-report/", {
      params,
      headers: tenantHeader(selectedTenant),
    });
    return response.data.data || {};
  },
  async getDashboardOverview(selectedTenant = "", period = "all") {
    const response = await axiosInstance.get("/accounts/accounts/dashboard-overview/", {
      params: { period },
      headers: tenantHeader(selectedTenant),
    });
    return response.data.data || {};
  },
};

export default accountService;
