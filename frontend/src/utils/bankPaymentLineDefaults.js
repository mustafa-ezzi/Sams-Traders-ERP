export const PAYMENT_AGAINST = {
  INVOICE: "INVOICE",
  OPENING_BALANCE: "OPENING_BALANCE",
};

// Sales uses `receipt_against`, purchase uses `payment_against`
export const getAgainstField = (option) =>
  option?.receipt_against || option?.payment_against || PAYMENT_AGAINST.INVOICE;

// Invoices are NOT dimension-based in the UI, so we ignore tenant_id for INVOICE.
// Opening balances ARE dimension-based, so we filter by tenant_id when against is OPENING_BALANCE.
export const filterOptionsByDimension = (options, tenantId, against) => {
  const list = options || [];
  if (!against) return list;

  let filtered = list.filter((option) => getAgainstField(option) === against);

  if (against === PAYMENT_AGAINST.OPENING_BALANCE && tenantId) {
    filtered = filtered.filter(
      (option) => !option.tenant_id || option.tenant_id === tenantId,
    );
  }
  return filtered;
};

export const sortOptionsOldestFirst = (options) =>
  [...(options || [])].sort((a, b) => {
    const dateCmp = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCmp !== 0) return dateCmp;

    const createdCmp = String(a.created_at || "").localeCompare(
      String(b.created_at || ""),
    );
    if (createdCmp !== 0) return createdCmp;

    return String(a.invoice_number || "").localeCompare(
      String(b.invoice_number || ""),
    );
  });

export const pickDefaultPaymentReference = ({
  options = [],
  tenantId = "",
  against = PAYMENT_AGAINST.OPENING_BALANCE,
}) => {
  if (against === PAYMENT_AGAINST.INVOICE) {
    const invoices = sortOptionsOldestFirst(
      filterOptionsByDimension(options, "", PAYMENT_AGAINST.INVOICE),
    );
    return invoices.length
      ? { against: PAYMENT_AGAINST.INVOICE, option: invoices[0] }
      : null;
  }

  if (against === PAYMENT_AGAINST.OPENING_BALANCE) {
    const openings = sortOptionsOldestFirst(
      filterOptionsByDimension(
        options,
        tenantId,
        PAYMENT_AGAINST.OPENING_BALANCE,
      ),
    );
    if (openings.length) {
      return { against: PAYMENT_AGAINST.OPENING_BALANCE, option: openings[0] };
    }

    // Fallback: if no opening exists for this dimension, pick oldest invoice (cross-dimension).
    const invoices = sortOptionsOldestFirst(
      filterOptionsByDimension(options, "", PAYMENT_AGAINST.INVOICE),
    );
    return invoices.length
      ? { against: PAYMENT_AGAINST.INVOICE, option: invoices[0] }
      : null;
  }

  return null;
};

export const referenceSelectionFromOption = (against, option) => {
  if (!option) {
    return {
      receiptAgainst: against,
      paymentAgainst: against,
      salesInvoiceId: "",
      purchaseInvoiceId: "",
      partyOpeningBalanceId: "",
      salesmanId: "",
      amount: "0",
    };
  }

  const isOpening = against === PAYMENT_AGAINST.OPENING_BALANCE;
  return {
    receiptAgainst: against,
    paymentAgainst: against,
    salesInvoiceId: isOpening ? "" : option.id,
    purchaseInvoiceId: isOpening ? "" : option.id,
    partyOpeningBalanceId: isOpening ? option.id : "",
    salesmanId: option.salesman?.id || "",
    amount: String(option.balance_amount ?? "0"),
  };
};

export const buildDefaultReferencePatch = ({
  options = [],
  tenantId = "",
  against = PAYMENT_AGAINST.OPENING_BALANCE,
}) => {
  const picked = pickDefaultPaymentReference({ options, tenantId, against });
  if (!picked) return referenceSelectionFromOption(against, null);
  return referenceSelectionFromOption(picked.against, picked.option);
};

