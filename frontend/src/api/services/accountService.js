import axiosInstance from "../axiosInstance";

const tenantHeader = (selectedTenant = "") => {
  if (!selectedTenant) {
    return {};
  }
  if (Array.isArray(selectedTenant)) {
    const codes = [...new Set(selectedTenant.filter(Boolean))];
    if (!codes.length) {
      return {};
    }
    return {
      "x-tenant-id": codes[0],
      "x-tenant-ids": codes.join(","),
    };
  }
  return {
    "x-tenant-id": selectedTenant,
    "x-tenant-ids": selectedTenant,
  };
};

const accountService = {
  async list(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/", {
      params,
      headers: tenantHeader(selectedTenant),
    });
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
  async getProfitLossReport(params, selectedTenant = "") {
    const response = await axiosInstance.get(
      "/accounts/accounts/profit-loss-report/",
      {
        params,
        headers: tenantHeader(selectedTenant),
      },
    );
    return response.data.data || {};
  },
  async getCoaCompletenessReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/coa-completeness-report/", {
      params,
      headers: tenantHeader(selectedTenant),
    });
    return response.data.data || {};
  },
  async getReceivableAgingReport(params, selectedTenant = "") {
    const response = await axiosInstance.get(
      "/accounts/accounts/receivable-aging-report/",
      {
        params,
        headers: tenantHeader(selectedTenant),
      },
    );
    return response.data.data || {};
  },
  async getPayableAgingReport(params, selectedTenant = "") {
    const response = await axiosInstance.get(
      "/accounts/accounts/payable-aging-report/",
      {
        params,
        headers: tenantHeader(selectedTenant),
      },
    );
    return response.data.data || {};
  },
  async getSalesmanPerformanceReport(params, selectedTenant = "") {
    const response = await axiosInstance.get(
      "/accounts/accounts/salesman-performance-report/",
      {
        params,
        headers: tenantHeader(selectedTenant),
      },
    );
    return response.data.data || {};
  },
  async getSalesReport(params, selectedTenant = "") {
    const response = await axiosInstance.get(
      "/accounts/accounts/sales-report/",
      {
        params,
        headers: tenantHeader(selectedTenant),
      },
    );
    return response.data.data || {};
  },
  async getTrialBalanceReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/trial-balance-report/", {
      params,
      headers: tenantHeader(selectedTenant),
    });
    return response.data.data || {};
  },
  async getGeneralLedgerReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/general-ledger-report/", {
      params,
      headers: tenantHeader(selectedTenant),
    });
    return response.data.data || {};
  },
  async getDayBookReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/day-book-report/", {
      params,
      headers: tenantHeader(selectedTenant),
    });
    return response.data.data || {};
  },
  async getCashFlowSummaryReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/cash-flow-summary-report/", {
      params,
      headers: tenantHeader(selectedTenant),
    });
    return response.data.data || {};
  },
  async getAccountStatementReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/account-statement-report/", {
      params,
      headers: tenantHeader(selectedTenant),
    });
    return response.data.data || {};
  },
  async getComparativeProfitLossReport(params, selectedTenant = "") {
    const response = await axiosInstance.get(
      "/accounts/accounts/comparative-profit-loss-report/",
      {
        params,
        headers: tenantHeader(selectedTenant),
      },
    );
    return response.data.data || {};
  },
  async getExpenseAnalysisReport(params, selectedTenant = "") {
    const response = await axiosInstance.get("/accounts/accounts/expense-analysis-report/", {
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
