import { z } from "zod";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import productService from "../../../api/services/productService";
import rawMaterialService from "../../../api/services/rawMaterialService";
import accountService from "../../../api/services/accountService";
import unitService from "../../../api/services/unitService";
import { formatDecimal } from "../../../utils/format";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";
import DimensionCreateSelector from "../../../components/ui/DimensionCreateSelector";
import {
  flattenAccountTree,
  formatAccountLabel,
  getPostableInventoryAccounts,
  getSelectablePostingAccounts,
} from "../../../utils/accounts";
const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  sku: z.string().trim().optional(),
  productType: z.enum(["ASSEMBLY_PRODUCT", "FINISHED_GOOD"]),
  mouldingCharges: z.coerce.number().min(0),
  labourCharges: z.coerce.number().min(0),
  packagingCharges: z.coerce.number().min(0),
  directPrice: z.coerce.number().min(0),
  useCalculatedCost: z.boolean(),
  confirmedUnitCost: z.coerce.number().min(0),
  unit: z.union([z.string().uuid("Unit must be a valid UUID"), z.literal("")]),
  inventory_account: z.union([
    z.string().uuid("Inventory account must be a valid UUID"),
    z.literal(""),
  ]),
  cogs_account: z.union([
    z.string().uuid("COGS account must be a valid UUID"),
    z.literal(""),
  ]),
  revenue_account: z.union([
    z.string().uuid("Revenue account must be a valid UUID"),
    z.literal(""),
  ]),
});
const defaultValues = {
  name: "",
  sku: "",
  productType: "FINISHED_GOOD",
  mouldingCharges: 0,
  labourCharges: 0,
  packagingCharges: 0,
  directPrice: 0,
  useCalculatedCost: true,
  confirmedUnitCost: 0,
  unit: "",
  inventory_account: "",
  cogs_account: "",
  revenue_account: "",
};
const selectClassName =
  "w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40";
const getRawMaterialOptionLabel = (option) => {
  const brandName = option?.brand_name || option?.brand?.name;
  return brandName ? `${option.name} - ${brandName}` : option.name;
};
const emptyMaterialRow = {
  component_type: "RAW_MATERIAL",
  raw_material_id: "",
  component_product_id: "",
  uom_id: "",
  quantity: 1,
  rate: 0,
};
const isProductComponentType = (componentType) =>
  componentType === "FINISHED_GOOD" || componentType === "ASSEMBLY_PRODUCT";
const getComponentTypeLabel = (componentType) => {
  if (componentType === "RAW_MATERIAL") return "Raw Material";
  if (componentType === "FINISHED_GOOD") return "Finished Good";
  if (componentType === "ASSEMBLY_PRODUCT") return "Assembly Product";
  return "Component";
};
const getComponentSelectLabel = (componentType) => {
  if (componentType === "RAW_MATERIAL") return "raw material";
  if (componentType === "FINISHED_GOOD") return "finished good";
  if (componentType === "ASSEMBLY_PRODUCT") return "assembly product";
  return "component";
};
const mapProductToForm = (product) => ({
  name: product.name,
  sku: product.sku || "",
  productType:
    product.product_type === "MANUFACTURED"
      ? "ASSEMBLY_PRODUCT"
      : product.product_type === "READY_MADE"
        ? "FINISHED_GOOD"
        : product.product_type,
  mouldingCharges: Number(product.moulding_charges || 0),
  labourCharges: Number(product.labour_charges || 0),
  packagingCharges: Number(product.packaging_cost || 0),
  directPrice: Number(product.direct_price || 0),
  useCalculatedCost: product.use_calculated_cost ?? true,
  confirmedUnitCost: Number(product.confirmed_unit_cost || 0),
  unit: product.unit || "",
  inventory_account: product.inventory_account || "",
  cogs_account: product.cogs_account || "",
  revenue_account: product.revenue_account || "",
});
const mapProductMaterials = (product) =>
  product.materials?.length
    ? product.materials.map((material) => ({
        component_type: material.component_type || "RAW_MATERIAL",
        raw_material_id: material.raw_material_id,
        component_product_id: material.component_product_id || "",
        uom_id: material.uom_id || "",
        quantity: Number(material.quantity),
        rate: Number(material.rate),
      }))
    : [
        emptyMaterialRow,
      ];

