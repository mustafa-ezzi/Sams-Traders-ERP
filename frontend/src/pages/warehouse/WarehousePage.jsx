import { z } from "zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import warehouseService from "../../api/services/warehouseService";
import StateView from "../../components/StateView";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  location: z.string().trim().min(1, "Location is required"),
});

const WarehousePage = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "", location: "" },
  });

  const loadRecords = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await warehouseService.list({ page: 1, limit: 20, search: "" });
      setRecords(response.data || []);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Failed to load warehouses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editingId) {
        await warehouseService.update(editingId, values);
      } else {
        await warehouseService.create(values);
      }
      setEditingId("");
      form.reset({ name: "", location: "" });
      await loadRecords();
    } catch (submitError) {
      setError(submitError?.response?.data?.message || "Save failed");
    }
  });

  return (
    <section className="space-y-6">
      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(240,248,255,0.96))]">
        
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
          Warehouses
        </h2>
       
      </Card>

      <Card>
        <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={onSubmit}>
          <FormInput label="Warehouse Name" required placeholder="Warehouse name" error={form.formState.errors.name?.message} {...form.register("name")} />
          <FormInput label="Location" required placeholder="Warehouse location" error={form.formState.errors.location?.message} {...form.register("location")} />
          <Button className="md:mt-[34px]" type="submit">
            {editingId ? "Update" : "Create"}
          </Button>
        </form>
      </Card>

      <StateView loading={loading} error={error} isEmpty={!loading && !error && records.length === 0} emptyMessage="No warehouses found">
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Location</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50">
                    <td className="px-5 py-4 font-semibold text-slate-800">{row.name}</td>
                    <td className="px-5 py-4 text-slate-600">{row.location}</td>
                    <td className="px-5 py-4 text-right">
                      <button type="button" className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800" onClick={() => { setEditingId(row.id); form.reset({ name: row.name, location: row.location }); }}>
                        Edit
                      </button>
                      <button type="button" className="font-semibold text-rose-600 transition hover:text-rose-800" onClick={async () => { await warehouseService.remove(row.id); await loadRecords(); }}>
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

export default WarehousePage;
