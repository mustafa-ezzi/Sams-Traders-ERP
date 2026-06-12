import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import dimensionService from "../../api/services/dimensionService";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import StateView from "../../components/StateView";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

const defaultForm = {
  name: "",
  code: "",
  sku_code: "",
  address: "",
  phone_number: "",
  ntn_number: "",
  email: "",
  is_active: true,
};

const DimensionFormPage = () => {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { createTenantIds, setAllowedDimensions, setCreateTenants, setTenant, tenantId } =
    useAuth();
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingDimension, setEditingDimension] = useState(null);

  const extractErrorMessage = (loadError) =>
    loadError?.response?.data?.detail ||
    loadError?.response?.data?.message ||
    loadError?.response?.data?.code?.[0] ||
    loadError?.response?.data?.sku_code?.[0] ||
    loadError?.response?.data?.name?.[0] ||
    loadError?.response?.data?.email?.[0] ||
    "Something went wrong";

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    dimensionService
      .list()
      .then((items) => {
        if (cancelled) return;
        const dimension = (items || []).find((item) => String(item.id) === String(id));
        if (!dimension) {
          setError("Company configuration not found");
          return;
        }
        setEditingDimension(dimension);
        setForm({
          name: dimension.name || "",
          code: dimension.code || "",
          sku_code: dimension.sku_code || "",
          address: dimension.address || "",
          phone_number: dimension.phone_number || "",
          ntn_number: dimension.ntn_number || "",
          email: dimension.email || "",
          is_active: Boolean(dimension.is_active),
        });
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(extractErrorMessage(loadError) || "Failed to load configuration");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, isEditing]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Please enter a company name");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku_code: form.sku_code.trim(),
        address: form.address.trim(),
        phone_number: form.phone_number.trim(),
        ntn_number: form.ntn_number.trim(),
        email: form.email.trim(),
        is_active: form.is_active,
      };

      const response = isEditing
        ? await dimensionService.update(editingDimension.id, payload)
        : await dimensionService.create({
            ...payload,
            code: form.code.trim(),
          });

      const refreshed = await dimensionService.list();
      setAllowedDimensions(refreshed || []);

      toast.success(
        response.message ||
          (isEditing
            ? "Company configuration updated"
            : "Company configuration created"),
      );

      if (isEditing && !payload.is_active) {
        const remainingSelected = createTenantIds.filter(
          (code) => code !== editingDimension.code,
        );
        const fallbackDimension = (refreshed || []).find(
          (dimension) =>
            dimension.code !== editingDimension.code && dimension.is_active,
        );
        if (tenantId === editingDimension.code && fallbackDimension) {
          setTenant(fallbackDimension.code);
        }
        setCreateTenants(
          remainingSelected.length
            ? remainingSelected
            : fallbackDimension
              ? [fallbackDimension.code]
              : [],
        );
      }

      if (!isEditing) {
        navigate("/");
        return;
      }
      navigate("/users/configure");
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <Card>
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {isEditing ? "Edit Company Configuration" : "Create Company Configuration"}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Company name, address, and contact details are used on printed invoices.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/users/configure")}
          >
            Back to Configure
          </Button>
        </div>

        <StateView loading={loading} error={error} isEmpty={false}>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <FormInput
              label="Company Name"
              required
              placeholder="AM Traders"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
            <FormInput
              label="Dimension Code"
              placeholder={
                isEditing ? "Code cannot be changed" : "Optional, auto-generated if blank"
              }
              value={form.code}
              readOnly={isEditing}
              className={isEditing ? "bg-slate-100" : ""}
              onChange={(event) =>
                setForm((current) => ({ ...current, code: event.target.value }))
              }
            />
            <FormInput
              label="SKU Code"
              placeholder="AME"
              value={form.sku_code}
              onChange={(event) =>
                setForm((current) => ({ ...current, sku_code: event.target.value }))
              }
            />
            <FormInput
              label="Email"
              type="email"
              placeholder="accounts@company.com"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
            />
            <FormInput
              label="Phone Number"
              placeholder="+92 300 0000000"
              value={form.phone_number}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  phone_number: event.target.value,
                }))
              }
            />
            <FormInput
              label="NTN Number"
              placeholder="1234567-8"
              value={form.ntn_number}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  ntn_number: event.target.value,
                }))
              }
            />
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Address
              </label>
              <textarea
                className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                placeholder="Business address for invoice footer"
                value={form.address}
                onChange={(event) =>
                  setForm((current) => ({ ...current, address: event.target.value }))
                }
              />
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-700 md:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    is_active: event.target.checked,
                  }))
                }
              />
              Active company configuration
            </label>

            <div className="flex flex-col gap-3 sm:flex-row md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving
                  ? isEditing
                    ? "Updating..."
                    : "Creating..."
                  : isEditing
                    ? "Update Configuration"
                    : "Create Configuration"}
              </Button>
            </div>
          </form>
        </StateView>
      </Card>
    </section>
  );
};

export default DimensionFormPage;
