import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import salesmanService from "../../../api/services/salesmanService";
import StateView from "../../../components/StateView";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import IconButton from "../../../components/ui/IconButton";
import { useToast } from "../../../context/ToastContext";

const formatPercent = (value) => {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric)) return "0%";
  return `${numeric}%`;
};

const GetAllSalesman = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);
  const [deleteId, setDeleteId] = useState("");

  const loadRecords = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await salesmanService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(
        loadError?.response?.data?.message || "Failed to load salesmen",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords(1, "");
  }, []);

  const onDelete = async (recordId) => {
    try {
      await salesmanService.remove(recordId);
      toast.success("Salesman deleted");
      await loadRecords();
    } catch (deleteError) {
      toast.error(deleteError?.response?.data?.message || "Delete failed");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Salesman"
        description="This action will soft delete the record. Continue?"
        onCancel={() => setDeleteId("")}
        onConfirm={async () => {
          const selectedId = deleteId;
          setDeleteId("");
          await onDelete(selectedId);
        }}
      />

      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(224,242,254,0.96))]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Salesmen
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Manage sales staff, commission rates, and auto-generated salesman codes.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-72"
              placeholder="Search code, name, email, or phone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="secondary" onClick={() => loadRecords(1, search)}>
              Search
            </Button>
            <Link to="/salesmen/create">
              <Button type="button">Create Salesman</Button>
            </Link>
          </div>
        </div>
      </Card>

      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && records.length === 0}
        emptyMessage="No salesmen found"
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Code</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Email</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Phone</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Sales %</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Recovery %</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50"
                  >
                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {record.code}
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-700">
                      {record.name}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {record.email || "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {record.phone_number || "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatPercent(record.commission_on_sales)}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatPercent(record.commission_on_recovery)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="inline-flex gap-2">
                        <IconButton
                          icon="edit"
                          label="Edit salesman"
                          onClick={() => navigate(`/salesmen/${record.id}/edit`)}
                        />
                        <IconButton
                          icon="delete"
                          label="Delete salesman"
                          onClick={() => setDeleteId(record.id)}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4">
              <p className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => loadRecords(page - 1, search)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => loadRecords(page + 1, search)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      </StateView>
    </section>
  );
};

export default GetAllSalesman;
