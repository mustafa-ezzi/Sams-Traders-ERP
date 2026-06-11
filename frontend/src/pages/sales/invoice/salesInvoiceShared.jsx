import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDecimal } from "../../../utils/format";

export const AMOUNT_EPS = 0.01;

export const toNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

export const parseDateOnly = (value) => {
  if (value == null || value === "") return null;
  const s = String(value).slice(0, 10);
  const parts = s.split("-").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
};

export const startOfTodayLocal = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

export const formatDisplayDate = (iso) => {
  if (!iso) return "—";
  const p = parseDateOnly(iso);
  if (!p) return String(iso).slice(0, 10);
  const dd = String(p.getDate()).padStart(2, "0");
  const mm = String(p.getMonth() + 1).padStart(2, "0");
  const yyyy = p.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

/** DUE: nothing received; PARTIAL: some receipt, balance left; COMPLETED: settled. */
export const getReceiptStatus = (record) => {
  const received = toNumber(record.receivedAmount);
  const balance = toNumber(record.balanceAmount);
  if (balance <= AMOUNT_EPS) return "COMPLETED";
  if (received > AMOUNT_EPS && balance > AMOUNT_EPS) return "PARTIAL";
  return "DUE";
};

/** Blink when there is balance due and due date is tomorrow or already passed. */
export const isDueReceiptAlertRow = (record) => {
  if (toNumber(record.balanceAmount) <= AMOUNT_EPS) return false;
  const due = parseDateOnly(record.dueDate);
  if (!due) return false;
  const today = startOfTodayLocal();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueT = due.getTime();
  if (dueT === tomorrow.getTime()) return true;
  if (dueT <= today.getTime()) return true;
  return false;
};

export const statusMeta = {
  DUE: {
    label: "Due",
    rowClass: "text-rose-700 dark:text-rose-300",
    iconWrap:
      "border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400",
    Icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M12 7v6M12 16h.01"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  PARTIAL: {
    label: "Partial",
    rowClass: "text-blue-700 dark:text-blue-300",
    iconWrap:
      "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
    Icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M12 3a9 9 0 0 1 0 18V12H3a9 9 0 0 1 9-9Z"
          fill="currentColor"
          opacity="0.35"
        />
      </svg>
    ),
  },
  COMPLETED: {
    label: "Completed",
    rowClass: "text-emerald-700 dark:text-emerald-300",
    iconWrap:
      "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
    Icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path
          d="M5 13l4 4L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
};

export const ReceiptDetailsEye = ({ record }) => {
  const net = toNumber(record.netAmount);
  const received = toNumber(record.receivedAmount);
  const returned = toNumber(record.returnedAmount);
  const balance = toNumber(record.balanceAmount);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const hideTimer = useRef(null);

  const clearHide = () => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = () => {
    clearHide();
    hideTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  const showFromButton = (event) => {
    clearHide();
    const r = event.currentTarget.getBoundingClientRect();
    setPos({ top: r.bottom + 8, left: r.left + r.width / 2 });
    setOpen(true);
  };

  useEffect(() => () => clearHide(), []);

  const tooltip =
    open &&
    createPortal(
      <div
        role="tooltip"
        className="fixed z-[9999] w-56 -translate-x-1/2 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-left text-xs shadow-lg dark:border-rose-800 dark:bg-slate-800"
        style={{ top: pos.top, left: pos.left }}
        onMouseEnter={clearHide}
        onMouseLeave={scheduleHide}
      >
        <p className="mb-1.5 border-b border-rose-100 pb-1 font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">
          Receipt details
        </p>
        <p className="text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            Net amount:
          </span>{" "}
          {formatDecimal(net)}
        </p>
        <p className="text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            Received:
          </span>{" "}
          {formatDecimal(received)}
        </p>
        <p className="text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            Returns:
          </span>{" "}
          {formatDecimal(returned)}
        </p>
        <p className="text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            Balance:
          </span>{" "}
          {formatDecimal(balance)}
        </p>
      </div>,
      document.body,
    );

  return (
    <>
      <button
        type="button"
        title={`Net ${formatDecimal(net)} · Received ${formatDecimal(received)} · Balance ${formatDecimal(balance)}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
        aria-label="Receipt details"
        onMouseEnter={showFromButton}
        onMouseLeave={scheduleHide}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle
            cx="12"
            cy="12"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </button>
      {tooltip}
    </>
  );
};
