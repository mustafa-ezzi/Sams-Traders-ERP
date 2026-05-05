import { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import FormInput from "../components/ui/FormInput";
import StateView from "../components/StateView";
import { useToast } from "../context/ToastContext";
import supportInquiryService from "../api/services/supportInquiryService";

const SupportPage = () => {
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRows = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await supportInquiryService.list({ page: 1, limit: 20 });
      setRows(response.results || response.data || []);
    } catch (apiError) {
      setError(apiError?.response?.data?.detail || "Failed to load inquiries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    setSaving(true);
    try {
      await supportInquiryService.create({
        subject: subject.trim(),
        message: message.trim(),
      });
      toast.success("Inquiry sent to admin");
      setSubject("");
      setMessage("");
      await loadRows();
    } catch (apiError) {
      toast.error(apiError?.response?.data?.detail || "Failed to send inquiry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <Card>
        <h1 className="text-lg font-semibold text-gray-800">Support</h1>
        <p className="mt-1 text-sm text-gray-500">
          Send any issue or query to admin support.
        </p>
      </Card>

      <Card>
        <form className="space-y-3" onSubmit={submit}>
          <FormInput
            label="Subject"
            required
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
          <FormInput
            as="textarea"
            rows={4}
            label="Message"
            required
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <Button type="submit" disabled={saving}>
            {saving ? "Sending..." : "Send Inquiry"}
          </Button>
        </form>
      </Card>

      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && rows.length === 0}
        emptyMessage="No inquiries submitted yet"
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-700">Subject</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Message</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Admin Response</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 font-semibold text-gray-700">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 bg-white">
                    <td className="px-4 py-3 text-gray-800">{row.subject}</td>
                    <td className="max-w-[420px] px-4 py-3 text-gray-700">{row.message}</td>
                    <td className="max-w-[420px] px-4 py-3 text-gray-700">
                      {row.admin_reply || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.status}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(row.created_at).toLocaleString()}
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

export default SupportPage;

