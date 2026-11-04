import { Link } from "react-router-dom";

const linkClassName =
  "font-semibold text-blue-700 underline-offset-2 hover:underline dark:text-blue-400";

export const editPath = (base, id) => {
  if (!id) return null;
  return `${base}/${encodeURIComponent(id)}/edit`;
};

export const partyLedgerPath = (partnerType, partnerId) => {
  if (!partnerId) return null;
  const type = partnerType === "supplier" ? "supplier" : "customer";
  return `/reports/party-ledger?partner_type=${encodeURIComponent(type)}&partner_id=${encodeURIComponent(partnerId)}`;
};

export const itemLedgerPath = ({
  itemType,
  itemId,
  warehouseId,
  tenantScope,
} = {}) => {
  if (!itemId) return null;
  const params = new URLSearchParams();
  params.set(
    "item_type",
    itemType === "raw_materials" ? "raw_materials" : "finished_goods",
  );
  params.set("item_id", itemId);
  if (warehouseId) params.set("warehouse_id", warehouseId);
  if (tenantScope) params.set("tenant_scope", tenantScope);
  return `/reports/inventory/item-ledger?${params.toString()}`;
};

export const REPORT_PATHS = {
  salesInvoice: (id) => editPath("/sales-invoices", id),
  purchaseInvoice: (id) => editPath("/purchase-invoices", id),
  salesReturn: (id) => editPath("/sales-returns", id),
  purchaseReturn: (id) => editPath("/purchase-returns", id),
  salesReceipt: (id) => editPath("/sales-bank-receipts", id),
  purchasePayment: (id) => editPath("/purchase-bank-payments", id),
  customer: (id) => editPath("/customers", id),
  supplier: (id) => editPath("/suppliers", id),
  product: (id) => editPath("/products", id),
  rawMaterial: (id) => editPath("/raw-materials", id),
  production: (id) => editPath("/production", id),
  openingStock: () => "/opening-stock",
  itemLedger: itemLedgerPath,
  salesman: (id) => editPath("/salesmen", id),
  expense: (id) => editPath("/expenses", id),
  account: (id) => editPath("/accounts", id),
  bankTransfer: (id) => editPath("/bank-transfers", id),
  salesmanCommission: (id) => editPath("/salesman-commission-payments", id),
  partyLedger: partyLedgerPath,
  warehouses: () => "/warehouses",
};

const SOURCE_TYPE_PATH = {
  SALES_INVOICE: REPORT_PATHS.salesInvoice,
  PURCHASE_INVOICE: REPORT_PATHS.purchaseInvoice,
  SALES_RETURN: REPORT_PATHS.salesReturn,
  PURCHASE_RETURN: REPORT_PATHS.purchaseReturn,
  SALES_BANK_RECEIPT: REPORT_PATHS.salesReceipt,
  PURCHASE_BANK_PAYMENT: REPORT_PATHS.purchasePayment,
  EXPENSE: REPORT_PATHS.expense,
  BANK_TRANSFER: REPORT_PATHS.bankTransfer,
  SALESMAN_COMMISSION_PAYMENT: REPORT_PATHS.salesmanCommission,
  PRODUCTION: REPORT_PATHS.production,
  PRODUCTION_CONSUMPTION: REPORT_PATHS.production,
  OPENING_STOCK: REPORT_PATHS.openingStock,
};

export const sourceDocumentPath = (sourceType, sourceId) => {
  if (!sourceType || !sourceId) return null;
  const builder = SOURCE_TYPE_PATH[sourceType];
  return builder ? builder(sourceId) : null;
};

/** Resolve path from human document_type labels used in ledgers. */
export const documentTypePath = (documentType, sourceId) => {
  if (!sourceId) return null;
  const label = String(documentType || "").toLowerCase();
  if (label.includes("sales invoice")) return REPORT_PATHS.salesInvoice(sourceId);
  if (label.includes("purchase invoice")) return REPORT_PATHS.purchaseInvoice(sourceId);
  if (label.includes("sales return")) return REPORT_PATHS.salesReturn(sourceId);
  if (label.includes("purchase return")) return REPORT_PATHS.purchaseReturn(sourceId);
  if (label.includes("bank receipt") || label.includes("receipt")) {
    return REPORT_PATHS.salesReceipt(sourceId);
  }
  if (label.includes("bank payment") || label.includes("payment")) {
    return REPORT_PATHS.purchasePayment(sourceId);
  }
  if (label.includes("expense")) return REPORT_PATHS.expense(sourceId);
  if (label.includes("bank transfer")) return REPORT_PATHS.bankTransfer(sourceId);
  if (label.includes("commission")) return REPORT_PATHS.salesmanCommission(sourceId);
  if (label.includes("production")) return REPORT_PATHS.production(sourceId);
  if (label.includes("opening")) return REPORT_PATHS.openingStock();
  return sourceDocumentPath(
    // fallback if raw source_type was passed as documentType
    documentType,
    sourceId,
  );
};

export const ReportLink = ({ to, children, className = "", title }) => {
  if (!to) {
    return <span className={className}>{children}</span>;
  }
  return (
    <Link
      to={to}
      className={`${linkClassName} ${className}`.trim()}
      title={title}
    >
      {children}
    </Link>
  );
};

export default ReportLink;
