import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import productService from "../../api/services/productService";
import accountService from "../../api/services/accountService";
import unitService from "../../api/services/unitService";
import StateView from "../../components/StateView";
import { formatDecimal } from "../../utils/format";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import ConfirmModal from "../../components/ui/ConfirmModal";
import IconButton from "../../components/ui/IconButton";
import { useToast } from "../../context/ToastContext";
import { flattenAccountTree, getPostableInventoryAccounts } from "../../utils/accounts";

const extractErrorMessage = (error) => {
  const data = error?.response?.data;
  if (!data) return error?.message || "Delete failed";
  if (typeof data === "string") return data;
  if (data.message) return data.message;
  if (typeof data.detail === "string") return data.detail;

  const fieldEntry = Object.entries(data).find(([, value]) =>
    typeof value === "string" || Array.isArray(value)
  );
  if (fieldEntry) {
    const [, value] = fieldEntry;
    return Array.isArray(value) ? value.join(", ") : value;
  }
  return "Delete failed";
};

const ProductPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unitOptions, setUnitOptions] = useState([]);
  const [inventoryAccounts, setInventoryAccounts] = useState([]);
  const [cogsAccounts, setCogsAccounts] = useState([]);
  const [revenueAccounts, setRevenueAccounts] = useState([]);
  const [deleteId, setDeleteId] = useState("");
  const limit = 10;

  const load = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await productService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1, "");
    Promise.all([
      unitService.list({ page: 1, limit: 100, search: "" }),
      accountService.list(),
    ])
      .then(([unitRes, accountRes]) => {
        const flatAccounts = flattenAccountTree(accountRes || []);
        setUnitOptions(unitRes.data || []);
        setInventoryAccounts(getPostableInventoryAccounts(flatAccounts));
        setCogsAccounts(
          flatAccounts.filter((account) => account.account_group === "COGS" && account.is_postable)
        );
        setRevenueAccounts(
          flatAccounts.filter((account) => account.account_group === "REVENUE" && account.is_postable)
        );
      })
      .catch(() => toast.error("Failed to load product setup options"));
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const onDelete = async (id) => {
    try {
      await productService.remove(id);
      toast.success("Product deleted");
      await load();
    } catch (deleteError) {
      const message = extractErrorMessage(deleteError);
      setError(message);
      toast.error(message);
    }
  };

  return (
    <section className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Product"
        description="This action will soft delete the product if it has no active stock references. Continue?"
        onCancel={() => setDeleteId("")}
        onConfirm={async () => {
          const selectedId = deleteId;
          setDeleteId("");
          await onDelete(selectedId);
        }}
      />

      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(240,248,255,0.96))]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Products
            </h2>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-64"
              placeholder="Search products"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="secondary" onClick={() => load(1, search)}>
              Search
            </Button>
            <Button onClick={() => navigate("/products/create")}>Create Product</Button>
          </div>
        </div>
      </Card>

      <StateView loading={loading} error={error} isEmpty={!loading && !error && records.length === 0} emptyMessage="No products found">
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Name</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Type</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Unit</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Qty</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Materials</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Accounts</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Material Cost</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Packaging</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Net Amount</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Avg Cost</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Stock Value</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((row) => {
                  const totalMaterialCost = row.materials?.reduce((sum, m) => sum + (Number(m.amount) || 0), 0) || 0;
                  return (
                    <tr key={row.id} className="bg-white transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${
                          (row.product_type === "ASSEMBLY_PRODUCT" || row.product_type === "MANUFACTURED")
                            ? "border-violet-200 bg-violet-50 text-violet-700"
                            : "border-slate-200 bg-slate-100 text-slate-600"
                        }`}>
                          {(row.product_type === "ASSEMBLY_PRODUCT" || row.product_type === "MANUFACTURED")
                            ? "Assembly Product"
                            : "Finished Good"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {unitOptions.find((unit) => unit.id === row.unit)?.name || "-"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{formatDecimal(row.quantity)}</td>
                      <td className="px-4 py-3">
                        {row.materials?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {row.materials.map((m, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                              >
                                {m.raw_material_name ?? "Unknown"}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div>Inv: {inventoryAccounts.find((account) => account.id === row.inventory_account)?.code || "-"}</div>
                        <div>COGS: {cogsAccounts.find((account) => account.id === row.cogs_account)?.code || "-"}</div>
                        <div>Rev: {revenueAccounts.find((account) => account.id === row.revenue_account)?.code || "-"}</div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{formatDecimal(totalMaterialCost)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{formatDecimal(row.packaging_cost)}</td>
                      <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{formatDecimal(row.net_amount)}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-emerald-700">{formatDecimal(row.average_cost)}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">{formatDecimal(row.stock_value)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex gap-2">
                          <IconButton
                            icon="edit"
                            label="Edit product"
                            onClick={() => navigate(`/products/${row.id}/edit`)}
                          />
                          <IconButton
                            icon="delete"
                            label="Delete product"
                            onClick={() => setDeleteId(row.id)}
                          />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-center text-xs sm:text-left">{total} total records</span>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
              <Button variant="secondary" type="button" disabled={page <= 1} onClick={() => load(page - 1, search)}>
                Prev
              </Button>
              <span className="text-xs font-medium text-slate-700">Page {page} / {totalPages}</span>
              <Button variant="secondary" type="button" disabled={page >= totalPages} onClick={() => load(page + 1, search)}>
                Next
              </Button>
            </div>
          </div>
        </Card>
      </StateView>
    </section>
  );
};

export default ProductPage;