const extractSubmitErrorMessage = (error) => {
  const data = error?.response?.data;
  if (!data) return error?.message || "Save failed";
  if (typeof data === "string") return data;
  if (data.message) return data.message;
  if (data.detail) return data.detail;
  const fieldEntry = Object.entries(data).find(
    ([, value]) => typeof value === "string" || Array.isArray(value),
  );
  if (!fieldEntry) return "Save failed";
  const [, value] = fieldEntry;
  return Array.isArray(value) ? value.join(", ") : value;
};

const CreateUpdateProduct = () => {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { tenantId, createTenantIds } = useAuth();
  const [createDimensionIds, setCreateDimensionIds] = useState(() =>
    createTenantIds?.length ? [...createTenantIds] : tenantId ? [tenantId] : [],
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSetupOptions, setLoadingSetupOptions] = useState(false);
  const [loadingAccountOptions, setLoadingAccountOptions] = useState(false);
  const [loadingComponentOptions, setLoadingComponentOptions] = useState(false);
  const [rawMaterialOptions, setRawMaterialOptions] = useState([]);
  const [unitOptions, setUnitOptions] = useState([]);
  const [inventoryAccounts, setInventoryAccounts] = useState([]);
  const [cogsAccounts, setCogsAccounts] = useState([]);
  const [revenueAccounts, setRevenueAccounts] = useState([]);
  const [finishedGoodOptions, setFinishedGoodOptions] = useState([]);
  const [assemblyProductOptions, setAssemblyProductOptions] = useState([]);
  const [materialRows, setMaterialRows] = useState([emptyMaterialRow]);
  const form = useForm({ resolver: zodResolver(schema), defaultValues });
  const productType = form.watch("productType");
  const useCalculatedCost = form.watch("useCalculatedCost");
  const componentTenantId = isEditing
    ? tenantId
    : createDimensionIds.length === 1
      ? createDimensionIds[0]
      : "";
  const accountTenantId = componentTenantId;

  const loadProductSetupOptions = useCallback(async () => {
    const [unitRes] = await Promise.all([
      unitService.list({ page: 1, limit: 100, search: "" }),
    ]);

    setUnitOptions(unitRes.data || []);
  }, []);

  const loadAccountOptions = useCallback(async (selectedTenantId) => {
    if (!selectedTenantId) {
      setInventoryAccounts([]);
      setCogsAccounts([]);
      setRevenueAccounts([]);
      return;
    }

    const accountRes = await accountService.list(undefined, selectedTenantId);
    const flatAccounts = flattenAccountTree(accountRes || []);

    setInventoryAccounts(getPostableInventoryAccounts(flatAccounts));
    setCogsAccounts(
      getSelectablePostingAccounts(flatAccounts, "COGS"),
    );
    setRevenueAccounts(
      getSelectablePostingAccounts(flatAccounts, "REVENUE"),
    );
  }, []);

  const loadComponentOptions = useCallback(
    async (selectedTenantId) => {
      if (!selectedTenantId) {
        setRawMaterialOptions([]);
        setFinishedGoodOptions([]);
        setAssemblyProductOptions([]);
        return;
      }

      const [rawMaterialRes, productOptionsRes] = await Promise.all([
        rawMaterialService.list(
          { page: 1, limit: 100, search: "" },
          selectedTenantId,
        ),
        productService.list(
          { page: 1, limit: 100, search: "" },
          selectedTenantId,
        ),
      ]);

      setRawMaterialOptions(rawMaterialRes.data || []);
      const otherProducts = (productOptionsRes.data || []).filter(
        (item) => String(item.id) !== String(id),
      );
      setFinishedGoodOptions(
        otherProducts.filter(
          (item) =>
            item.product_type === "FINISHED_GOOD" ||
            item.product_type === "READY_MADE",
        ),
      );
      setAssemblyProductOptions(
        otherProducts.filter(
          (item) =>
            item.product_type === "ASSEMBLY_PRODUCT" ||
            item.product_type === "MANUFACTURED",
        ),
      );
    },
    [id],
  );

  const refreshAccountOptions = useCallback(async () => {
    setLoadingAccountOptions(true);
    try {
      await loadAccountOptions(accountTenantId);
    } catch (refreshError) {
      toast.error(
        refreshError?.response?.data?.message ||
          "Failed to load account options for selected dimension",
      );
    } finally {
      setLoadingAccountOptions(false);
    }
  }, [accountTenantId, loadAccountOptions, toast]);

  const refreshComponentOptions = useCallback(async () => {
    setLoadingComponentOptions(true);
    try {
      await loadComponentOptions(componentTenantId);
    } catch (loadError) {
      toast.error(
        loadError?.response?.data?.message ||
          "Failed to load component options for selected dimension",
      );
    } finally {
      setLoadingComponentOptions(false);
    }
  }, [componentTenantId, loadComponentOptions, toast]);

  useEffect(() => {
    const loadSetup = async () => {
      setLoading(true);
      setLoadingSetupOptions(true);
      try {
        const [, product] = await Promise.all([
          loadProductSetupOptions(),
          isEditing ? productService.getById(id) : Promise.resolve(null),
        ]);
        if (product) {
          form.reset(mapProductToForm(product));
          setMaterialRows(mapProductMaterials(product));
        }
      } catch (loadError) {
        toast.error(
          loadError?.response?.data?.message || "Failed to load product form",
        );
      } finally {
        setLoadingSetupOptions(false);
        setLoading(false);
      }
    };
    loadSetup();
  }, [form, id, isEditing, loadProductSetupOptions, toast]);

  useEffect(() => {
    refreshComponentOptions();
  }, [refreshComponentOptions]);

  useEffect(() => {
    refreshAccountOptions();
  }, [refreshAccountOptions]);

  const refreshSelectOptionsProps = {};
  const refreshAccountOptionsProps = {};
  const refreshComponentOptionsProps = {};
  const getComponentOptionsForRow = (componentType) => {
    if (componentType === "RAW_MATERIAL") return rawMaterialOptions;
    if (componentType === "FINISHED_GOOD") return finishedGoodOptions;
    if (componentType === "ASSEMBLY_PRODUCT") return assemblyProductOptions;
    return [];
  };
  const selectedComponentKeys = materialRows
    .map((row) =>
      row.component_type === "RAW_MATERIAL"
        ? `RAW_MATERIAL:${row.raw_material_id}`
        : `${row.component_type}:${row.component_product_id}`,
    )
    .filter((key) => !key.endsWith(":"));
  const materialCost = materialRows.reduce(
    (sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.rate) || 0),
    0,
  );
  const autoAssemblyCost =
    materialCost +
    (Number(form.watch("mouldingCharges")) || 0) +
    (Number(form.watch("labourCharges")) || 0) +
    (Number(form.watch("packagingCharges")) || 0);
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      setSaving(true);
      const sanitizedRows = materialRows
        .filter((row) =>
          row.component_type === "RAW_MATERIAL"
            ? row.raw_material_id
            : row.component_product_id,
        )
        .map((row) => ({
          component_type: row.component_type,
          raw_material_id:
            row.component_type === "RAW_MATERIAL" ? row.raw_material_id : null,
          component_product_id: isProductComponentType(row.component_type)
            ? row.component_product_id
            : null,
          uom_id: row.uom_id || null,
          quantity: Number(row.quantity),
          rate: Number(row.rate),
        }));
      if (
        values.productType === "ASSEMBLY_PRODUCT" &&
        sanitizedRows.length === 0
      ) {
        toast.error(
          "Assembly product must include at least one component line.",
        );
        return;
      }
      if (
        !isEditing &&
        values.productType === "ASSEMBLY_PRODUCT" &&
        createDimensionIds.length !== 1
      ) {
        toast.error(
          "Select one dimension for assembly products so component materials match the product dimension.",
        );
        return;
      }
      const payload = {
        name: values.name,
        sku: values.sku?.trim() || "",
        product_type: values.productType,
        moulding_charges: values.mouldingCharges,
        labour_charges: values.labourCharges,
        packaging_cost: values.packagingCharges,
        direct_price: values.directPrice,
        use_calculated_cost: values.useCalculatedCost,
        confirmed_unit_cost: values.confirmedUnitCost,
        unit: values.unit || null,
        inventory_account: values.inventory_account || null,
        cogs_account: values.cogs_account || null,
        revenue_account: values.revenue_account || null,
        materials:
          values.productType === "ASSEMBLY_PRODUCT" ? sanitizedRows : [],
      };
      if (isEditing) {
        await productService.update(id, payload);
        toast.success("Product updated");
      } else {
        if (!createDimensionIds.length) {
          toast.error("Select at least one dimension to create this product in.");
          return;
        }
        const result = await productService.create(payload, createDimensionIds);
        toast.success(result?.message || "Product created");
      }
      navigate("/products");
    } catch (submitError) {
      toast.error(extractSubmitErrorMessage(submitError));
    } finally {
      setSaving(false);
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
            {" "}
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              {" "}
              {isEditing ? "Edit Product" : "Create Product"}{" "}
            </h2>{" "}
          </div>{" "}
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/products")}
          >
            {" "}
            Back to Products{" "}
          </Button>{" "}
        </div>{" "}
      </Card>{" "}
      <Card>
        {" "}
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Loading product form...
          </div>
        ) : (
          <form className="grid gap-4 xl:grid-cols-3" onSubmit={onSubmit}>
            {!isEditing && (
              <DimensionCreateSelector
                selectedIds={createDimensionIds}
                onChange={(nextIds) => {
                  setCreateDimensionIds(nextIds);
                  setMaterialRows([emptyMaterialRow]);
                  form.setValue("inventory_account", "", {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  form.setValue("cogs_account", "", {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  form.setValue("revenue_account", "", {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
              />
            )}
            <FormInput
              label="Product Name"
              required
              placeholder="Enter product name"
              error={form.formState.errors.name?.message}
              {...form.register("name")}
            />{" "}
            <FormInput
              label="SKU Number"
              placeholder="Auto generated, for example AME - 0001"
              error={form.formState.errors.sku?.message}
              {...form.register("sku")}
            />{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Product Type
              </label>{" "}
              <select
                className={selectClassName}
                {...form.register("productType")}
              >
                {" "}
                <option value="FINISHED_GOOD">Finished Good</option>{" "}
                <option value="ASSEMBLY_PRODUCT">Assembly Product</option>{" "}
              </select>{" "}
            </div>{" "}
            {productType === "FINISHED_GOOD" && (
              <FormInput
                label="Per Piece Price"
                required
                type="number"
                step="0.01"
                error={form.formState.errors.directPrice?.message}
                {...form.register("directPrice")}
              />
            )}{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Unit
              </label>{" "}
              <select
                className={selectClassName}
                {...form.register("unit")}
                {...refreshSelectOptionsProps}
                disabled={loadingSetupOptions}
              >
                {" "}
                <option value="">
                  {loadingSetupOptions ? "Loading units..." : "Select unit"}
                </option>{" "}
                {unitOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {" "}
                    {item.name}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
              {form.formState.errors.unit?.message ? (
                <p className="text-sm text-rose-500">
                  {form.formState.errors.unit.message}
                </p>
              ) : null}{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Inventory Account
              </label>{" "}
              <select
                className={selectClassName}
                {...form.register("inventory_account")}
                {...refreshAccountOptionsProps}
                disabled={loadingAccountOptions}
              >
                {" "}
                <option value="">
                  {loadingAccountOptions
                    ? "Loading inventory accounts..."
                    : "Select inventory account"}
                </option>{" "}
                {inventoryAccounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {" "}
                    {formatAccountLabel(item)}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                COGS Account
              </label>{" "}
              <select
                className={selectClassName}
                {...form.register("cogs_account")}
                {...refreshAccountOptionsProps}
                disabled={loadingAccountOptions}
              >
                {" "}
                <option value="">
                  {loadingAccountOptions
                    ? "Loading COGS accounts..."
                    : "Select COGS account"}
                </option>{" "}
                {cogsAccounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {" "}
                    {formatAccountLabel(item)}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Revenue Account
              </label>{" "}
              <select
                className={selectClassName}
                {...form.register("revenue_account")}
                {...refreshAccountOptionsProps}
                disabled={loadingAccountOptions}
              >
                {" "}
                <option value="">
                  {loadingAccountOptions
                    ? "Loading revenue accounts..."
                    : "Select revenue account"}
                </option>{" "}
                {revenueAccounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {" "}
                    {formatAccountLabel(item)}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <div className="rounded-[26px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60/80 dark:bg-slate-900/70 p-4 xl:col-span-3">
              {" "}
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {" "}
                <div>
                  {" "}
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Material Lines
                  </p>{" "}
                  <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {" "}
                    Server-side amount and net amount calculation stays
                    intact.{" "}
                  </p>{" "}
                </div>{" "}
                {productType === "ASSEMBLY_PRODUCT" && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setMaterialRows((prev) => [
                        ...prev,
                        {
                          component_type: "RAW_MATERIAL",
                          raw_material_id: "",
                          component_product_id: "",
                          uom_id: "",
                          quantity: 1,
                          rate: 0,
                        },
                      ])
                    }
                  >
                    {" "}
                    Add Line{" "}
                  </Button>
                )}{" "}
              </div>{" "}
              {productType === "FINISHED_GOOD" ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white dark:bg-slate-800/70 px-4 py-5 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  {" "}
                  Finished goods do not require component lines.{" "}
                </div>
              ) : (
                <div className="space-y-3">
                  {" "}
                  {materialRows.map((row, index) => {
                    const rowOptions = getComponentOptionsForRow(
                      row.component_type,
                    );
                    const selectedMaterial = rawMaterialOptions.find(
                      (material) => material.id === row.raw_material_id,
                    );
                    const selectedProduct = rowOptions.find(
                      (product) => product.id === row.component_product_id,
                    );
                    const selectedOption =
                      row.component_type === "RAW_MATERIAL"
                        ? selectedMaterial
                        : selectedProduct;
                    const currentComponentKey =
                      row.component_type === "RAW_MATERIAL"
                        ? `RAW_MATERIAL:${row.raw_material_id}`
                        : `${row.component_type}:${row.component_product_id}`;
                    return (
                      <div
                        key={index}
                        className="grid gap-3 rounded-2xl border border-white bg-white dark:bg-slate-800 p-4 shadow-sm md:grid-cols-[0.9fr_1.3fr_1fr_1fr_1fr_1fr_auto]"
                      >
                        {" "}
                        <div className="space-y-2">
                          {" "}
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Component Type
                          </label>{" "}
                          <select
                            className={selectClassName}
                            value={row.component_type}
                            onChange={(event) => {
                              const componentType = event.target.value;
                              setMaterialRows((prev) =>
                                prev.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        component_type: componentType,
                                        raw_material_id: "",
                                        component_product_id: "",
                                        uom_id: "",
                                        rate: 0,
                                      }
                                    : item,
                                ),
                              );
                            }}
                          >
                            {" "}
                            <option value="RAW_MATERIAL">
                              Raw Material
                            </option>{" "}
                            <option value="FINISHED_GOOD">Finished Good</option>{" "}
                            <option value="ASSEMBLY_PRODUCT">
                              Assembly Product
                            </option>{" "}
                          </select>{" "}
                        </div>{" "}
                        <div className="space-y-2">
                          {" "}
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {" "}
                            {getComponentTypeLabel(row.component_type)}{" "}
                          </label>{" "}
                          <select
                            className={selectClassName}
                            value={
                              row.component_type === "RAW_MATERIAL"
                                ? row.raw_material_id
                                : row.component_product_id
                            }
                            {...refreshComponentOptionsProps}
                            disabled={loadingComponentOptions}
                            onChange={(event) => {
                              const itemId = event.target.value;
                              const selected = rowOptions.find(
                                (item) => item.id === itemId,
                              );
                              setMaterialRows((prev) =>
                                prev.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        raw_material_id:
                                          row.component_type === "RAW_MATERIAL"
                                            ? itemId
                                            : "",
                                        component_product_id:
                                          isProductComponentType(
                                            row.component_type,
                                          )
                                            ? itemId
                                            : "",
                                        uom_id:
                                          selected?.unit ||
                                          selected?.purchase_unit ||
                                          item.uom_id ||
                                          "",
                                        rate: selected
                                          ? Number(
                                              isProductComponentType(
                                                row.component_type,
                                              )
                                                ? selected.net_amount
                                                : selected.purchase_price,
                                            )
                                          : 0,
                                      }
                                    : item,
                                ),
                              );
                            }}
                          >
                            {" "}
                            <option value="">
                              {loadingComponentOptions
                                ? "Loading options..."
                                : `Select ${getComponentSelectLabel(row.component_type)}`}
                            </option>{" "}
                            {rowOptions.map((option) => {
                              const optionKey = `${row.component_type}:${option.id}`;
                              return (
                                <option
                                  key={option.id}
                                  value={option.id}
                                  disabled={
                                    selectedComponentKeys.includes(optionKey) &&
                                    optionKey !== currentComponentKey
                                  }
                                >
                                  {" "}
                                  {row.component_type === "RAW_MATERIAL"
                                    ? getRawMaterialOptionLabel(option)
                                    : `${option.name} | Cost: ${formatDecimal(option.net_amount)}`}{" "}
                                </option>
                              );
                            })}{" "}
                          </select>{" "}
                        </div>{" "}
                        <div className="space-y-2">
                          {" "}
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            UOM
                          </label>{" "}
                          <select
                            className={selectClassName}
                            value={row.uom_id}
                            {...refreshSelectOptionsProps}
                            disabled={loadingSetupOptions}
                            onChange={(event) =>
                              setMaterialRows((prev) =>
                                prev.map((item, i) =>
                                  i === index
                                    ? { ...item, uom_id: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          >
                            {" "}
                            <option value="">
                              {loadingSetupOptions ? "Loading UOM..." : "Select UOM"}
                            </option>{" "}
                            {unitOptions.map((unit) => (
                              <option key={unit.id} value={unit.id}>
                                {" "}
                                {unit.name}{" "}
                              </option>
                            ))}{" "}
                          </select>{" "}
                        </div>{" "}
                        <div className="space-y-2">
                          {" "}
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Quantity (Units)
                          </label>{" "}
                          <input
                            type="number"
                            step="any"
                            min="0"
                            className={selectClassName}
                            placeholder="0.0000"
                            value={row.quantity}
                            onChange={(event) =>
                              setMaterialRows((prev) =>
                                prev.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        quantity: Number(
                                          event.target.value || 0,
                                        ),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />{" "}
                        </div>{" "}
                        <div className="space-y-2">
                          {" "}
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Rate
                          </label>{" "}
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className={selectClassName}
                            placeholder="0.00"
                            value={row.rate}
                            onChange={(event) =>
                              setMaterialRows((prev) =>
                                prev.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        rate: Number(event.target.value || 0),
                                      }
                                    : item,
                                ),
                              )
                            }
                          />{" "}
                          {selectedOption && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                              {" "}
                              {row.component_type === "RAW_MATERIAL"
                                ? `${getRawMaterialOptionLabel(selectedMaterial)} purchase price: ${selectedMaterial.purchase_price}`
                                : `${selectedProduct.name} unit cost: ${formatDecimal(selectedProduct.net_amount)}`}{" "}
                            </p>
                          )}{" "}
                        </div>{" "}
                        <div className="space-y-2">
                          {" "}
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                            Cost
                          </label>{" "}
                          <input
                            type="text"
                            readOnly
                            className="w-full cursor-not-allowed rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 outline-none"
                            value={formatDecimal(
                              (Number(row.quantity) || 0) *
                                (Number(row.rate) || 0),
                            )}
                          />{" "}
                        </div>{" "}
                        <Button
                          type="button"
                          variant="danger"
                          className="h-fit md:mt-[34px]"
                          onClick={() =>
                            setMaterialRows((prev) =>
                              prev.length === 1
                                ? [
                                    {
                                      component_type: "RAW_MATERIAL",
                                      raw_material_id: "",
                                      component_product_id: "",
                                      uom_id: "",
                                      quantity: 1,
                                      rate: 0,
                                    },
                                  ]
                                : prev.filter((_, i) => i !== index),
                            )
                          }
                        >
                          {" "}
                          Remove{" "}
                        </Button>{" "}
                      </div>
                    );
                  })}{" "}
                  <div className="mt-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40/70 p-4">
                    {" "}
                    <div className="grid gap-4 lg:grid-cols-[1.2fr_1.2fr_1.2fr_1fr] lg:items-start">
                      {" "}
                      <FormInput
                        label="Moulding Charges"
                        required
                        type="number"
                        step="0.01"
                        error={form.formState.errors.mouldingCharges?.message}
                        {...form.register("mouldingCharges")}
                      />{" "}
                      <FormInput
                        label="Labour Charges"
                        required
                        type="number"
                        step="0.01"
                        error={form.formState.errors.labourCharges?.message}
                        {...form.register("labourCharges")}
                      />{" "}
                      <FormInput
                        label="Packaging Charges"
                        required
                        type="number"
                        step="0.01"
                        error={form.formState.errors.packagingCharges?.message}
                        {...form.register("packagingCharges")}
                      />{" "}
                      <div className="rounded-2xl border border-emerald-300 bg-white dark:bg-slate-800/90 px-4 py-3">
                        {" "}
                        <label className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900">
                          {" "}
                          <input
                            type="checkbox"
                            {...form.register("useCalculatedCost")}
                          />{" "}
                          Use calculated cost{" "}
                        </label>{" "}
                        <p className="mt-2 text-xs text-emerald-800">
                          {" "}
                          Apply the BOM-based cost automatically for this
                          assembly product.{" "}
                        </p>{" "}
                      </div>{" "}
                    </div>{" "}
                    {!useCalculatedCost && (
                      <div className="mt-4 lg:max-w-sm">
                        {" "}
                        <FormInput
                          label="Confirmed Unit Cost"
                          required
                          type="number"
                          step="0.01"
                          error={
                            form.formState.errors.confirmedUnitCost?.message
                          }
                          {...form.register("confirmedUnitCost")}
                        />{" "}
                      </div>
                    )}{" "}
                    <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-emerald-300 bg-white dark:bg-slate-800 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
                      {" "}
                      <div>
                        {" "}
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                          {" "}
                          Final Calculated Amount{" "}
                        </p>{" "}
                        <p className="mt-1 text-2xl font-extrabold text-emerald-950">
                          {" "}
                          {formatDecimal(autoAssemblyCost)}{" "}
                        </p>{" "}
                      </div>{" "}
                      <p className="max-w-md text-sm text-emerald-900">
                        {" "}
                        This total combines component cost, moulding, labour,
                        and packaging for one unit.{" "}
                      </p>{" "}
                    </div>{" "}
                  </div>{" "}
                </div>
              )}{" "}
            </div>{" "}
            <div className="flex flex-col gap-3 sm:flex-row xl:col-span-3">
              {" "}
              <Button
                className="w-full sm:w-fit"
                type="submit"
                disabled={saving}
              >
                {" "}
                {saving ? "Saving..." : isEditing ? "Update" : "Create"}{" "}
              </Button>{" "}
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => navigate("/products")}
              >
                {" "}
                Cancel{" "}
              </Button>{" "}
            </div>{" "}
          </form>
        )}{" "}
      </Card>{" "}
    </section>
  );
};
export default CreateUpdateProduct;
