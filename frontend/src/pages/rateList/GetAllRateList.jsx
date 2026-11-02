import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import StateView from "../../components/StateView";
import PageSizeSelect from "../../components/ui/PageSizeSelect";
import IconButton from "../../components/ui/IconButton";
import DimensionPrintButtons from "../../components/ui/DimensionPrintButtons";
import RateListPrintModal from "../../components/print/RateListPrintModal";
import rateListService from "../../api/services/rateListService";
import dimensionService from "../../api/services/dimensionService";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { dimensionToCompanyConfig } from "../../utils/dimensionCompany";
import { usePersistedListState } from "../../hooks/usePersistedListState";
import {
  extractErrorMessage,
  formatDisplayDate,
} from "./rateListShared";

const GetAllRateList = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { allowedDimensions, tenantId } = useAuth();
  const printDimensions = useMemo(
    () =>
      (allowedDimensions || []).filter(
        (dimension) => dimension?.code && dimension.is_active !== false,
      ),
    [allowedDimensions],
  );
  const {
    search,
    page,
    limit,
    setSearch,
    setPage,
    setLimit,
  } = usePersistedListState("rate-lists");

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const [printModal, setPrintModal] = useState(null);
  const [printLoadingId, setPrintLoadingId] = useState("");
  const printCancelledRef = useRef(false);

  const loadRecords = async (
    nextPage = page,
    nextSearch = search,
    nextLimit = limit,
  ) => {
    setLoading(true);
    setError("");
    try {
      const response = await rateListService.list({
        page: nextPage,
        limit: nextLimit,
        search: nextSearch,
        ordering: "-list_date",
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(extractErrorMessage(loadError) || "Failed to load rate lists");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords(page, search, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClosePrint = () => {
    printCancelledRef.current = true;
    setPrintModal(null);
  };

  const handleOpenPrint = async (recordId, dimensionCode) => {
    printCancelledRef.current = false;
    setPrintLoadingId(recordId);
    const dimension =
      printDimensions.find((item) => item.code === dimensionCode) ||
      printDimensions.find((item) => item.code === tenantId) ||
      printDimensions[0] ||
      (dimensionCode || tenantId
        ? { code: dimensionCode || tenantId, name: dimensionCode || tenantId }
        : null);

    setPrintModal({
      loading: true,
      rateList: null,
      company: dimensionToCompanyConfig(dimension),
    });

    try {
      let companyDimension = dimension;
      try {
        const items = await dimensionService.list();
        const match =
          (items || []).find((item) => item.code === dimension?.code) ||
          (items || []).find((item) => item.code === tenantId) ||
          (items || [])[0];
        if (match) companyDimension = match;
      } catch {
        // Keep login dimension if lookup fails.
      }

      const rateList = await rateListService.getById(recordId);
      if (printCancelledRef.current) return;

      const selectedLines = (rateList.lines || []).filter(
        (line) => line.includeInPrint,
      );
      if (!selectedLines.length) {
        toast.error("No products selected for print on this rate list");
        setPrintModal(null);
        return;
      }
      const missingGroup = selectedLines.find((line) => !line.groupId);
      if (missingGroup) {
        toast.error("Selected print lines must have a group");
        setPrintModal(null);
        return;
      }

      setPrintModal({
        loading: false,
        rateList: {
          ...rateList,
          lines: selectedLines,
        },
        company: dimensionToCompanyConfig(companyDimension),
      });
    } catch (printError) {
      if (!printCancelledRef.current) {
        toast.error(
          extractErrorMessage(printError) || "Could not load rate list for printing",
        );
        setPrintModal(null);
      }
    } finally {
      setPrintLoadingId("");
    }
  };

  const confirmDelete = async () => {
    try {
      const response = await rateListService.remove(deleteId);
      toast.success(response.message || "Rate list deleted successfully");
      setDeleteId("");
      await loadRecords(page, search, limit);
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError) || "Failed to delete");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Rate Lists
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Build priced product lists by group and print with company branding.
            </p>
          </div>
          <Button onClick={() => navigate("/rate-lists/create")}>
            New rate list
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <FormInput
              label="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title or notes"
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => loadRecords(1, search, limit)}
          >
            Search
          </Button>
          <PageSizeSelect
            value={limit}
            onChange={(value) => {
              setLimit(value);
              loadRecords(1, search, value);
            }}
          />
        </div>
      </Card>

      <Card>
        <StateView loading={loading} error={error}>
          {!records.length ? (
            <p className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500 dark:border-slate-700">
              No rate lists yet. Create one to price and print products by group.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                  <tr>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Lines</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr
                      key={record.id}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-3 py-3 font-medium text-slate-800 dark:text-slate-100">
                        {record.title || "Untitled rate list"}
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                        {formatDisplayDate(record.listDate)}
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                        {record.lineCount ?? 0}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <DimensionPrintButtons
                            dimensions={printDimensions}
                            onPrint={handleOpenPrint}
                            recordId={record.id}
                            disabled={printLoadingId === record.id}
                          />
                          <IconButton
                            icon="edit"
                            label="Edit"
                            onClick={() =>
                              navigate(`/rate-lists/${record.id}/edit`)
                            }
                          />
                          <IconButton
                            icon="delete"
                            label="Delete"
                            onClick={() => setDeleteId(record.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </StateView>

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => loadRecords(page - 1, search, limit)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => loadRecords(page + 1, search, limit)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete rate list?"
        description="This will soft-delete the rate list and its lines."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId("")}
      />

      {printModal ? (
        <RateListPrintModal
          rateList={printModal.rateList}
          company={printModal.company}
          loading={printModal.loading}
          formatDisplayDate={formatDisplayDate}
          onClose={handleClosePrint}
        />
      ) : null}
    </div>
  );
};

export default GetAllRateList;
