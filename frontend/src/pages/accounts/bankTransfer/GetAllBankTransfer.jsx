import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import StateView from "../../../components/StateView";
import bankTransferService from "../../../api/services/bankTransferService";
import { formatDecimal } from "../../../utils/format";
import { useToast } from "../../../context/ToastContext";

const extractErrorMessage = (error) => {
  const data = error?.response?.data;
  if (!data) return "Something went wrong";
  if (typeof data === "string") return data;
  if (data.message) return data.message;
  if (typeof data.detail === "string") return data.detail;
  const fieldEntry = Object.entries(data).find(
    ([, value]) => typeof value === "string" || Array.isArray(value),
  );
  if (fieldEntry) {
    const [, value] = fieldEntry;
    return Array.isArray(value) ? value.join(", ") : value;
  }
  return "Something went wrong";
};

const GetAllBankTransfer = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const limit = 10;

  const loadTransfers = async (nextPage = page) => {
    setLoading(true);
    setError("");
    try {
      const response = await bankTransferService.list({
        page: nextPage,
        limit,
        search,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(extractErrorMessage(loadError) || "Failed to load bank transfers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransfers(1);
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await bankTransferService.remove(deleteId);
      toast.success("Bank transfer deleted");
      await loadTransfers(page);
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError));
    } finally {
      setDeleteId("");
    }
  };

  return (
    <div className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Bank Transfer"
        description="This will reverse the journal entries for this transfer. Continue?"
        onCancel={() => setDeleteId("")}
        onConfirm={handleDelete}
      />

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Bank Transfers</h2>
            <p className="mt-1 text-sm text-slate-500">
              Move money between bank accounts across any dimension.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/bank-transfers/create">
              <Button type="button">New transfer</Button>
            </Link>
            <FormInput
              placeholder="Search transfer, bank, remarks"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setPage(1);
                  loadTransfers(1);
                }
              }}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
                loadTransfers(1);
              }}
            >
              Search
            </Button>
          </div>
        </div>

        <StateView loading={loading} error={error}>
          <div className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Number</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">From</th>
                    <th className="px-4 py-3">To</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Remarks</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {records.map((transfer) => (
                    <tr key={transfer.id}>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {transfer.transfer_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{transfer.date}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {transfer.from_bank_account?.dimension_name} —{" "}
                        {transfer.from_bank_account?.code}{" "}
                        {transfer.from_bank_account?.name}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {transfer.to_bank_account?.dimension_name} —{" "}
                        {transfer.to_bank_account?.code}{" "}
                        {transfer.to_bank_account?.name}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {formatDecimal(transfer.amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {transfer.remarks || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            onClick={() =>
                              navigate(`/bank-transfers/${transfer.id}/edit`)
                            }
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => setDeleteId(transfer.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </StateView>
      </Card>
    </div>
  );
};

export default GetAllBankTransfer;
