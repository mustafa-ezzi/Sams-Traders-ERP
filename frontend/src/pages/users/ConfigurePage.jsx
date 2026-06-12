import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import dimensionService from "../../api/services/dimensionService";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import ConfirmModal from "../../components/ui/ConfirmModal";
import StateView from "../../components/StateView";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

const ConfigurePage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { createTenantIds, setAllowedDimensions, setCreateTenants, setTenant, tenantId } =
    useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const extractErrorMessage = (loadError) =>
    loadError?.response?.data?.detail ||
    loadError?.response?.data?.message ||
    loadError?.response?.data?.code?.[0] ||
    loadError?.response?.data?.sku_code?.[0] ||
    loadError?.response?.data?.name?.[0] ||
    "Something went wrong";

  const loadDimensions = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await dimensionService.list();
      setDimensions(response || []);
      setAllowedDimensions(response || []);
      if ((response || []).length > 0) {
        const currentTenant = localStorage.getItem("tenantId") || "";
        const exists = (response || []).some((item) => item.code === currentTenant);
        if (!exists) {
          setTenant(response[0].code);
        }
      }
    } catch (loadError) {
      setError(extractErrorMessage(loadError) || "Failed to load company configuration");
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
      toast.success(response.message || "Company configuration deleted");
      const remainingSelected = createTenantIds.filter(
        (code) => code !== deleteTarget.code,
      );
      const fallbackDimension = dimensions.find(
        (dimension) => dimension.code !== deleteTarget.code && dimension.is_active,
      );
      if (tenantId === deleteTarget.code && fallbackDimension) {
        setTenant(fallbackDimension.code);
      }
      setCreateTenants(
        remainingSelected.length
          ? remainingSelected
          : fallbackDimension
            ? [fallbackDimension.code]
            : [],
      );
      await loadDimensions();
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError));
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <section className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Company Configuration"
        description="This will delete the dimension only if it has no active users or business data. Continue?"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(237,247,255,0.98))]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Company Configure
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Manage company details for each dimension. These details appear on
              sales and purchase invoice prints.
            </p>
          </div>
          <Button type="button" onClick={() => navigate("/users/configure/create")}>
            Add Company
          </Button>
        </div>
      </Card>

      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && dimensions.length === 0}
        emptyMessage="No company configuration found"
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Code</th>
                  <th className="px-5 py-4 font-bold text-slate-700">SKU</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Phone</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Email</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Status</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {dimensions.map((dimension) => (
                  <tr
                    key={dimension.id}
                    className="border-t border-slate-100 bg-white"
                  >
                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {dimension.code}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {dimension.sku_code || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-700">{dimension.name}</td>
                    <td className="px-5 py-4 text-slate-600">
                      {dimension.phone_number || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {dimension.email || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {dimension.is_active ? "Active" : "Inactive"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        to={`/users/configure/${dimension.id}/edit`}
                        className="mr-4 font-semibold text-blue-600 transition hover:text-blue-800"
                      >
                        Edit
                      </Link>
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

export default ConfigurePage;
