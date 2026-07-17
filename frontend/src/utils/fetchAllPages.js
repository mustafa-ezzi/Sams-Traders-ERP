/**
 * Loads a complete paginated master list for searchable dropdowns.
 */
export const fetchAllPages = async (
  service,
  params = {},
  { pageSize = 100 } = {},
) => {
  const rows = [];
  let page = 1;
  let total = 0;

  do {
    const response = await service.list({
      ...params,
      page,
      limit: pageSize,
    });
    const data = response?.data || [];
    if (!data.length) break;
    rows.push(...data);
    total = Number(response?.total ?? response?.count ?? rows.length);
    page += 1;
  } while (rows.length < total);

  return rows;
};

