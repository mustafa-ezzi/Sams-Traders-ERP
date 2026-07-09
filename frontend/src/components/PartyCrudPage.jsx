import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useParams } from "react-router-dom";
import StateView from "./StateView";
import Card from "./ui/Card";
import Button from "./ui/Button";
import FormInput from "./ui/FormInput";
import ConfirmModal from "./ui/ConfirmModal";
import IconButton from "./ui/IconButton";
import PageSizeSelect from "./ui/PageSizeSelect";
import dimensionService from "../api/services/dimensionService";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import partyOpeningBalanceService from "../api/services/partyOpeningBalanceService";
import PartyOpeningBalanceModal from "./parties/PartyOpeningBalanceModal";
import { formatAccountLabel } from "../utils/accounts";
import { formatMoney } from "../utils/format";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.union([
    z.string().trim().email("Email must be valid"),
    z.literal(""),
  ]),
  phone_number: z.string().trim(),
  business_name: z.string().trim().min(1, "Business name is required"),
  address: z.string().trim().min(1, "Address is required"),
  account: z.union([
    z.string().uuid("Account must be a valid UUID"),
    z.literal(""),
  ]),
});

const defaultValues = {
  name: "",
  email: "",
  phone_number: "",
  business_name: "",
  address: "",
  account: "",
};

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const PartyCrudPage = ({
  title,
  service,
  partyType = "",
  view = "combined",
  basePath = "",
  accountLabel = "Control Account",
  accountOptions = [],
  loadingAccounts = false,
  autoControlAccount = false,
  controlAccountHint = "",
}) => {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const isListView = view === "list";
  const isFormView = view === "form";
  const isCombinedView = !isListView && !isFormView;

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inlineEditingId, setInlineEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(10);
  const [deleteId, setDeleteId] = useState("");
  const [openingBalances, setOpeningBalances] = useState([]);
  const [openingPartyOptions, setOpeningPartyOptions] = useState([]);
  const [openingDimensionOptions, setOpeningDimensionOptions] = useState([]);
  const [openingLoading, setOpeningLoading] = useState(false);
  const [openingPartyLoading, setOpeningPartyLoading] = useState(false);
  const [openingModalOpen, setOpeningModalOpen] = useState(false);
  const [editingOpening, setEditingOpening] = useState(null);
  const [deleteOpeningId, setDeleteOpeningId] = useState("");
  const [loadingRecord, setLoadingRecord] = useState(false);
  const toast = useToast();
  const { allowedDimensions } = useAuth();

  const editingId = isFormView ? routeId || "" : inlineEditingId;
  const singularTitle = title.endsWith("s") ? title.slice(0, -1) : title;
  const accountMap = useMemo(
    () =>
      Object.fromEntries(
        accountOptions.map((account) => [account.id, account]),
      ),
    [accountOptions],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const openingDimensions = useMemo(
    () => {
      if (openingDimensionOptions.length) {
        const activeFromApi = openingDimensionOptions
          .filter((item) => item?.is_active !== false)
          .map((item) => ({ code: item.code, name: item.name }));
        if (activeFromApi.length) return activeFromApi;
      }
      return (allowedDimensions || [])
        .filter((item) => item?.is_active)
        .map((item) => ({ code: item.code, name: item.name }));
    },
    [allowedDimensions, openingDimensionOptions],
  );

  const openingDimensionMap = useMemo(
    () => Object.fromEntries(openingDimensions.map((item) => [item.code, item.name])),
    [openingDimensions],
  );

  const openingPartyMap = useMemo(
    () =>
      Object.fromEntries(
        (openingPartyOptions || []).map((party) => [String(party.id), party]),
      ),
    [openingPartyOptions],
  );

  const loadRecords = async (nextPage = page, nextSearch = search, nextLimit = limit) => {
    setLoading(true);
    setError("");
    try {
      const response = await service.list({
        page: nextPage,
        limit: nextLimit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(
        loadError?.response?.data?.message ||
          `Failed to load ${title.toLowerCase()}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const loadOpeningBalances = async () => {
    if (!partyType || isFormView) return;
    setOpeningLoading(true);
    try {
      const response = await partyOpeningBalanceService.list({
        page: 1,
        limit: 100,
        partyType,
      });
      setOpeningBalances(response.data || []);
    } catch {
      toast.error("Failed to load opening accounts");
    } finally {
      setOpeningLoading(false);
    }
  };

  useEffect(() => {
    if (!partyType || isFormView) return;
    let cancelled = false;
    dimensionService
      .list()
      .then((items) => {
        if (!cancelled) {
          setOpeningDimensionOptions(items || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOpeningDimensionOptions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [partyType, isFormView]);

  const loadOpeningPartyOptions = async () => {
    if (!partyType || isFormView) return;
    if (!openingDimensions.length) {
      setOpeningPartyOptions([]);
      return;
    }

    setOpeningPartyLoading(true);
    try {
      const fetchAllPartiesForDimension = async (dimension) => {
        const rows = [];
        let nextPage = 1;
        const perPage = 100;
        let keepLoading = true;

        while (keepLoading) {
          const response = await service.list(
            {
              page: nextPage,
              limit: perPage,
              search: "",
            },
            dimension.code,
          );

          const data = response.data || response.results || [];
          rows.push(
            ...data.map((row) => ({
              ...row,
              tenant_id: dimension.code,
              dimension_name: dimension.name,
            })),
          );

          const total =
            Number(response.total ?? response.count ?? rows.length) || rows.length;
          const hasNext =
            Boolean(response.next) ||
            (Number.isFinite(total) ? rows.length < total : data.length === perPage);

          if (!hasNext || data.length === 0) {
            keepLoading = false;
          } else {
            nextPage += 1;
          }
        }

        return rows;
      };

      const perDimensionRows = await Promise.all(
        openingDimensions.map((dimension) => fetchAllPartiesForDimension(dimension)),
      );

      setOpeningPartyOptions(perDimensionRows.flat());
    } catch {
      toast.error(`Failed to load all ${title.toLowerCase()} for opening accounts`);
      setOpeningPartyOptions([]);
    } finally {
      setOpeningPartyLoading(false);
    }
  };

  useEffect(() => {
    if (!isFormView) {
      loadRecords(1, "");
      loadOpeningBalances();
    }
  }, [isFormView, partyType]);

  useEffect(() => {
    if (!isFormView && partyType) {
      loadOpeningPartyOptions();
    }
  }, [isFormView, partyType, openingDimensions.length]);

  useEffect(() => {
    if (!isFormView) return;

    if (!routeId) {
      form.reset(defaultValues);
      setLoadingRecord(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadingRecord(true);
      try {
        const response = await service.getById(routeId);
        const record = response.data || response;
        if (cancelled) return;
        form.reset({
          name: record.name || "",
          email: record.email || "",
          phone_number: record.phone_number || "",
          business_name: record.business_name || "",
          address: record.address || "",
          account: record.account || "",
        });
      } catch (editError) {
        if (!cancelled) {
          toast.error(
            editError?.response?.data?.message ||
              `Failed to load ${singularTitle.toLowerCase()}`,
          );
          navigate(basePath, { replace: true });
        }
      } finally {
        if (!cancelled) setLoadingRecord(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [routeId, isFormView, basePath, service, form, navigate, singularTitle, toast]);

  const resetForm = () => {
    if (isFormView && basePath) {
      navigate(basePath);
      return;
    }
    setInlineEditingId("");
    form.reset(defaultValues);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const payload = {
        ...values,
        account: autoControlAccount ? null : values.account || null,
      };

      if (editingId) {
        await service.update(editingId, payload);
        toast.success(`${singularTitle} updated`);
      } else {
        await service.create(payload);
        toast.success(`${singularTitle} created`);
      }

      if (isFormView && basePath) {
        navigate(basePath);
        return;
      }

      resetForm();
      await loadRecords();
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "Save failed";
      setError(message);
      toast.error(message);
    }
  });

  const onEdit = async (recordId) => {
    if (isListView && basePath) {
      navigate(`${basePath}/${recordId}/edit`);
      return;
    }

    try {
      const response = await service.getById(recordId);
      const record = response.data || response;
      setInlineEditingId(record.id);
      form.reset({
        name: record.name || "",
        email: record.email || "",
        phone_number: record.phone_number || "",
        business_name: record.business_name || "",
        address: record.address || "",
        account: record.account || "",
      });
    } catch (editError) {
      const message =
        editError?.response?.data?.message ||
        `Failed to load ${singularTitle.toLowerCase()}`;
      setError(message);
      toast.error(message);
    }
  };

  const onDelete = async (recordId) => {
    try {
      await service.remove(recordId);
      toast.success(`${singularTitle} deleted`);
      await loadRecords();
    } catch (deleteError) {
      const message = deleteError?.response?.data?.message || "Delete failed";
      setError(message);
      toast.error(message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleSaveOpening = async (payload, openingId) => {
    if (openingId) {
      const response = await partyOpeningBalanceService.update(openingId, {
        date: payload.date,
        amount: payload.amount,
        remarks: payload.remarks,
        party_type: payload.party_type,
      });
      toast.success(response.message || "Opening account updated");
    } else {
      const response = await partyOpeningBalanceService.create(payload);
      toast.success(response.message || "Opening account saved");
    }
    await loadOpeningBalances();
  };

  const handleDeleteOpening = async (openingId) => {
    try {
      const response = await partyOpeningBalanceService.remove(openingId);
      toast.success(response.message || "Opening account deleted");
      await loadOpeningBalances();
    } catch (deleteError) {
      toast.error(
        deleteError?.response?.data?.message || "Failed to delete opening account",
      );
    }
  };

  const showForm = isFormView || isCombinedView;
  const showList = isListView || isCombinedView;

  const formCard = showForm ? (
    <Card>
      {isFormView ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {editingId ? `Edit ${singularTitle}` : `Create ${singularTitle}`}
            </h3>
          </div>
          <Button type="button" variant="secondary" onClick={resetForm}>
            Back to list
          </Button>
        </div>
      ) : null}

      {loadingRecord ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <FormInput
            label="Name"
            required
            placeholder={`Enter ${singularTitle.toLowerCase()} name`}
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <FormInput
            label="Business Name"
            required
            placeholder="Enter business name"
            error={form.formState.errors.business_name?.message}
            {...form.register("business_name")}
          />
          <FormInput
            label="Email"
            placeholder="Enter email"
            error={form.formState.errors.email?.message}
            {...form.register("email")}
          />
          <FormInput
            label="Phone Number"
            placeholder="Enter phone number (optional)"
            error={form.formState.errors.phone_number?.message}
            {...form.register("phone_number")}
          />
          {!autoControlAccount ? (
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">
                {accountLabel}
              </label>
              <select
                className={selectClassName}
                disabled={loadingAccounts}
                {...form.register("account")}
              >
                <option value="">Select account</option>
                {accountOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatAccountLabel(account)}
                  </option>
                ))}
              </select>
              {form.formState.errors.account?.message && (
                <p className="text-sm text-rose-600">
                  {form.formState.errors.account.message}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 md:col-span-2">
              {controlAccountHint ||
                "The control account is assigned automatically for this dimension."}
            </div>
          )}
          <FormInput
            label="Address"
            required
            as="textarea"
            rows={3}
            className="min-h-[112px] resize-y"
            placeholder="Enter address"
            error={form.formState.errors.address?.message}
            {...form.register("address")}
          />
          <div className="flex flex-col gap-3 md:justify-end">
            <Button type="submit" className="w-full">
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId && isCombinedView ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={resetForm}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </Card>
  ) : null;

  return (
    <section className="space-y-6">
      {partyType && !isFormView ? (
        <PartyOpeningBalanceModal
          open={openingModalOpen}
          onClose={() => {
            setOpeningModalOpen(false);
            setEditingOpening(null);
          }}
          partyType={partyType}
          partyLabel={singularTitle}
          partyOptions={openingPartyOptions}
          dimensions={openingDimensions}
          loadingParties={openingPartyLoading}
          dimensionMap={openingDimensionMap}
          editingRecord={editingOpening}
          onSubmit={handleSaveOpening}
        />
      ) : null}

      <ConfirmModal
        open={Boolean(deleteOpeningId)}
        title="Delete Opening Account"
        description="This removes the opening balance and reverses its journal entry."
        onCancel={() => setDeleteOpeningId("")}
        onConfirm={async () => {
          const selectedId = deleteOpeningId;
          setDeleteOpeningId("");
          await handleDeleteOpening(selectedId);
        }}
      />

      <ConfirmModal
        open={Boolean(deleteId)}
        title={`Delete ${singularTitle}`}
        description="This action will soft delete the record. Continue?"
        onCancel={() => setDeleteId("")}
        onConfirm={async () => {
          const selectedId = deleteId;
          setDeleteId("");
          await onDelete(selectedId);
        }}
      />

      {showList ? (
        <>
          <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(224,242,254,0.96))]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                  {title}
                </h2>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-72"
                  placeholder={`Search ${title.toLowerCase()}`}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <Button variant="secondary" onClick={() => loadRecords(1, search)}>
                  Search
                </Button>
                {isListView && basePath ? (
                  <Link to={`${basePath}/create`}>
                    <Button type="button">Create {singularTitle}</Button>
                  </Link>
                ) : null}
                {partyType ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditingOpening(null);
                      setOpeningModalOpen(true);
                      if (!openingPartyOptions.length && !openingPartyLoading) {
                        loadOpeningPartyOptions();
                      }
                    }}
                  >
                    Opening Account
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          <StateView
            loading={loading}
            error={error}
            isEmpty={!loading && !error && records.length === 0}
            emptyMessage={`No ${title.toLowerCase()} found`}
          >
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                    <tr>
                      <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                      <th className="px-5 py-4 font-bold text-slate-700">
                        Business Name
                      </th>
                      <th className="px-5 py-4 font-bold text-slate-700">Email</th>
                      <th className="px-5 py-4 font-bold text-slate-700">Phone</th>
                      <th className="px-5 py-4 font-bold text-slate-700">
                        Account
                      </th>
                      <th className="px-5 py-4 font-bold text-slate-700">
                        Address
                      </th>
                      <th className="px-5 py-4 text-right font-bold text-slate-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr
                        key={record.id}
                        className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50"
                      >
                        <td className="px-5 py-4 font-medium text-slate-700">
                          {record.name}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {record.business_name}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {record.email || "-"}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {record.phone_number}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {record.account && accountMap[record.account]
                            ? formatAccountLabel(accountMap[record.account]).trim()
                            : "-"}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {record.address}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <IconButton
                              icon="edit"
                              label={`Edit ${singularTitle}`}
                              onClick={() => onEdit(record.id)}
                            />
                            <IconButton
                              icon="delete"
                              label={`Delete ${singularTitle}`}
                              onClick={() => setDeleteId(record.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-center sm:text-left">
                  {total} total records
                </span>
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
                  <PageSizeSelect
                    value={limit}
                    onChange={(nextLimit) => {
                      setLimit(nextLimit);
                      loadRecords(1, search, nextLimit);
                    }}
                    disabled={loading}
                  />
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={page <= 1}
                    onClick={() => loadRecords(page - 1, search)}
                  >
                    Prev
                  </Button>
                  <span className="font-semibold text-slate-700">
                    Page {page} / {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => loadRecords(page + 1, search)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </Card>
          </StateView>

          {partyType ? (
            <Card className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Opening Accounts</h3>
                  <p className="text-sm text-slate-500">
                    Posted to receivable/payable control accounts for party ledger reports.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditingOpening(null);
                    setOpeningModalOpen(true);
                    if (!openingPartyOptions.length && !openingPartyLoading) {
                      loadOpeningPartyOptions();
                    }
                  }}
                >
                  Add Opening Account
                </Button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-4 py-3 font-bold text-slate-700">{singularTitle}</th>
                      <th className="px-4 py-3 font-bold text-slate-700">Dimension</th>
                      <th className="px-4 py-3 font-bold text-slate-700">Date</th>
                      <th className="px-4 py-3 font-bold text-slate-700 text-right">Amount</th>
                      <th className="px-4 py-3 font-bold text-slate-700">Remarks</th>
                      <th className="px-4 py-3 text-right font-bold text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openingLoading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                          Loading opening accounts...
                        </td>
                      </tr>
                    ) : openingBalances.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                          No opening accounts yet.
                        </td>
                      </tr>
                    ) : (
                      openingBalances.map((record) => (
                        <tr key={record.id} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {record.partyName}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {openingPartyMap[
                              String(record.customerId || record.supplierId || "")
                            ]?.dimension_name || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{record.date}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                            {formatMoney(record.amount)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {record.remarks || "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <IconButton
                                icon="edit"
                                label="Edit opening account"
                                onClick={() => {
                                  setEditingOpening(record);
                                  setOpeningModalOpen(true);
                                }}
                              />
                              <IconButton
                                icon="delete"
                                label="Delete opening account"
                                onClick={() => setDeleteOpeningId(record.id)}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      {isCombinedView ? formCard : null}
      {isFormView ? formCard : null}
    </section>
  );
};

export default PartyCrudPage;
