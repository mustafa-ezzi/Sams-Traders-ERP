import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import StateView from "../../../components/StateView";
import IconButton from "../../../components/ui/IconButton";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import { useToast } from "../../../context/ToastContext";
import tenantStaffService from "../../../api/services/tenantStaffService";
const GetAllStaffAccess = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  const onDelete = async () => {
    if (!deleteId) return;
    try {
      await tenantStaffService.remove(deleteId);
      toast.success("Removed");
      setDeleteId("");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };
  return (
    <section className="space-y-6">
      {" "}
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Remove staff user"
        description="This user will no longer be able to sign in."
        onCancel={() => setDeleteId("")}
        onConfirm={onDelete}
      />{" "}
      <Card>
        {" "}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {" "}
          <div>
            {" "}
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Staff access
            </h2>{" "}
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
              {" "}
              Manage users for your organization with module access.{" "}
            </p>{" "}
          </div>{" "}
          <Button onClick={() => navigate("/settings/staff/create")}>
            Add staff user
          </Button>{" "}
        </div>{" "}
      </Card>{" "}
      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && rows.length === 0}
        emptyMessage="No staff users yet."
      >
        {" "}
        <Card className="overflow-hidden p-0">
          {" "}
          <div className="overflow-x-auto">
            {" "}
            <table className="w-full min-w-[640px] text-sm">
              {" "}
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-left text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                <tr>
                  {" "}
                  <th className="px-4 py-3">Login</th>{" "}
                  <th className="px-4 py-3">Email</th>{" "}
                  <th className="px-4 py-3">Role</th>{" "}
                  <th className="px-4 py-3">Modules</th>{" "}
                  <th className="px-4 py-3 text-right">Actions</th>{" "}
                </tr>{" "}
              </thead>{" "}
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {" "}
                {rows.map((row) => (
                  <tr key={row.id}>
                    {" "}
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">
                      {row.username}
                    </td>{" "}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {row.email}
                    </td>{" "}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {row.tenant_role || "—"}
                    </td>{" "}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {(row.ui_permissions || []).length} selected
                    </td>{" "}
                    <td className="px-4 py-3 text-right">
                      {" "}
                      <span className="inline-flex gap-1">
                        {" "}
                        <IconButton
                          icon="edit"
                          label="Edit"
                          onClick={() =>
                            navigate(`/settings/staff/${row.id}/edit`)
                          }
                        />{" "}
                        <IconButton
                          icon="delete"
                          label="Delete"
                          onClick={() => setDeleteId(row.id)}
                        />{" "}
                      </span>{" "}
                    </td>{" "}
                  </tr>
                ))}{" "}
              </tbody>{" "}
            </table>{" "}
          </div>{" "}
        </Card>{" "}
      </StateView>{" "}
    </section>
  );
};
export default GetAllStaffAccess;
