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
