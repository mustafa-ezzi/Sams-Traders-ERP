import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import StateView from "../../components/StateView";
import PurchaseInvoicePrintDocument from "../../components/purchase/PurchaseInvoicePrintDocument";
import purchaseInvoiceService from "../../api/services/purchaseInvoiceService";
import dimensionService from "../../api/services/dimensionService";
import { dimensionToCompanyConfig } from "../../utils/dimensionCompany";
import { formatDisplayDate } from "./invoice/purchaseInvoiceShared";

const PurchaseInvoicePrintPage = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dimensionCode = searchParams.get("dimension") || "";
  const [invoice, setInvoice] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    purchaseInvoiceService
      .getById(id)
      .then((data) => {
        if (!cancelled) setInvoice(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load invoice for printing.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    dimensionService
      .list()
      .then((items) => {
        if (cancelled) return;
        const dimensions = items || [];
        const selected =
          dimensions.find((item) => item.code === dimensionCode) ||
          dimensions.find((item) => item.is_active) ||
          dimensions[0];
        setCompany(dimensionToCompanyConfig(selected));
      })
      .catch(() => {
        if (!cancelled) setCompany(dimensionToCompanyConfig(null));
      });

    return () => {
      cancelled = true;
    };
  }, [dimensionCode]);

  useEffect(() => {
    if (!invoice) return undefined;
    const invNo = invoice.invoice_number ?? invoice.invoiceNumber ?? "";
    const previousTitle = document.title;
    document.title = invNo ? `Purchase Invoice ${invNo}` : "Purchase Invoice";
    return () => {
      document.title = previousTitle;
    };
  }, [invoice]);

  const handleClose = () => {
    if (window.opener) {
      window.close();
      return;
    }
    navigate("/purchase-invoices");
  };

  const invNo =
    invoice?.invoice_number ?? invoice?.invoiceNumber ?? "Purchase invoice";

  return (
    <>
      <style>
        {`
          @page { margin: 14mm; size: A4; }
          html, body, #root {
            height: 100%;
            background: #f1f5f9;
          }
          @media print {
            html, body, #root {
              height: auto !important;
              background: white !important;
            }
            .pi-print-toolbar {
              display: none !important;
            }
            .pi-print-page {
              padding: 0 !important;
              background: white !important;
            }
            .pi-print-sheet {
              box-shadow: none !important;
              border: none !important;
              border-radius: 0 !important;
            }
          }
        `}
      </style>

      <div className="pi-print-page min-h-full bg-slate-100">
        <div className="pi-print-toolbar sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm font-semibold text-slate-700">
            Print preview · {invNo}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Close
            </Button>
            <Button
              type="button"
              className="gap-2"
              onClick={() => window.print()}
              disabled={!invoice}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path
                  d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Print
            </Button>
          </div>
        </div>

        <div className="p-4 md:p-8">
          <StateView
            loading={loading}
            error={error}
            isEmpty={!loading && !error && !invoice}
            emptyMessage="Invoice not found."
          >
            <PurchaseInvoicePrintDocument
              invoice={invoice}
              company={company}
              formatDisplayDate={formatDisplayDate}
            />
          </StateView>
        </div>
      </div>
    </>
  );
};

export default PurchaseInvoicePrintPage;
