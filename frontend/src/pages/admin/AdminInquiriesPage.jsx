import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import StateView from "../../components/StateView";
import { useToast } from "../../context/ToastContext";
import AdminSidebarLayout from "../../components/AdminSidebarLayout";
import adminInquiryService from "../../api/services/adminInquiryService";

const AdminInquiriesPage = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [replyingId, setReplyingId] = useState("");
  const [replyText, setReplyText] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const filteredRows = useMemo(() => {
    const term = appliedSearch.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [
        row.user_name,
        row.tenant_id,
        row.subject,
        row.message,
        row.admin_reply,
        row.status,
      ].some((value) => String(value || "").toLowerCase().includes(term)),
    );
  }, [appliedSearch, rows]);

  const loadRows = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await adminInquiryService.list();
      setRows(response);
    } catch (apiError) {
      setError(apiError?.response?.data?.detail || "Failed to load inquiries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  return (
    <AdminSidebarLayout
      title="User Inquiries"
      subtitle="Support requests submitted by ERP users."
    >
      <Card>
        <div className="flex flex-col gap-2 sm:flex-row">
          <FormInput
            placeholder="Search inquiries"
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
        isEmpty={!loading && !error && rows.length === 0}
        emptyMessage="No inquiries found"
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">User</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Tenant</th>
                  <th className="px-5 py-4 font-bold text-slate-700">
                    Subject
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700">
                    Message
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700">
                    Admin Reply
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700">Status</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-slate-100 bg-white align-top"
                  >
                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {row.user_name}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {row.tenant_id}
                    </td>
                    <td className="px-5 py-4 text-slate-700">{row.subject}</td>
                    <td className="max-w-[360px] px-5 py-4 text-slate-700">
                      {row.message}
                    </td>
                    <td className="max-w-[360px] px-5 py-4 text-slate-700">
                      {row.admin_reply || "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-700">{row.status}</td>
                    <td className="px-5 py-4 text-right">
                      {row.status === "OPEN" ? (
                        <div className="flex flex-col items-end gap-2">
                          {replyingId === row.id ? (
                            <>
                              <div className="w-[260px]">
                                <FormInput
                                  as="textarea"
                                  rows={3}
                                  label=""
                                  value={replyText}
                                  onChange={(event) =>
                                    setReplyText(event.target.value)
                                  }
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="secondary"
                                  onClick={() => {
                                    setReplyingId("");
                                    setReplyText("");
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  onClick={async () => {
                                    if (!replyText.trim()) {
                                      toast.error("Reply cannot be empty");
                                      return;
                                    }
                                    try {
                                      await adminInquiryService.reply(
                                        row.id,
                                        replyText.trim(),
                                      );
                                      toast.success(
                                        "Inquiry replied and closed",
                                      );
                                      setReplyingId("");
                                      setReplyText("");
                                      await loadRows();
                                    } catch {
                                      toast.error("Failed to submit reply");
                                    }
                                  }}
                                >
                                  Send Reply
                                </Button>
                              </div>
                            </>
                          ) : (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setReplyingId(row.id);
                                setReplyText(row.admin_reply || "");
                              }}
                            >
                              Reply
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Closed</span>
                      )}
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

export default AdminInquiriesPage;
