/**
 * Build DRF OrderingFilter value. Defaults to newest-created-first.
 * Always appends created_at/id as stable tiebreakers when sorting by another field.
 */
export function buildListOrdering(
  sortConfig,
  fields = {},
  defaultField = "created_at",
) {
  const field = fields[sortConfig?.key] || defaultField;
  const primary =
    sortConfig?.direction === "asc" ? field : `-${field}`;
  if (field === "created_at") {
    return `${primary},-id`;
  }
  return `${primary},-created_at,-id`;
}
