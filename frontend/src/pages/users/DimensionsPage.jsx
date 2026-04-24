import { useEffect, useState } from "react";
import dimensionService from "../../api/services/dimensionService";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import ConfirmModal from "../../components/ui/ConfirmModal";
import FormInput from "../../components/ui/FormInput";
import StateView from "../../components/StateView";
import { useToast } from "../../context/ToastContext";

const DimensionsPage = () => {
  const toast = useToast();
  const [dimensions, setDimensions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    is_active: true,
  });

  const extractErrorMessage = (loadError) =>
    loadError?.response?.data?.detail ||
    loadError?.response?.data?.message ||
    loadError?.response?.data?.code?.[0] ||
    loadError?.response?.data?.name?.[0] ||
    "Something went wrong";

  const loadDimensions = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await dimensionService.list();
      setDimensions(response || []);
    } catch (loadError) {
      setError(extractErrorMessage(loadError) || "Failed to load dimensions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDimensions();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      const response = await dimensionService.remove(deleteTarget.id);
      toast.success(response.message || "Dimension deleted successfully");
      await loadDimensions();
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError));
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Please enter a dimension name");
      return;
    }

    setSaving(true);
    try {
      const response = await dimensionService.create({
        name: form.name.trim(),
        code: form.code.trim(),
        is_active: form.is_active,
      });
      toast.success(response.message || "Dimension created successfully");
      setForm({ name: "", code: "", is_active: true });
      await loadDimensions();
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Dimension"
        description="This will delete the dimension only if it has no active users or business data. Continue?"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(237,247,255,0.98))]">
        <div>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Dimensions
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Create a new dimension for a separate business workspace. Default chart of accounts is created automatically.
          </p>
        </div>
      </Card>

      <Card>
        <form className="grid gap-4 md:grid-cols-3" onSubmit={handleSubmit}>
          <FormInput
            label="Dimension Name"
            required
            placeholder="Northern Division"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
          <FormInput
            label="Dimension Code"
            placeholder="Optional, auto-generated if blank"
            value={form.code}
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
          />
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-700 md:self-end">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
            />
            Active dimension
          </label>

          <div className="md:col-span-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create Dimension"}
            </Button>
          </div>
        </form>
      </Card>

      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && dimensions.length === 0}
        emptyMessage="No dimensions found"
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Code</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Status</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Created</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dimensions.map((dimension) => (
                  <tr key={dimension.id} className="border-t border-slate-100 bg-white">
                    <td className="px-5 py-4 font-semibold text-slate-800">{dimension.code}</td>
                    <td className="px-5 py-4 text-slate-700">{dimension.name}</td>
                    <td className="px-5 py-4 text-slate-600">{dimension.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-5 py-4 text-slate-600">
                      {dimension.created_at ? new Date(dimension.created_at).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        className="font-semibold text-rose-600 transition hover:text-rose-800"
                        onClick={() => setDeleteTarget(dimension)}
                      >
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

export default DimensionsPage;
