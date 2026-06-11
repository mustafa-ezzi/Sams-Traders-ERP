import axiosInstance from "../axiosInstance";

const BASE_URL = "/accounts/expenses/";

const mapExpense = (expense) => ({
  ...expense,
  bankAccountId: expense.bank_account?.id || expense.bank_account_id || "",
  expenseAccountId: expense.expense_account?.id || expense.expense_account_id || "",
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
