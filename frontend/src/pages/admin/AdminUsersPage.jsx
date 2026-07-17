import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ConfirmModal from "../../components/ui/ConfirmModal";
import FormInput from "../../components/ui/FormInput";
import StateView from "../../components/StateView";
import { useToast } from "../../context/ToastContext";
import adminUserService from "../../api/services/adminUserService";
import AdminSidebarLayout from "../../components/AdminSidebarLayout";

const emptyForm = {
  username: "",
  email: "",
  phone_number: "",
  business_name: "",
  password: "",
  tenant_limit: 1,
};

const AdminUsersPage = () => {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const filteredUsers = useMemo(() => {
    const term = appliedSearch.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) =>
      [
        user.username,
        user.email,
        user.business_name,
        user.tenant_role,
        user.account_kind,
      ].some((value) => String(value || "").toLowerCase().includes(term)),
    );
  }, [appliedSearch, users]);

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminUserService.list();
      setUsers(response || []);
    } catch (apiError) {
      setError(apiError?.response?.data?.detail || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId("");
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        username: form.username.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim(),
        business_name: form.business_name.trim(),
        tenant_limit: Number(form.tenant_limit || 1),
      };
      if (editingId) {
        await adminUserService.update(editingId, payload);
        toast.success("User updated");
      } else {
        payload.password = form.password;
        await adminUserService.create(payload);
        toast.success("User created");
      }
      resetForm();
      await loadUsers();
    } catch (apiError) {
      const message =
        apiError?.response?.data?.detail ||
        apiError?.response?.data?.message ||
        Object.values(apiError?.response?.data || {})?.[0]?.[0] ||
        "Failed to save user";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (user) => {
    setEditingId(user.id);
    setForm({
      username: user.username || "",
      email: user.email || "",
      phone_number: user.phone_number || "",
      business_name: user.business_name || "",
      password: "",
      tenant_limit: user.tenant_limit || 1,
    });
  };

  const onDelete = async () => {
    if (!deleteId) return;
    try {
      await adminUserService.remove(deleteId);
      toast.success("User deleted");
      await loadUsers();
    } catch (apiError) {
      toast.error(apiError?.response?.data?.detail || "Failed to delete user");
    } finally {
      setDeleteId("");
    }
  };

  return (
    <AdminSidebarLayout
      title="User & Tenant Control"
      subtitle="Manage ERP users from the admin panel."
    >
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete User"
        description="This will permanently remove the selected user. Continue?"
        onCancel={() => setDeleteId("")}
        onConfirm={onDelete}
      />

      <Card>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <FormInput
            label="Username"
            required
            value={form.username}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, username: event.target.value }))
            }
          />
          <FormInput
            label="Email"
            required
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
          />
          <FormInput
            label="Phone Number"
            value={form.phone_number}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, phone_number: event.target.value }))
            }
          />
          <FormInput
            label="Business Name"
            value={form.business_name}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                business_name: event.target.value,
              }))
            }
          />
          {!editingId ? (
            <FormInput
              label="Password"
              required
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
            />
          ) : null}
          <FormInput
            label="Tenant Limit"
            required
            type="number"
            min={1}
            value={form.tenant_limit}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, tenant_limit: event.target.value }))
            }
          />
          <div className="md:col-span-2 flex flex-wrap gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update User" : "Create User"}
            </Button>
            {editingId ? (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex flex-col gap-2 sm:flex-row">
          <FormInput
            placeholder="Search users"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setAppliedSearch(search);
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setAppliedSearch(search)}
          >
            Search
          </Button>
        </div>
      </Card>

      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && users.length === 0}
        emptyMessage="No users found"
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Type</th>
                  <th className="px-5 py-4 font-bold text-slate-700">
                    Username
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700">Email</th>
                  <th className="px-5 py-4 font-bold text-slate-700">
                    Parent admin
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700">Role</th>
                  <th className="px-5 py-4 font-bold text-slate-700">
                    Business
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700">
                    Tenant Limit
                  </th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t border-slate-100 bg-white"
                  >
                    <td className="px-5 py-4 text-slate-700">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          user.account_kind === "child"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {user.account_kind === "child"
                          ? "Child"
                          : "Tenant admin"}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {user.username}
                    </td>
                    <td className="px-5 py-4 text-slate-700">{user.email}</td>
                    <td className="px-5 py-4 text-slate-700">
                      {user.parent_email || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {user.tenant_role || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {user.business_name || "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {user.tenant_limit}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        className="mr-3 font-semibold text-blue-600 hover:text-blue-800"
                        type="button"
                        onClick={() => onEdit(user)}
                      >
                        Edit
                      </button>
                      <button
                        className="font-semibold text-rose-600 hover:text-rose-800"
                        type="button"
                        onClick={() => setDeleteId(user.id)}
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
    </AdminSidebarLayout>
  );
};

export default AdminUsersPage;
