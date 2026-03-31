import { z } from "zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import openingStockService from "../../api/services/openingStockService";
import StateView from "../../components/StateView";
import { formatDecimal } from "../../utils/format";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";

const schema = z.object({
  date: z.string().min(1, "Date is required"),
  warehouseId: z.string().uuid("warehouseId must be a valid UUID"),
  rawMaterialId: z.string().uuid("rawMaterialId must be a valid UUID"),
  purchaseQuantity: z.coerce.number().min(0),
  sellingQuantity: z.coerce.number().min(0),
});

const defaultValues = {
  date: "",
  warehouseId: "",
  rawMaterialId: "",
  purchaseQuantity: 0,
  sellingQuantity: 0,
};

const OpeningStockPage = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const form = useForm({ resolver: zodResolver(schema), defaultValues });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await openingStockService.list({ page: 1, limit: 20, search: "" });
      setRecords(response.data || []);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Failed to load opening stock");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editingId) {
        await openingStockService.update(editingId, values);
      } else {
        await openingStockService.create(values);
      }
      setEditingId("");
      form.reset(defaultValues);
      await load();
    } catch (submitError) {
      setError(submitError?.response?.data?.message || "Save failed");
    }
  });

  return (
    <section className="space-y-6">
      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(240,248,255,0.96))]">
        <p className="text-xs font-bold uppercase tracking-[0.26em] text-blue-500">
          Inventory Snapshot
        </p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
          Opening Stock
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Register initial stock balances so the ERP starts from a clean baseline.
        </p>
      </Card>

      <Card>
        <form className="grid gap-4 xl:grid-cols-3" onSubmit={onSubmit}>
          <FormInput label="Date" required type="date" error={form.formState.errors.date?.message} {...form.register("date")} />
          <FormInput label="Warehouse UUID" required placeholder="Warehouse UUID" error={form.formState.errors.warehouseId?.message} {...form.register("warehouseId")} />
          <FormInput label="Raw Material UUID" required placeholder="Raw material UUID" error={form.formState.errors.rawMaterialId?.message} {...form.register("rawMaterialId")} />
          <FormInput label="Purchase Quantity" required type="number" step="0.01" error={form.formState.errors.purchaseQuantity?.message} {...form.register("purchaseQuantity")} />
          <FormInput label="Selling Quantity" required type="number" step="0.01" error={form.formState.errors.sellingQuantity?.message} {...form.register("sellingQuantity")} />
          <Button className="xl:mt-[34px]" type="submit">
            {editingId ? "Update" : "Create"}
          </Button>
        </form>
      </Card>

      <StateView loading={loading} error={error} isEmpty={!loading && !error && records.length === 0} emptyMessage="No opening stock entries found">
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Date</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Purchase Qty</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Selling Qty</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50">
                    <td className="px-5 py-4 font-semibold text-slate-800">{String(row.date).slice(0, 10)}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDecimal(row.purchaseQuantity)}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDecimal(row.sellingQuantity)}</td>
                    <td className="px-5 py-4 text-right">
                      <button type="button" className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800" onClick={() => { setEditingId(row.id); form.reset({ date: String(row.date).slice(0, 10), warehouseId: row.warehouseId, rawMaterialId: row.rawMaterialId, purchaseQuantity: Number(row.purchaseQuantity), sellingQuantity: Number(row.sellingQuantity) }); }}>
                        Edit
                      </button>
                      <button type="button" className="font-semibold text-rose-600 transition hover:text-rose-800" onClick={async () => { await openingStockService.remove(row.id); await load(); }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </StateView>
    </section>
  );
};

export default OpeningStockPage;
