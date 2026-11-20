import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import rawMaterialService from "../../../api/services/rawMaterialService";
import brandService from "../../../api/services/brandService";
import categoryService from "../../../api/services/categoryService";
import unitService from "../../../api/services/unitService";
import accountService from "../../../api/services/accountService";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import SearchableSelect from "../../../components/ui/SearchableSelect";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";
import DimensionCreateSelector from "../../../components/ui/DimensionCreateSelector";
import {
  flattenAccountTree,
  formatAccountLabel,
  getPostableInventoryAccounts,
} from "../../../utils/accounts";
import { parseApiError } from "../../../utils/apiErrors";
const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  brand: z.string().uuid("brandId must be a valid UUID"),
  category: z.string().uuid("categoryId must be a valid UUID"),
  purchase_unit: z.string().uuid("purchase_unit must be a valid UUID"),
  inventory_account: z.union([
    z.string().uuid("inventory account must be a valid UUID"),
    z.literal(""),
  ]),
  purchase_price: z.coerce.number().min(0),
});
const defaultValues = {
  name: "",
  brand: "",
  category: "",
  purchase_unit: "",
  inventory_account: "",
  purchase_price: 0,
};
const nextCopyName = (name) => {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "";
  const numbered = trimmed.match(/^(.*) \(copy (\d+)\)$/i);
  if (numbered) {
    return `${numbered[1]} (copy ${Number(numbered[2]) + 1})`;
  }
  if (/\(copy\)$/i.test(trimmed)) {
    return `${trimmed.replace(/\s*\(copy\)$/i, "")} (copy 2)`;
  }
  return `${trimmed} (copy)`;
};
const mapRawMaterialToForm = (row = {}, { asCopy = false } = {}) => ({
  name: asCopy ? nextCopyName(row.name) : row.name || "",
  brand: row.brand?.id || row.brand || "",
  category: row.category?.id || row.category || "",
  purchase_unit: row.purchase_unit?.id || row.purchase_unit || "",
  inventory_account: row.inventory_account || "",
  purchase_price: Number(row.purchase_price || 0),
});
const CreateUpdateRawMaterial = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const duplicateId = searchParams.get("duplicate") || "";
  const isEdit = Boolean(id);
  const isDuplicate = Boolean(!isEdit && duplicateId);
  const { tenantId } = useAuth();
  const routeTenantId = location.state?.tenantId || "";
  const [createDimensionIds, setCreateDimensionIds] = useState(() =>
    tenantId ? [tenantId] : [],
  );
  const [recordTenantId, setRecordTenantId] = useState(routeTenantId);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [inventoryAccounts, setInventoryAccounts] = useState([]);
  const toast = useToast();
  const form = useForm({ resolver: zodResolver(schema), defaultValues });
  const selectedBrandId = form.watch("brand");
  const selectedCategoryId = form.watch("category");
  const selectedUnitId = form.watch("purchase_unit");
  const selectedInventoryAccountId = form.watch("inventory_account");
  const categoryMap = useMemo(
    () =>
      Object.fromEntries(categories.map((category) => [category.id, category])),
    [categories],
  );
  const selectedInventoryAccount = useMemo(
    () =>
      inventoryAccounts.find(
        (account) => account.id === selectedInventoryAccountId,
      ),
    [inventoryAccounts, selectedInventoryAccountId],
  );
  const loadOptions = async () => {
    setLoadingOptions(true);
    try {
      const [brandRes, categoryRes, unitRes, accountRes] = await Promise.all([
        brandService.options(),
        categoryService.options(),
        unitService.options(),
        accountService.list(),
      ]);
      setBrands(brandRes || []);
      setCategories(categoryRes || []);
      setUnits(unitRes || []);
      setInventoryAccounts(
        getPostableInventoryAccounts(flattenAccountTree(accountRes || [])),
      );
    } catch {
      toast.error("Failed to load master dropdown data");
    } finally {
      setLoadingOptions(false);
    }
  };
  useEffect(() => {
    loadOptions();
  }, []);
  useEffect(() => {
    const sourceId = isEdit ? id : duplicateId;
    if (!sourceId) return;
    setLoadingRecord(true);
    rawMaterialService
      .getById(sourceId)
      .then((row) => {
        form.reset(mapRawMaterialToForm(row, { asCopy: isDuplicate }));
        if (row?.tenant_id) {
          setRecordTenantId(row.tenant_id);
          if (!isEdit) {
            setCreateDimensionIds([row.tenant_id]);
          }
        }
      })
      .catch(() =>
        toast.error(
          isDuplicate
            ? "Failed to load raw material to duplicate"
            : "Failed to load raw material",
        ),
      )
      .finally(() => setLoadingRecord(false));
  }, [isEdit, isDuplicate, id, duplicateId, form, toast]);
  useEffect(() => {
    if (!selectedCategoryId) {
      form.setValue("inventory_account", "", {
        shouldValidate: true,
        shouldDirty: true,
      });
      return;
    }
    const category = categoryMap[selectedCategoryId];
    const inheritedInventoryAccount = category?.inventory_account || "";
    form.setValue("inventory_account", inheritedInventoryAccount, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }, [categoryMap, form, selectedCategoryId]);
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (isEdit) {
        if (!recordTenantId) {
          toast.error("Select a dimension for this raw material.");
          return;
        }
        await rawMaterialService.update(
          id,
          { ...values, tenant_id: recordTenantId },
          recordTenantId,
        );
        toast.success("Raw material updated");
      } else {
        if (!createDimensionIds.length) {
          toast.error("Select at least one dimension to create this raw material in.");
          return;
        }
        const result = await rawMaterialService.create(values, createDimensionIds);
        toast.success(result?.message || "Raw material created");
      }
      navigate("/raw-materials");
    } catch (submitError) {
      const parsed = parseApiError(submitError);
      if (parsed.fieldErrors?.name) {
        form.setError("name", {
          type: "server",
          message: parsed.fieldErrors.name,
        });
      }
      toast.error(parsed.message || "Save failed");
    }
  });
  return (
    <section className="space-y-6">
      {" "}
      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(240,248,255,0.96))] dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.95),rgba(15,23,42,0.98))]">
        {" "}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {" "}
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              {isEdit
                ? "Edit Raw Material"
                : isDuplicate
                  ? "Duplicate Raw Material"
                  : "Create Raw Material"}
            </h2>
            {isDuplicate ? (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Fields are copied from the selected raw material. The name is
                set to a copy so you can save it, then change anything you need.
              </p>
            ) : null}
          </div>{" "}
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/raw-materials")}
          >
            {" "}
            Back to Raw Materials{" "}
          </Button>{" "}
        </div>{" "}
      </Card>{" "}
      <Card>
        {" "}
        {loadingRecord ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Loading…
          </div>
        ) : (
          <form className="grid gap-4 xl:grid-cols-3" onSubmit={onSubmit}>
            <DimensionCreateSelector
              selectedIds={
                isEdit ? [recordTenantId].filter(Boolean) : createDimensionIds
              }
              allowAll={!isEdit}
              label={isEdit ? "Dimension" : undefined}
              hint={
                isEdit
                  ? "This raw material is saved in the selected company."
                  : undefined
              }
              onChange={(nextIds) => {
                if (isEdit) {
                  const nextTenantId = nextIds[0] || "";
                  if (nextTenantId) setRecordTenantId(nextTenantId);
                  return;
                }
                setCreateDimensionIds(nextIds);
              }}
            />
            <FormInput
              label="Raw Material Name"
              required
              placeholder="Enter material name"
              error={form.formState.errors.name?.message}
              {...form.register("name")}
            />{" "}
            <SearchableSelect
              label="Brand"
              required
              value={selectedBrandId}
              options={brands}
              onChange={(brand) =>
                form.setValue("brand", brand, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              getOptionLabel={(item) => item.name}
              placeholder="Search brand…"
              disabled={loadingOptions}
              showAllOptions
            />
            <SearchableSelect
              label="Category"
              required
              value={selectedCategoryId}
              options={categories}
              onChange={(category) =>
                form.setValue("category", category, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              getOptionLabel={(item) => item.name}
              placeholder="Search category…"
              disabled={loadingOptions}
              showAllOptions
            />
            <SearchableSelect
              label="Purchase Unit"
              required
              value={selectedUnitId}
              options={units}
              onChange={(purchaseUnit) =>
                form.setValue("purchase_unit", purchaseUnit, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              getOptionLabel={(item) => item.name}
              placeholder="Search purchase unit…"
              disabled={loadingOptions}
              showAllOptions
            />
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                {" "}
                Inventory Account{" "}
              </label>{" "}
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
                value={
                  selectedInventoryAccount
                    ? formatAccountLabel(selectedInventoryAccount)
                    : ""
                }
                readOnly
                placeholder="Auto selected from category"
              />{" "}
              <input type="hidden" {...form.register("inventory_account")} />{" "}
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                This field is inherited automatically from the selected
                category.{" "}
              </p>{" "}
            </div>{" "}
            <div>
              {" "}
              <FormInput
                label="Rate Per Purchase UOM"
                type="number"
                step="0.01"
                error={form.formState.errors.purchase_price?.message}
                {...form.register("purchase_price")}
              />{" "}
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Optional. Leave blank to keep default rate 0.
              </p>{" "}
            </div>{" "}
            <div className="flex flex-col gap-3 sm:flex-row xl:col-span-3">
              {" "}
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={loadingOptions}
              >
                {" "}
                {isEdit ? "Update" : "Create"}{" "}
              </Button>{" "}
            </div>{" "}
          </form>
        )}{" "}
      </Card>{" "}
    </section>
  );
};
export default CreateUpdateRawMaterial;
