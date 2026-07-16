export const PAYMENT_AGAINST = {
  INVOICE: "INVOICE",
  OPENING_BALANCE: "OPENING_BALANCE",
};

export const getAgainstField = (option) =>
  option?.receipt_against ||
  option?.payment_against ||
  PAYMENT_AGAINST.INVOICE;

export const filterOptionsByDimension = (options, tenantId, against) => {
  let filtered = options || [];
  if (against) {
    filtered = filtered.filter((option) => getAgainstField(option) === against);
  }
  if (tenantId) {
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
  const forDimension = sortOptionsOldestFirst(
    filterOptionsByDimension(options, tenantId, against),
  );
  if (forDimension.length) {
    return { against, option: forDimension[0] };
  }

  if (against === PAYMENT_AGAINST.OPENING_BALANCE) {
    return pickDefaultPaymentReference({
      options,
      tenantId,
      against: PAYMENT_AGAINST.INVOICE,
    });
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
  if (!picked) {
    return referenceSelectionFromOption(against, null);
  }
  return referenceSelectionFromOption(picked.against, picked.option);
};
