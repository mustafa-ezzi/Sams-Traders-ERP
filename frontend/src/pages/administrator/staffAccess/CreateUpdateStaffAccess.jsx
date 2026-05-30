import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import { useToast } from "../../../context/ToastContext";
import tenantStaffService from "../../../api/services/tenantStaffService";
import { TENANT_UI_PERMISSION_GROUPS } from "../../../constants/tenantUiPermissions";
const emptyForm = {
  username: "",
  email: "",
  password: "",
  tenant_role: "",
  ui_permissions: [],
};
const CreateUpdateStaffAccess = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const toast = useToast();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!isEdit || !id) {
      setForm(emptyForm);
      return;
    }
    setLoading(true);
    tenantStaffService
      .list()
      .then((data) => {
        const rows = Array.isArray(data) ? data : data?.results || [];
        const row = rows.find((r) => String(r.id) === String(id));
        if (row) {
          setForm({
            username: row.username || "",
            email: row.email || "",
            password: "",
            tenant_role: row.tenant_role || "",
            ui_permissions: Array.isArray(row.ui_permissions)
              ? [...row.ui_permissions]
              : [],
          });
        } else {
          toast.error("Staff user not found");
          navigate("/settings/staff");
        }
      })
      .catch(() => toast.error("Failed to load staff user"))
      .finally(() => setLoading(false));
  }, [isEdit, id, navigate, toast]);
  const togglePerm = (key) => {
    setForm((prev) => {
      const set = new Set(prev.ui_permissions);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, ui_permissions: [...set] };
    });
  };
  const onSubmit = async (event) => {
    event.preventDefault();
    if (!form.ui_permissions.length) {
      toast.error("Select at least one module permission.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        username: form.username.trim(),
        email: form.email.trim(),
        tenant_role: form.tenant_role.trim(),
        ui_permissions: form.ui_permissions,
      };
      if (form.password?.trim()) {
        payload.password = form.password;
      }
      if (isEdit) {
        await tenantStaffService.update(id, payload);
        toast.success("Staff user updated");
      } else {
        if (!form.password?.trim()) {
          toast.error("Password is required for new users");
          setSaving(false);
          return;
        }
        await tenantStaffService.create({
          ...payload,
          password: form.password,
        });
        toast.success("Staff user created");
      }
      navigate("/settings/staff");
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.detail ||
        Object.values(e?.response?.data || {})?.[0]?.[0] ||
        "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="space-y-6">
      {" "}
      <Card>
        {" "}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {" "}
          <div>
            {" "}
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {isEdit ? "Edit staff user" : "Create staff user"}
            </h2>{" "}
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
              {" "}
              Dimensions and Support are not available to staff accounts.{" "}
            </p>{" "}
          </div>{" "}
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/settings/staff")}
          >
            {" "}
            Back to Staff{" "}
          </Button>{" "}
        </div>{" "}
      </Card>{" "}
      <Card>
        {" "}
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Loading…
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            {" "}
            <div className="grid gap-4 md:grid-cols-2">
              {" "}
              <FormInput
                label="Name (login)"
                required
                value={form.username}
                onChange={(e) =>
                  setForm((p) => ({ ...p, username: e.target.value }))
                }
              />{" "}
              <FormInput
                label="Email"
                required
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((p) => ({ ...p, email: e.target.value }))
                }
              />{" "}
              <FormInput
                label="User role"
                required
                placeholder="e.g. Warehouse caretaker"
                value={form.tenant_role}
                onChange={(e) =>
                  setForm((p) => ({ ...p, tenant_role: e.target.value }))
                }
              />{" "}
              <FormInput
                label={isEdit ? "New password (optional)" : "Password"}
                required={!isEdit}
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((p) => ({ ...p, password: e.target.value }))
                }
              />{" "}
            </div>{" "}
            <div>
              {" "}
              <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                Module permissions
              </p>{" "}
              <div className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60/80 dark:bg-slate-900/70 p-4">
                {" "}
                {TENANT_UI_PERMISSION_GROUPS.map((group) => (
                  <div key={group.label}>
                    {" "}
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      {group.label}
                    </p>{" "}
                    <div className="flex flex-wrap gap-2">
                      {" "}
                      {group.keys.map((k) => (
                        <label
                          key={k.id}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm shadow-sm"
                        >
                          {" "}
                          <input
                            type="checkbox"
                            className="rounded border-slate-300"
                            checked={form.ui_permissions.includes(k.id)}
                            onChange={() => togglePerm(k.id)}
                          />{" "}
                          {k.label}{" "}
                        </label>
                      ))}{" "}
                    </div>{" "}
                  </div>
                ))}{" "}
              </div>{" "}
            </div>{" "}
            <div className="flex flex-wrap gap-2">
              {" "}
              <Button type="submit" disabled={saving}>
                {" "}
                {saving
                  ? "Saving…"
                  : isEdit
                    ? "Update"
                    : "Create staff user"}{" "}
              </Button>{" "}
            </div>{" "}
          </form>
        )}{" "}
      </Card>{" "}
    </section>
  );
};
export default CreateUpdateStaffAccess;
