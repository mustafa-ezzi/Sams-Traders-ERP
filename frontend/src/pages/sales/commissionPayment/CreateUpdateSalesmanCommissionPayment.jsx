import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import SearchableSelect from "../../../components/ui/SearchableSelect";
import DimensionPrintButtons from "../../../components/ui/DimensionPrintButtons";
import CommissionVoucherPrintModal from "../../../components/sales/CommissionVoucherPrintModal";
import accountService from "../../../api/services/accountService";
import dimensionService from "../../../api/services/dimensionService";
import salesmanService from "../../../api/services/salesmanService";
import salesmanCommissionPaymentService from "../../../api/services/salesmanCommissionPaymentService";
import { formatDecimal } from "../../../utils/format";
import {
  flattenAccountTree,
  formatAccountLabel,
} from "../../../utils/accounts";
import { dimensionToCompanyConfig } from "../../../utils/dimensionCompany";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";

const createDefaultForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  salesmanId: "",
  salesInvoiceId: "",
  paymentAccountId: "",
  payment: "0",
  remarks: "",
});

const toNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

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

const CreateUpdateSalesmanCommissionPayment = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { allowedDimensions } = useAuth();
  const editingId = id || "";
  const [salesmen, setSalesmen] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [printDimensions, setPrintDimensions] = useState([]);
  const [printModal, setPrintModal] = useState(null);
  const [form, setForm] = useState(createDefaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(Boolean(id));
  const [loadedVoucher, setLoadedVoucher] = useState(null);
  const printCancelledRef = useRef(false);

  const selectedInvoice = useMemo(
    () =>
      invoiceOptions.find((invoice) => invoice.id === form.salesInvoiceId) ||
      null,
    [form.salesInvoiceId, invoiceOptions],
  );

  const loadSetupData = async () => {
    try {
      const [salesmanResponse, accountsResponse] = await Promise.all([
        salesmanService.options(),
        accountService.list(),
      ]);
      setSalesmen(salesmanResponse || []);
      const flatAccounts = flattenAccountTree(
        Array.isArray(accountsResponse)
          ? accountsResponse
          : accountsResponse.data || [],
      );
      setPaymentAccounts(
        flatAccounts.filter(
          (account) =>
            account.is_postable &&
            account.account_group === "ASSET" &&
            account.is_active &&
            ["BANK", "CASH"].includes(account.account_type),
        ),
      );
    } catch {
      toast.error("Failed to load salesman and payment account options");
    }
  };

  const loadInvoiceOptions = async (salesmanId, paymentId = editingId) => {
    if (!salesmanId) {
      setInvoiceOptions([]);
      return;
    }
    try {
      const options =
        await salesmanCommissionPaymentService.getInvoiceOptions(
          salesmanId,
          paymentId,
        );
      setInvoiceOptions(options);
    } catch (loadError) {
      toast.error(
        extractErrorMessage(loadError) ||
          "Failed to load salesman commission invoices",
      );
    }
  };

  useEffect(() => {
    loadSetupData();
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    dimensionService
      .list()
      .then((items) => {
        if (cancelled) return;
        const allowedCodes = new Set(
          (allowedDimensions || []).map((item) => item.code).filter(Boolean),
        );
        const source = items?.length ? items : allowedDimensions || [];
        setPrintDimensions(
          source.filter((dimension) => {
            if (!dimension?.code || dimension.is_active === false) return false;
            if (!allowedCodes.size) return true;
            return allowedCodes.has(dimension.code);
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setPrintDimensions(allowedDimensions || []);
      });
    return () => {
      cancelled = true;
    };
  }, [allowedDimensions]);

  useEffect(() => {
    loadInvoiceOptions(form.salesmanId, editingId);
  }, [form.salesmanId, editingId]);

  useEffect(() => {
    if (!id) {
      setLoadingRecord(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingRecord(true);
      try {
        const payment = await salesmanCommissionPaymentService.getById(id);
        if (cancelled) return;
        await loadInvoiceOptions(payment.salesmanId, payment.id);
        if (cancelled) return;
        setLoadedVoucher(payment);
        setForm({
          date: payment.date,
          salesmanId: payment.salesmanId,
          salesInvoiceId: payment.salesInvoiceId,
          paymentAccountId: payment.paymentAccountId,
          payment: String(payment.payment ?? 0),
          remarks: payment.remarks || "",
        });
      } catch (editError) {
        if (!cancelled) {
          toast.error(
            extractErrorMessage(editError) ||
              "Failed to load salesman commission voucher",
          );
          navigate("/salesman-commission-payments", { replace: true });
        }
      } finally {
        if (!cancelled) setLoadingRecord(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, navigate, toast]);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSalesmanChange = (salesmanId) => {
    setForm((current) => ({
      ...current,
      salesmanId,
      salesInvoiceId: "",
      payment: "0",
    }));
  };

  const handleInvoiceChange = (salesInvoiceId) => {
    const invoice = invoiceOptions.find((item) => item.id === salesInvoiceId);
    setForm((current) => ({
      ...current,
      salesInvoiceId,
      payment: invoice ? String(invoice.pending_amount || 0) : "0",
    }));
  };

  const buildPayload = () => {
    const payload = {
      date: form.date,
      salesman_id: form.salesmanId,
      sales_invoice_id: form.salesInvoiceId,
      payment: toNumber(form.payment),
      remarks: form.remarks,
    };
    if (form.paymentAccountId) {
      payload.payment_account_id = form.paymentAccountId;
    } else {
      payload.payment_account_id = null;
    }
    return payload;
  };

  const validateBeforeSubmit = () => {
    if (!form.date) {
      toast.error("Please select a voucher date");
      return false;
    }
    if (!form.salesmanId) {
      toast.error("Please select a salesman");
      return false;
    }
    if (!form.salesInvoiceId) {
      toast.error("Please select an invoice");
      return false;
    }
    if (toNumber(form.payment) <= 0) {
      toast.error("Payment must be greater than zero");
      return false;
    }
    if (
      selectedInvoice &&
      toNumber(form.payment) > toNumber(selectedInvoice.pending_amount)
    ) {
      toast.error("Payment cannot exceed pending commission");
      return false;
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateBeforeSubmit()) return;
    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (editingId) {
        const response = await salesmanCommissionPaymentService.update(
          editingId,
          payload,
        );
        toast.success(
          response.message || "Salesman commission voucher updated successfully",
        );
      } else {
        const response = await salesmanCommissionPaymentService.create(payload);
        toast.success(
          response.message || "Salesman commission voucher created successfully",
        );
      }
      navigate("/salesman-commission-payments");
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClosePrint = () => {
    printCancelledRef.current = true;
    setPrintModal(null);
  };

  const handleOpenPrint = async (_recordId, dimensionCode) => {
    if (!editingId) return;
    printCancelledRef.current = false;
    const dimension = printDimensions.find((item) => item.code === dimensionCode);
    setPrintModal({
      loading: true,
      voucher: null,
      company: dimensionToCompanyConfig(dimension),
    });
    try {
      const voucher =
        loadedVoucher ||
        (await salesmanCommissionPaymentService.getById(editingId));
      if (printCancelledRef.current) return;
      setPrintModal({
        loading: false,
        voucher,
        company: dimensionToCompanyConfig(dimension),
      });
    } catch (printError) {
      if (!printCancelledRef.current) {
        toast.error(
          extractErrorMessage(printError) ||
            "Could not load voucher for printing",
        );
        setPrintModal(null);
      }
    }
  };

  const title = editingId
    ? "Edit Salesman Commission Voucher"
    : "Salesman Commission Voucher";

  if (loadingRecord) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center text-slate-600 dark:text-slate-300">
        Loading voucher...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editingId ? (
              <DimensionPrintButtons
                dimensions={printDimensions}
                recordId={editingId}
                onPrint={handleOpenPrint}
              />
            ) : null}
            <Button
              variant="secondary"
              type="button"
              onClick={() => navigate("/salesman-commission-payments")}
            >
              Back to list
            </Button>
          </div>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            <FormInput
              label="Date *"
              type="date"
              required
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
            />

            <SearchableSelect
              label="Salesman"
              required
              value={form.salesmanId}
              options={salesmen}
              onChange={handleSalesmanChange}
              getOptionLabel={(salesman) =>
                `${salesman.code ? `${salesman.code} - ` : ""}${salesman.name}`
              }
              placeholder="Search salesman…"
              showAllOptions
            />

            <SearchableSelect
              label="Selected Salesman's Invoice"
              required
              value={form.salesInvoiceId}
              options={invoiceOptions}
              onChange={handleInvoiceChange}
              getOptionLabel={(invoice) =>
                `${invoice.invoice_number} | Pending ${formatDecimal(invoice.pending_amount)}`
              }
              placeholder="Search invoice…"
              disabled={!form.salesmanId}
              showAllOptions
            />

            <FormInput
              label="Payment *"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.payment}
              onChange={(e) => handleChange("payment", e.target.value)}
            />

            <SearchableSelect
              label="Payment Account (optional)"
              value={form.paymentAccountId}
              options={paymentAccounts}
              onChange={(paymentAccountId) =>
                handleChange("paymentAccountId", paymentAccountId)
              }
              getOptionLabel={(account) => formatAccountLabel(account)}
              placeholder="Blank = accrue to payable…"
              showAllOptions
            />

            <FormInput
              label="Remarks"
              placeholder="Optional notes for this voucher"
              value={form.remarks}
              onChange={(e) => handleChange("remarks", e.target.value)}
            />
          </div>

          <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Commission
              </p>
              <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">
                {formatDecimal(selectedInvoice?.commission_amount || 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Already Cleared
              </p>
              <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">
                {formatDecimal(selectedInvoice?.paid_amount || 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-blue-500">
                Pending Commission
              </p>
              <p className="mt-1 text-xl font-extrabold text-blue-700 dark:text-blue-300">
                {formatDecimal(selectedInvoice?.pending_amount || 0)}
              </p>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 dark:border-slate-700 pt-4">
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving..."
                : editingId
                  ? "Update Voucher"
                  : "Save Voucher"}
            </Button>
          </div>
        </form>
      </Card>

      <CommissionVoucherPrintModal
        voucher={printModal?.voucher}
        company={printModal?.company}
        loading={Boolean(printModal?.loading)}
        onClose={handleClosePrint}
      />
    </div>
  );
};

export default CreateUpdateSalesmanCommissionPayment;
