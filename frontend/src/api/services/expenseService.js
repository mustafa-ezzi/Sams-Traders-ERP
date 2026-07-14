import axiosInstance from "../axiosInstance";

const BASE_URL = "/accounts/expenses/";

const mapExpenseLine = (line) => ({
  ...line,
  tenantId: line.tenant_id || "",
  bankAccountId: line.bank_account?.id || line.bank_account_id || "",
  expenseAccountId: line.expense_account?.id || line.expense_account_id || "",
  description: line.description || "",
  amount: line.amount ?? 0,
});

const mapExpense = (expense) => ({
  ...expense,
  lines: (expense.lines || []).map(mapExpenseLine),
  bankSummary: expense.bank_summary || "",
  expenseSummary: expense.expense_summary || "",
  dimensionSummary: expense.dimension_summary || "",
  descriptionSummary: (expense.lines || [])
    .map((line) => line.description)
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(", "),
  lineCount: expense.line_count ?? (expense.lines || []).length,
  amount: expense.amount ?? 0,
});

class ExpenseService {
  async list({ page = 1, limit = 20, search = "" }) {
    const response = await axiosInstance.get(BASE_URL, {
      params: { page, limit, search },
    });

    const items = response.data.data || response.data.results || [];
    return {
      data: items.map(mapExpense),
      total: response.data.total || 0,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  }

  async getById(id) {
    const response = await axiosInstance.get(`${BASE_URL}${id}/`);
    return mapExpense(response.data);
  }

  async create(payload) {
    const response = await axiosInstance.post(BASE_URL, payload);
    return {
      data: mapExpense(response.data.data || response.data),
      message: response.data.message || "Expense created successfully",
    };
  }

  async update(id, payload) {
    const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
    return {
      data: mapExpense(response.data.data || response.data),
      message: response.data.message || "Expense updated successfully",
    };
  }

  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return {
      data: null,
      message: response.data.message || "Expense deleted successfully",
    };
  }
}

export default new ExpenseService();
