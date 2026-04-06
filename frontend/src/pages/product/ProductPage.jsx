import { z } from "zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import productService from "../../api/services/productService";
import rawMaterialService from "../../api/services/rawMaterialService";
import StateView from "../../components/StateView";
import { formatDecimal } from "../../utils/format";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import { useToast } from "../../context/ToastContext";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  productType: z.enum(["READY_MADE", "MANUFACTURED"]),
  packagingCost: z.coerce.number().min(0),
});

const defaultValues = {
  name: "",
  productType: "READY_MADE",
  packagingCost: 0,
};

const ProductPage = () => {
  const [records, setRecords] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rawMaterialOptions, setRawMaterialOptions] = useState([]);
  const [materialRows, setMaterialRows] = useState([
    { rawMaterialId: "", quantity: 1, rate: 0 },
  ]);
  const limit = 10;
  const toast = useToast();
  const form = useForm({ resolver: zodResolver(schema), defaultValues });
  const productType = form.watch("productType");

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
    rawMaterialService
      .list({ page: 1, limit: 100, search: "" })
      .then((res) => setRawMaterialOptions(res.data || []))
      .catch(() => toast.error("Failed to load raw material options"));
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const sanitizedRows = materialRows
        .filter((row) => row.rawMaterialId)
        .map((row) => ({
          rawMaterialId: row.rawMaterialId,
          quantity: Number(row.quantity),
          rate: Number(row.rate),
        }));

      const payload = {
        name: values.name,
        productType: values.productType,
        packagingCost: values.packagingCost,
        materials: values.productType === "MANUFACTURED" ? sanitizedRows : [],
      };

      if (editingId) {
        await productService.update(editingId, payload);
        toast.success("Product updated");
      } else {
        await productService.create(payload);
        toast.success("Product created");
      }

      setEditingId("");
      form.reset(defaultValues);
      setMaterialRows([{ rawMaterialId: "", quantity: 1, rate: 0 }]);
      await load();
    } catch (submitError) {
      const msg = submitError?.response?.data?.message || submitError.message || "Save failed";
      setError(msg);
      toast.error(msg);
    }
  });

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const selectedMaterialIds = materialRows.map((row) => row.rawMaterialId).filter(Boolean);

  return (
    <section className="space-y-6">
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
          </div>
        </div>
      </Card>

      <Card>
        <form className="grid gap-4 xl:grid-cols-3" onSubmit={onSubmit}>
          <FormInput
            label="Product Name"
            required
            placeholder="Enter product name"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Product Type</label>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              {...form.register("productType")}
            >
              <option value="READY_MADE">READY_MADE</option>
              <option value="MANUFACTURED">MANUFACTURED</option>
            </select>
          </div>

          <FormInput
            label="Packaging Cost"
            required
            type="number"
            step="0.01"
            error={form.formState.errors.packagingCost?.message}
            {...form.register("packagingCost")}
          />

          <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4 xl:col-span-3">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">Material Lines</p>
                <p className="text-sm text-slate-500">
                  Server-side amount and net amount calculation stays intact.
                </p>
              </div>
              {productType === "MANUFACTURED" && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setMaterialRows((prev) => [
                      ...prev,
                      { rawMaterialId: "", quantity: 1, rate: 0 },
                    ])
                  }
                >
                  Add Line
                </Button>
              )}
            </div>

            {productType === "READY_MADE" ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-5 text-sm text-slate-500">
                READY_MADE products do not require raw material lines.
              </div>
            ) : (
              <div className="space-y-3">
                {materialRows.map((row, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-2xl border border-white bg-white p-3 shadow-sm md:grid-cols-[1.5fr_1fr_1fr_auto]"
                  >
                    <select
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      value={row.rawMaterialId}
                      onChange={(event) =>
                        setMaterialRows((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, rawMaterialId: event.target.value } : item
                          )
                        )
                      }
                    >
                      <option value="">Select raw material</option>
                      {rawMaterialOptions.map((option) => (
                        <option
                          key={option.id}
                          value={option.id}
                          disabled={
                            selectedMaterialIds.includes(option.id) &&
                            option.id !== row.rawMaterialId
                          }
                        >
                          {option.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      placeholder="Quantity"
                      value={row.quantity}
                      onChange={(event) =>
                        setMaterialRows((prev) =>
                          prev.map((item, i) =>
                            i === index
                              ? { ...item, quantity: Number(event.target.value || 0) }
                              : item
                          )
                        )
                      }
                    />
                    <input
                      type="number"
                      step="0.01"
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      placeholder="Rate"
                      value={row.rate}
                      onChange={(event) =>
                        setMaterialRows((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, rate: Number(event.target.value || 0) } : item
                          )
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() =>
                        setMaterialRows((prev) =>
                          prev.length === 1
                            ? [{ rawMaterialId: "", quantity: 1, rate: 0 }]
                            : prev.filter((_, i) => i !== index)
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:col-span-3">
            <Button className="w-full sm:w-fit" type="submit">
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => {
                  setEditingId("");
                  form.reset(defaultValues);
                  setMaterialRows([{ rawMaterialId: "", quantity: 1, rate: 0 }]);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <StateView loading={loading} error={error} isEmpty={!loading && !error && records.length === 0} emptyMessage="No products found">
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Type</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Packaging</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Net Amount</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Lines</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50">
                    <td className="px-5 py-4 font-semibold text-slate-800">{row.name}</td>
                    <td className="px-5 py-4 text-slate-600">{row.productType}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDecimal(row.packagingCost)}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDecimal(row.netAmount)}</td>
                    <td className="px-5 py-4 text-slate-600">{row.materials?.length || 0}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800"
                        onClick={() => {
                          setEditingId(row.id);
                          form.reset({
                            name: row.name,
                            productType: row.productType,
                            packagingCost: Number(row.packagingCost),
                          });
                          setMaterialRows(
                            row.materials?.length
                              ? row.materials.map((m) => ({
                                  rawMaterialId: m.rawMaterialId,
                                  quantity: Number(m.quantity),
                                  rate: Number(m.rate),
                                }))
                              : [{ rawMaterialId: "", quantity: 1, rate: 0 }]
                          );
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="font-semibold text-rose-600 transition hover:text-rose-800"
                        onClick={async () => {
                          if (!window.confirm("Delete this product?")) return;
                          await productService.remove(row.id);
                          toast.success("Product deleted");
                          await load();
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-center sm:text-left">{total} total records</span>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
              <Button variant="secondary" type="button" disabled={page <= 1} onClick={() => load(page - 1, search)}>
                Prev
              </Button>
              <span className="font-semibold text-slate-700">Page {page} / {totalPages}</span>
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
