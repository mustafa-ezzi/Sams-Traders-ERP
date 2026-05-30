import { useEffect, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import StateView from "../../components/StateView";
import IconButton from "../../components/ui/IconButton";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { useToast } from "../../context/ToastContext";
import tenantStaffService from "../../api/services/tenantStaffService";
import { TENANT_UI_PERMISSION_GROUPS } from "../../constants/tenantUiPermissions";

const emptyForm = {
  username: "",
  email: "",
  password: "",
  tenant_role: "",
  ui_permissions: [],
};

const TenantStaffPage = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await tenantStaffService.list();
      setRows(Array.isArray(data) ? data : data?.results || []);
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to load staff users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const togglePerm = (key) => {
    setForm((prev) => {
      const set = new Set(prev.ui_permissions);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...prev, ui_permissions: [...set] };
    });
  };

  const reset = () => {
    setForm(emptyForm);
    setEditingId("");
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
      if (editingId) {
        await tenantStaffService.update(editingId, payload);
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
      reset();
      await load();
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

  const onEdit = (row) => {
    setEditingId(row.id);
    setForm({
      username: row.username || "",
      email: row.email || "",
      password: "",
      tenant_role: row.tenant_role || "",
      ui_permissions: Array.isArray(row.ui_permissions)
        ? [...row.ui_permissions]
        : [],
    });
  };

  const onDelete = async () => {
    if (!deleteId) return;
    try {
      await tenantStaffService.remove(deleteId);
      toast.success("Removed");
      if (editingId === deleteId) reset();
      setDeleteId("");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <section className="space-y-6">
      <Card>
        <h2 className="text-xl font-bold text-slate-900">Staff access</h2>
        <p className="mt-1 text-sm text-slate-500">
          Create users for your organization with module access. Dimensions and
          Support are not available to staff accounts.
        </p>
      </Card>

      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput
              label="Name (login)"
              required
              value={form.username}
              onChange={(e) =>
                setForm((p) => ({ ...p, username: e.target.value }))
              }
            />
            <FormInput
              label="Email"
              required
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((p) => ({ ...p, email: e.target.value }))
              }
            />
            <FormInput
              label="User role"
              required
              placeholder="e.g. Warehouse caretaker"
              value={form.tenant_role}
              onChange={(e) =>
                setForm((p) => ({ ...p, tenant_role: e.target.value }))
              }
            />
            <FormInput
              label={editingId ? "New password (optional)" : "Password"}
              required={!editingId}
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm((p) => ({ ...p, password: e.target.value }))
              }
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-800">
              Module permissions
            </p>
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              {TENANT_UI_PERMISSION_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.keys.map((k) => (
                      <label
                        key={k.id}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={form.ui_permissions.includes(k.id)}
                          onChange={() => togglePerm(k.id)}
                        />
                        {k.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Update" : "Create staff user"}
            </Button>
            {editingId ? (
              <Button type="button" variant="secondary" onClick={reset}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Remove staff user"
        description="This user will no longer be able to sign in."
        onCancel={() => setDeleteId("")}
        onConfirm={onDelete}
      />

      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && rows.length === 0}
        emptyMessage="No staff users yet."
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Login</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Modules</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {row.username}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.email}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.tenant_role || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {(row.ui_permissions || []).length} selected
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex gap-1">
                        <IconButton
                          icon="edit"
                          label="Edit"
                          onClick={() => onEdit(row)}
                        />
                        <IconButton
                          icon="delete"
                          label="Delete"
                          onClick={() => setDeleteId(row.id)}
                        />
                      </span>
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

export default TenantStaffPage;
