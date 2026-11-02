import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import DimensionPrintButtons from "../../components/ui/DimensionPrintButtons";
import RateListPrintModal from "../../components/print/RateListPrintModal";
import productService from "../../api/services/productService";
import rateListGroupService from "../../api/services/rateListGroupService";
import rateListService from "../../api/services/rateListService";
import dimensionService from "../../api/services/dimensionService";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { dimensionToCompanyConfig } from "../../utils/dimensionCompany";
import { selectClassName } from "../../utils/themeClasses";
import {
  createEmptyLine,
  extractErrorMessage,
  formatDisplayDate,
  todayIsoDate,
  withComputedPrices,
} from "./rateListShared";

const CreateUpdateRateList = () => {
  const { id } = useParams();
  const editingId = id || "";
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

  const [title, setTitle] = useState("");
  const [listDate, setListDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([createEmptyLine()]);
  const [products, setProducts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [loading, setLoading] = useState(Boolean(editingId));
  const [saving, setSaving] = useState(false);
  const [printModal, setPrintModal] = useState(null);

  const productMap = useMemo(
    () => Object.fromEntries(products.map((product) => [product.id, product])),
    [products],
  );

  const groupOptions = useMemo(
    () => groups.map((group) => ({ id: group.id, name: group.name })),
    [groups],
  );

  const visibleLines = useMemo(() => {
    if (!groupFilter) return lines.map((line, index) => ({ line, index }));
    return lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.groupId === groupFilter);
  }, [lines, groupFilter]);

  const allVisibleSelected =
    visibleLines.length > 0 &&
    visibleLines.every(({ line }) => line.includeInPrint);

  const loadLookups = async () => {
    try {
      const [productOptions, groupList] = await Promise.all([
        productService.options(),
        rateListGroupService.options(),
      ]);
      setProducts(productOptions || []);
      setGroups(groupList || []);
    } catch (loadError) {
      toast.error(extractErrorMessage(loadError) || "Failed to load lookups");
    }
  };

  const loadRateList = async () => {
    if (!editingId) return;
    setLoading(true);
    try {
      const record = await rateListService.getById(editingId);
      setTitle(record.title || "");
      setListDate(record.listDate || todayIsoDate());
      setNotes(record.notes || "");
      setLines(
        (record.lines || []).length
          ? record.lines.map((line) =>
              withComputedPrices({
                key: line.id || createEmptyLine().key,
                productId: line.productId || "",
                groupId: line.groupId || "",
                sku: line.sku || "",
                productName: line.productName || "",
                uomName: line.uomName || "",
                description: line.description || "",
                cost: line.cost ?? 0,
                percentage: line.percentage ?? 0,
                discountPercent: line.discountPercent ?? 0,
                includeInPrint: line.includeInPrint !== false,
              }),
            )
          : [createEmptyLine()],
      );
    } catch (loadError) {
      toast.error(extractErrorMessage(loadError) || "Failed to load rate list");
      navigate("/rate-lists");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLookups();
    loadRateList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const updateLine = (index, patch) => {
    setLines((prev) =>
      prev.map((line, lineIndex) =>
        lineIndex === index ? withComputedPrices({ ...line, ...patch }) : line,
      ),
    );
  };

  const handleProductChange = (index, productId) => {
    const product = productMap[productId];
    if (!product) {
      updateLine(index, {
        productId: "",
        sku: "",
        productName: "",
        uomName: "",
        cost: "0",
      });
      return;
    }
    updateLine(index, {
      productId,
      sku: product.sku || "",
      productName: product.name || "",
      uomName: product.unit_name || product.unitName || "",
      cost: product.confirmed_unit_cost ?? product.confirmedUnitCost ?? 0,
    });
  };

  const addLine = () => setLines((prev) => [...prev, createEmptyLine()]);

  const removeLine = (index) => {
    setLines((prev) => {
      if (prev.length <= 1) return [createEmptyLine()];
      return prev.filter((_, lineIndex) => lineIndex !== index);
    });
  };

  const toggleSelectAllVisible = () => {
    const nextValue = !allVisibleSelected;
    const visibleIndexes = new Set(visibleLines.map(({ index }) => index));
    setLines((prev) =>
      prev.map((line, index) =>
        visibleIndexes.has(index)
          ? { ...line, includeInPrint: nextValue }
          : line,
      ),
    );
  };

  const buildPayload = () => ({
    title: title.trim(),
    list_date: listDate,
    notes: notes.trim(),
    lines: lines.map((line, index) => ({
      product_id: line.productId,
      group_id: line.groupId || null,
      sku: line.sku || "",
      product_name: line.productName || "",
      uom_name: line.uomName || "",
      description: line.description || "",
      cost: Number(line.cost) || 0,
      percentage: Number(line.percentage) || 0,
      discount_percent: Number(line.discountPercent) || 0,
      include_in_print: Boolean(line.includeInPrint),
      sort_order: index,
    })),
  });

  const validateBeforeSave = () => {
    if (!listDate) {
      toast.error("List date is required");
      return false;
    }
    if (!lines.length) {
      toast.error("Add at least one line");
      return false;
    }
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.productId) {
        toast.error(`Line ${index + 1}: select a product`);
        return false;
      }
    }
    return true;
  };

  const validatePrintSelection = (selectedLines) => {
    if (!selectedLines.length) {
      toast.error("Select at least one product to print");
      return false;
    }
    for (const line of selectedLines) {
      if (!line.productId) {
        toast.error("Selected print lines must have a product");
        return false;
      }
      if (!line.groupId) {
        toast.error("Selected print lines must have a group");
        return false;
      }
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateBeforeSave()) return;
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editingId) {
        const response = await rateListService.update(editingId, payload);
        toast.success(response.message || "Rate list updated");
      } else {
        const response = await rateListService.create(payload);
        toast.success(response.message || "Rate list created");
        if (response.data?.id) {
          navigate(`/rate-lists/${response.data.id}/edit`, { replace: true });
          return;
        }
      }
    } catch (saveError) {
      toast.error(extractErrorMessage(saveError) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenPrint = async (_recordId, dimensionCode) => {
    const selectedLines = lines.filter((line) => line.includeInPrint);
    if (!validatePrintSelection(selectedLines)) return;

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

      const groupNameById = Object.fromEntries(
        groups.map((group) => [group.id, group.name]),
      );

      setPrintModal({
        loading: false,
        rateList: {
          title: title.trim() || "Rate List",
          listDate: listDate || todayIsoDate(),
          notes: notes.trim(),
          lines: selectedLines.map((line, index) => ({
            ...line,
            sortOrder: index,
            groupName: groupNameById[line.groupId] || line.groupName || "Ungrouped",
          })),
        },
        company: dimensionToCompanyConfig(companyDimension),
      });
    } catch (printError) {
      toast.error(extractErrorMessage(printError) || "Could not open print");
      setPrintModal(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Loading rate list…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {editingId ? "Edit Rate List" : "Create Rate List"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Cost + % → TP, then discount % → selling price. Print hides cost and markup %.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => navigate("/rate-lists")}>
              Back
            </Button>
            <DimensionPrintButtons
              dimensions={printDimensions}
              onPrint={handleOpenPrint}
              recordId={editingId || "draft"}
              disabled={!lines.some((line) => line.includeInPrint)}
            />
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <FormInput
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Optional title"
          />
          <FormInput
            label="List date"
            type="date"
            required
            value={listDate}
            onChange={(event) => setListDate(event.target.value)}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Filter by group
            </label>
            <select
              className={selectClassName}
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
            >
              <option value="">All groups</option>
              {groupOptions.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <FormInput
            label="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional notes"
          />
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {lines.length} line{lines.length === 1 ? "" : "s"}
            {groupFilter
              ? ` · showing ${visibleLines.length} in filter`
              : ""}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={toggleSelectAllVisible}>
              {allVisibleSelected ? "Unselect visible" : "Select visible for print"}
            </Button>
            <Button variant="secondary" onClick={addLine}>
              Add line
            </Button>
          </div>
        </div>

        {!lines.length ? (
          <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
            No products yet. Add a line to start the rate list.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                <tr>
                  <th className="px-2 py-2">S.No</th>
                  <th className="px-2 py-2">Print</th>
                  <th className="px-2 py-2 min-w-[180px]">Product</th>
                  <th className="px-2 py-2">SKU</th>
                  <th className="px-2 py-2 min-w-[140px]">Description</th>
                  <th className="px-2 py-2">UOM</th>
                  <th className="px-2 py-2">Cost</th>
                  <th className="px-2 py-2">%</th>
                  <th className="px-2 py-2">TP</th>
                  <th className="px-2 py-2">Disc %</th>
                  <th className="px-2 py-2">Selling</th>
                  <th className="px-2 py-2 min-w-[140px]">Group of</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {visibleLines.map(({ line, index }, visibleIndex) => (
                  <tr
                    key={line.key}
                    className="border-b border-slate-100 align-top dark:border-slate-800"
                  >
                    <td className="px-2 py-2 text-slate-500">{visibleIndex + 1}</td>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={Boolean(line.includeInPrint)}
                        onChange={(event) =>
                          updateLine(index, {
                            includeInPrint: event.target.checked,
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-2 min-w-[200px]">
                      <SearchableSelect
                        value={line.productId}
                        options={products}
                        getOptionLabel={(option) =>
                          `${option.sku ? `${option.sku} · ` : ""}${option.name}`
                        }
                        onChange={(value) => handleProductChange(index, value)}
                        placeholder="Select product"
                        showAllOptions
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-slate-600">
                      {line.sku || "—"}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className={selectClassName}
                        value={line.description}
                        onChange={(event) =>
                          updateLine(index, { description: event.target.value })
                        }
                        placeholder="Optional"
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {line.uomName || "—"}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`${selectClassName} w-24`}
                        value={line.cost}
                        onChange={(event) =>
                          updateLine(index, { cost: event.target.value })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`${selectClassName} w-20`}
                        value={line.percentage}
                        onChange={(event) =>
                          updateLine(index, { percentage: event.target.value })
                        }
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap font-medium">
                      {line.tradePrice}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        className={`${selectClassName} w-20`}
                        value={line.discountPercent}
                        onChange={(event) =>
                          updateLine(index, {
                            discountPercent: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap font-semibold text-slate-900 dark:text-slate-100">
                      {line.sellingPrice}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className={selectClassName}
                        value={line.groupId || ""}
                        onChange={(event) =>
                          updateLine(index, { groupId: event.target.value })
                        }
                      >
                        <option value="">Select group</option>
                        {groupOptions.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <Button
                        variant="secondary"
                        onClick={() => removeLine(index)}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {printModal ? (
        <RateListPrintModal
          rateList={printModal.rateList}
          company={printModal.company}
          loading={printModal.loading}
          formatDisplayDate={formatDisplayDate}
          onClose={() => setPrintModal(null)}
        />
      ) : null}
    </div>
  );
};

export default CreateUpdateRateList;
