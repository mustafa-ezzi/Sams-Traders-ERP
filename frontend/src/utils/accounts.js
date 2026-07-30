export const flattenAccountTree = (accounts = []) => {
  const seen = new Set();
  const flat = [];

  const visit = (node, depth = 0) => {
    if (!node || seen.has(node.id)) {
      return;
    }

    seen.add(node.id);
    flat.push({ ...node, depth });

    (node.children || []).forEach((child) => visit(child, depth + 1));
  };

  accounts.forEach((account) => visit(account, 0));
  return flat;
};

export const formatAccountLabel = (account) =>
  `${"  ".repeat(account.depth || 0)}${account.code} - ${account.name}`;

/** Prefer unique codes; keep every account id when codes differ across dimensions. */
export const mergeAccountsById = (accountLists = []) => {
  const byId = new Map();
  accountLists.flat().forEach((account) => {
    if (account?.id) {
      byId.set(account.id, account);
    }
  });
  return [...byId.values()];
};

export const getPostableInventoryAccounts = (accounts = []) =>
  accounts.filter(
    (account) =>
      account.account_group === "ASSET" &&
      account.account_type === "INVENTORY" &&
      account.is_active
  );

const isLeafAccount = (account) => (account.children || []).length === 0;

export const getSelectablePostingAccounts = (accounts = [], accountGroup) =>
  accounts.filter(
    (account) =>
      account.account_group === accountGroup &&
      account.is_active &&
      (account.is_postable || isLeafAccount(account))
  );

/**
 * Deduplicate by account code for dropdowns where dimension should not matter,
 * preferring the preferredTenantId copy when available.
 */
export const uniqueAccountsByCode = (accounts = [], preferredTenantId = "") => {
  const byCode = new Map();
  accounts.forEach((account) => {
    const code = String(account?.code || "").trim();
    if (!code) return;
    const existing = byCode.get(code);
    if (!existing) {
      byCode.set(code, account);
      return;
    }
    if (
      preferredTenantId &&
      account.tenant_id === preferredTenantId &&
      existing.tenant_id !== preferredTenantId
    ) {
      byCode.set(code, account);
    }
  });
  return [...byCode.values()].sort((a, b) =>
    String(a.code).localeCompare(String(b.code), undefined, { numeric: true }),
  );
};
