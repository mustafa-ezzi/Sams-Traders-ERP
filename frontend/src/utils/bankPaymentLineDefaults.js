export const PAYMENT_AGAINST = {
  INVOICE: "INVOICE",
  OPENING_BALANCE: "OPENING_BALANCE",
};

// Sales uses `receipt_against`, purchase uses `payment_against`
export const getAgainstField = (option) =>
  option?.receipt_against || option?.payment_against || PAYMENT_AGAINST.INVOICE;

export const balanceForDimension = (option, tenantId = "") => {
  if (!option) return 0;
  const balances = option.dimension_balances;
  if (
    tenantId &&
    balances &&
    typeof balances === "object" &&
    Object.prototype.hasOwnProperty.call(balances, tenantId)
  ) {
    const parsed = Number(balances[tenantId]);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(option.balance_amount);
  return Number.isFinite(parsed) ? parsed : 0;
};

const optionHasDimensionShare = (option, tenantId) => {
  if (!tenantId || !option) return true;
  const ids = option.dimension_ids;
  if (Array.isArray(ids) && ids.length) {
    return ids.includes(tenantId);
  }
  const balances = option.dimension_balances;
  if (balances && typeof balances === "object" && Object.keys(balances).length) {
    return Object.prototype.hasOwnProperty.call(balances, tenantId);
  }
  // Legacy options without dimension breakdown stay visible.
  return true;
};

// Opening balances ARE dimension-based.
// Invoices with dimension_balances are filtered to the selected company's share.
export const filterOptionsByDimension = (options, tenantId, against) => {
  const list = options || [];
  if (!against) return list;

  let filtered = list.filter((option) => getAgainstField(option) === against);

  if (against === PAYMENT_AGAINST.OPENING_BALANCE && tenantId) {
    filtered = filtered.filter(
      (option) => !option.tenant_id || option.tenant_id === tenantId,
    );
  }

  if (against === PAYMENT_AGAINST.INVOICE && tenantId) {
    filtered = filtered.filter((option) =>
      optionHasDimensionShare(option, tenantId),
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
      filterOptionsByDimension(options, tenantId, PAYMENT_AGAINST.INVOICE),
    ).filter((option) => balanceForDimension(option, tenantId) > 0);
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

    // Fallback: if no opening exists for this dimension, pick oldest invoice share.
    const invoices = sortOptionsOldestFirst(
      filterOptionsByDimension(options, tenantId, PAYMENT_AGAINST.INVOICE),
    ).filter((option) => balanceForDimension(option, tenantId) > 0);
    return invoices.length
      ? { against: PAYMENT_AGAINST.INVOICE, option: invoices[0] }
      : null;
  }

  return null;
};

export const referenceSelectionFromOption = (against, option, tenantId = "") => {
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
    amount: String(
      isOpening
        ? option.balance_amount ?? "0"
        : balanceForDimension(option, tenantId),
    ),
  };
};

export const buildDefaultReferencePatch = ({
  options = [],
  tenantId = "",
  against = PAYMENT_AGAINST.OPENING_BALANCE,
}) => {
  const picked = pickDefaultPaymentReference({ options, tenantId, against });
  if (!picked) return referenceSelectionFromOption(against, null, tenantId);
  return referenceSelectionFromOption(picked.against, picked.option, tenantId);
};
