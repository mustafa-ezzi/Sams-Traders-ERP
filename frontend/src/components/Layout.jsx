    import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import Button from "./ui/Button";
import dimensionService from "../api/services/dimensionService";

/* ─────────────────────────────────────────────────────────────────
   SVG ICON PRIMITIVE
───────────────────────────────────────────────────────────────── */
const Icon = ({ children, className = "" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

/* ─────────────────────────────────────────────────────────────────
   ICONS
───────────────────────────────────────────────────────────────── */
const icons = {
  dashboard: (
    <Icon className="h-4 w-4">
      <path d="M3 13.5 12 4l9 9.5" />
      <path d="M5 11.5V20h14v-8.5" />
    </Icon>
  ),
  raw: (
    <Icon className="h-4 w-4">
      <path d="M5 12h14" />
      <path d="M7 7h10v10H7z" />
    </Icon>
  ),
  products: (
    <Icon className="h-4 w-4">
      <path d="M4 7.5 12 3l8 4.5-8 4.5L4 7.5Z" />
      <path d="M4 7.5V16.5L12 21l8-4.5V7.5" />
      <path d="M12 12v9" />
    </Icon>
  ),
  warehouse: (
    <Icon className="h-4 w-4">
      <path d="M3 21h18" />
      <path d="M5 21V8l7-4 7 4v13" />
      <path d="M9 21v-6h6v6" />
    </Icon>
  ),
  stock: (
    <Icon className="h-4 w-4">
      <path d="M12 3v18" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 21h14" />
    </Icon>
  ),
  masters: (
    <Icon className="h-4 w-4">
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
      <path d="M4 7l8 4 8-4" />
      <path d="M12 11v10" />
    </Icon>
  ),
  parties: (
    <Icon className="h-4 w-4">
      <path d="M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M20 8v6" />
      <path d="M17 11h6" />
    </Icon>
  ),
  accounts: (
    <Icon className="h-4 w-4">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
      <circle cx="7" cy="6" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="17" cy="18" r="1.2" />
    </Icon>
  ),
  reports: (
    <Icon className="h-4 w-4">
      <path d="M5 19V5" />
      <path d="M10 19V9" />
      <path d="M15 19v-6" />
      <path d="M20 19V7" />
    </Icon>
  ),
  users: (
    <Icon className="h-4 w-4">
      <path d="M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M20 8v6" />
      <path d="M17 11h6" />
    </Icon>
  ),
  support: (
    <Icon className="h-4 w-4">
      <path d="M21 11.5a8.5 8.5 0 1 1-3.45-6.85" />
      <path d="M9 9h.01M12 9h.01M15 9h.01" />
      <path d="M8 14h8" />
    </Icon>
  ),
  chevron: (
    <Icon className="h-3 w-3">
      <path d="m9 18 6-6-6-6" />
    </Icon>
  ),
  menu: (
    <Icon className="h-4 w-4">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  ),
  close: (
    <Icon className="h-4 w-4">
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  ),
  sun: (
    <Icon className="h-4 w-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </Icon>
  ),
  moon: (
    <Icon className="h-4 w-4">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Icon>
  ),
  bell: (
    <Icon className="h-4 w-4">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Icon>
  ),
  check: (
    <svg
      className="h-2.5 w-2.5"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 6l3 3 5-5" />
    </svg>
  ),
};

/* ─────────────────────────────────────────────────────────────────
   NAVIGATION CONFIG
───────────────────────────────────────────────────────────────── */
const navigation = [
  {
    title: "Purchase",
    id: "purchase",
    color: "from-blue-500 to-cyan-500",
    dot: "bg-blue-400",
    items: [
      {
        to: "/purchase-invoices",
        label: "Invoices",
        icon: icons.stock,
        perm: "purchase_invoices",
      },
      {
        to: "/purchase-returns",
        label: "Returns",
        icon: icons.stock,
        perm: "purchase_returns",
      },
      {
        to: "/opening-stock",
        label: "Opening Stock",
        icon: icons.stock,
        perm: "opening_stock",
      },
      {
        to: "/suppliers",
        label: "Suppliers",
        icon: icons.parties,
        perm: "suppliers",
      },
    ],
  },
  {
    title: "Sales",
    id: "sales",
    color: "from-emerald-500 to-teal-500",
    dot: "bg-emerald-400",
    items: [
      {
        to: "/sales-invoices",
        label: "Invoices",
        icon: icons.stock,
        perm: "sales_invoices",
      },
      {
        to: "/sales-returns",
        label: "Returns",
        icon: icons.stock,
        perm: "sales_returns",
      },
      {
        to: "/customers",
        label: "Customers",
        icon: icons.parties,
        perm: "customers",
      },
      {
        to: "/salesmen",
        label: "Salesmen",
        icon: icons.parties,
        perm: "salesmen",
      },
    ],
  },
  {
    title: "Bank",
    id: "bank",
    color: "from-violet-500 to-purple-500",
    dot: "bg-violet-400",
    items: [
      {
        to: "/purchase-bank-payments",
        label: "Bank Payments",
        icon: icons.accounts,
        perm: "purchase_bank_payments",
      },
      {
        to: "/sales-bank-receipts",
        label: "Bank Receipts",
        icon: icons.accounts,
        perm: "sales_bank_receipts",
      },
      {
        to: "/expenses",
        label: "Expenses",
        icon: icons.accounts,
        perm: "expenses",
      },
    ],
  },
  {
    title: "Reports",
    id: "reports",
    color: "from-amber-500 to-orange-500",
    dot: "bg-amber-400",
    items: [
      {
        to: "/reports/balance-sheet",
        label: "Balance Sheet",
        icon: icons.reports,
        perm: "reports_balance_sheet",
      },
      {
        to: "/reports/profit-loss",
        label: "Profit & Loss",
        icon: icons.reports,
        perm: "reports_profit_loss",
      },
      {
        to: "/reports/ledger",
        label: "Ledger Reports",
        icon: icons.reports,
        perm: "reports_ledger",
      },
      {
        to: "/reports/party-ledger",
        label: "Party Ledger",
        icon: icons.reports,
        perm: "reports_party_ledger",
      },
      {
        to: "/reports/coa-completeness",
        label: "COA Completeness",
        icon: icons.reports,
        perm: "reports_coa_completeness",
      },
    ],
  },
  {
    title: "Admin",
    id: "administrator",
    color: "from-rose-500 to-pink-500",
    dot: "bg-rose-400",
    items: [
      {
        to: "/masters/units",
        label: "Units",
        icon: icons.masters,
        perm: "masters_units",
      },
      {
        to: "/masters/brands",
        label: "Brands",
        icon: icons.masters,
        perm: "masters_brands",
      },
      {
        to: "/masters/categories",
        label: "Categories",
        icon: icons.masters,
        perm: "masters_categories",
      },
      {
        to: "/warehouses",
        label: "Warehouses",
        icon: icons.warehouse,
        perm: "warehouses",
      },
      {
        to: "/raw-materials",
        label: "Raw Materials",
        icon: icons.raw,
        perm: "raw_materials",
      },
      {
        to: "/products",
        label: "Products",
        icon: icons.products,
        perm: "products",
      },
      {
        to: "/production",
        label: "Assembly Process",
        icon: icons.products,
        perm: "production",
      },
      {
        to: "/accounts",
        label: "Chart Of Accounts",
        icon: icons.accounts,
        perm: "accounts",
      },
      {
        to: "/settings/staff",
        label: "Staff access",
        icon: icons.users,
        orgAdminOnly: true,
      },
    ],
  },
  {
    title: "Users",
    id: "users",
    color: "from-slate-500 to-slate-400",
    dot: "bg-slate-400",
    items: [
      {
        to: "/users/configure",
        label: "Configure",
        icon: icons.users,
        perm: "dimensions",
      },
      {
        to: "/support",
        label: "Support",
        icon: icons.support,
        perm: "support",
      },
    ],
  },
];

const pageTitles = {
  "/": { title: "Dashboard", eyebrow: "Overview" },
  "/raw-materials": { title: "Raw Materials", eyebrow: "Inventory" },
  "/raw-materials/create": { title: "Create Raw Material", eyebrow: "Inventory" },
  "/products": { title: "Products", eyebrow: "Inventory" },
  "/products/create": { title: "Create Product", eyebrow: "Inventory" },
  "/accounts": { title: "Chart of Accounts", eyebrow: "Accounting" },
  "/accounts/create": { title: "Create Account", eyebrow: "Accounting" },
  "/users/configure": { title: "Company Configure", eyebrow: "Users" },
  "/users/configure/create": { title: "Create Company", eyebrow: "Users" },
  "/reports/balance-sheet": { title: "Balance Sheet", eyebrow: "Reports" },
  "/reports/profit-loss": { title: "Profit & Loss", eyebrow: "Reports" },
  "/reports/ledger": { title: "Ledger Reports", eyebrow: "Reports" },
  "/reports/party-ledger": { title: "Party Ledger", eyebrow: "Reports" },
  "/warehouses": { title: "Warehouses", eyebrow: "Inventory" },
  "/opening-stock": { title: "Opening Stock", eyebrow: "Inventory" },
  "/production": { title: "Assembly Process", eyebrow: "Inventory" },
  "/production/create": { title: "Create Assembly Process", eyebrow: "Inventory" },
  "/purchase-invoices": { title: "Purchase Invoices", eyebrow: "Purchase" },
  "/purchase-returns": { title: "Purchase Returns", eyebrow: "Purchase" },
  "/purchase-bank-payments": { title: "Bank Payments", eyebrow: "Bank" },
  "/expenses": { title: "Expenses", eyebrow: "Accounting" },
  "/sales-invoices": { title: "Sales Invoices", eyebrow: "Sales" },
  "/sales-returns": { title: "Sales Returns", eyebrow: "Sales" },
  "/sales-bank-receipts": { title: "Bank Receipts", eyebrow: "Bank" },
  "/masters/units": { title: "Units", eyebrow: "Masters" },
  "/masters/categories": { title: "Categories", eyebrow: "Masters" },
  "/masters/categories/create": { title: "Create Category", eyebrow: "Masters" },
  "/masters/brands": { title: "Brands", eyebrow: "Masters" },
  "/support": { title: "Support", eyebrow: "Users" },
  "/settings/staff": { title: "Staff access", eyebrow: "Admin" },
  "/reports/coa-completeness": {
    title: "COA Completeness",
    eyebrow: "Reports",
  },
};

/* ─────────────────────────────────────────────────────────────────
   NAV SECTION (collapsible)
───────────────────────────────────────────────────────────────── */
const NavSection = ({ section, onNavigate }) => {
  const { pathname } = useLocation();
  const isActiveSection = section.items.some((item) =>
    pathname.startsWith(item.to),
  );
  const [open, setOpen] = useState(isActiveSection);

  return (
    <div className="mb-0.5">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all hover:bg-white/[0.06]"
      >
        {/* Colored accent dot */}
        <span
          className={`h-1.5 w-1.5 rounded-full ${section.dot} opacity-70 group-hover:opacity-100 transition-opacity`}
        />
        <span className="flex-1 text-left text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 group-hover:text-slate-400 transition-colors">
          {section.title}
        </span>
        <span
          className={`text-slate-600 transition-transform duration-200 group-hover:text-slate-400 ${open ? "rotate-90" : ""}`}
        >
          {icons.chevron}
        </span>
      </button>

      {/* Items */}
      <div
        className="overflow-hidden transition-all duration-250"
        style={{ maxHeight: open ? "600px" : "0px", opacity: open ? 1 : 0 }}
      >
        <div className="ml-3 mt-0.5 space-y-px border-l border-white/[0.06] pl-3 pb-2">
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-all duration-150 ${
                  isActive
                    ? "bg-white/[0.1] text-white font-semibold"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200 font-medium"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`shrink-0 transition-colors ${
                      isActive
                        ? "text-blue-400"
                        : "text-slate-600 group-hover:text-slate-400"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                  {isActive && (
                    <span className="ml-auto h-1 w-1 rounded-full bg-blue-400 shrink-0" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────
   CHECKBOX PILL (Create-in control)
───────────────────────────────────────────────────────────────── */
const CheckPill = ({
  label,
  checked,
  onChange,
  disabled,
  isCurrent,
  isAll,
}) => (
  <label
    className={`inline-flex select-none items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide transition-all duration-150 ${
      disabled ? "cursor-default" : "cursor-pointer"
    } ${
      isAll && checked
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        : checked
          ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
    }`}
    title={`Show data for ${label}`}
  >
    <span
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-all duration-150 ${
        isAll && checked
          ? "border-emerald-500 bg-emerald-500"
          : checked
            ? "border-blue-500 bg-blue-500"
            : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800"
      }`}
    >
      {checked && icons.check}
    </span>
    <input
      type="checkbox"
      className="sr-only"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
    {label}
    {isCurrent && (
      <span className="ml-0.5 text-[9px] font-bold uppercase tracking-widest text-blue-400">
        •
      </span>
    )}
  </label>
);

/* ─────────────────────────────────────────────────────────────────
   MAIN LAYOUT
───────────────────────────────────────────────────────────────── */
const Layout = () => {
  const { pathname } = useLocation();
  const {
    tenantId,
    logout,
    allowedDimensions,
    createTenantIds,
    setCreateTenants,
    isTenantChild,
    uiPermissions,
    tenantRole,
  } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dimensions, setDimensions] = useState([]);
  const isOnboardingOnly = !isTenantChild && !allowedDimensions?.length;

  const perms = Array.isArray(uiPermissions) ? uiPermissions : [];

  const filteredNavigation = useMemo(() => {
    return navigation
      .map((section) => {
        if (isTenantChild && section.id === "users") return null;
        const items = section.items.filter((item) => {
          if (item.orgAdminOnly) return !isTenantChild;
          if (!isTenantChild) return true;
          return Boolean(item.perm && perms.includes(item.perm));
        });
        if (!items.length) return null;
        return { ...section, items };
      })
      .filter(Boolean);
  }, [isTenantChild, perms]);

  const showDashboardNav = !isTenantChild || perms.includes("dashboard");

  const pageMeta = useMemo(() => {
    if (pathname.startsWith("/raw-materials/") && pathname.endsWith("/edit")) {
      return { title: "Edit Raw Material", eyebrow: "Inventory" };
    }
    if (pathname.startsWith("/products/") && pathname.endsWith("/edit")) {
      return { title: "Edit Product", eyebrow: "Inventory" };
    }
    if (pathname.startsWith("/masters/categories/") && pathname.endsWith("/edit")) {
      return { title: "Edit Category", eyebrow: "Masters" };
    }
    if (pathname.startsWith("/production/") && pathname.endsWith("/edit")) {
      return { title: "Edit Production", eyebrow: "Inventory" };
    }
    if (pathname.startsWith("/accounts/") && pathname.endsWith("/edit")) {
      return { title: "Edit Account", eyebrow: "Accounting" };
    }
    return pageTitles[pathname] || { title: "Workspace", eyebrow: "ERP" };
  }, [pathname]);

  useEffect(() => {
    if (isOnboardingOnly) {
      setDimensions([]);
      return;
    }
    if (!localStorage.getItem("token")) return;
    dimensionService
      .list()
      .then((items) => setDimensions(items || []))
      .catch(() => setDimensions([]));
  }, [isOnboardingOnly]);

  useEffect(() => {
    if (isOnboardingOnly) return;
    const availableCodes = (
      dimensions.length ? dimensions : allowedDimensions || []
    ).map((i) => i.code);
    if (!availableCodes.length) return;
    const nextSelected = [
      ...new Set(
        (createTenantIds.length ? createTenantIds : [tenantId]).filter((c) =>
          availableCodes.includes(c),
        ),
      ),
    ];
    if (!nextSelected.length) nextSelected.push(availableCodes[0]);
    if (nextSelected.join("|") !== createTenantIds.join("|"))
      setCreateTenants(nextSelected);
  }, [
    allowedDimensions,
    createTenantIds,
    dimensions,
    isOnboardingOnly,
    setCreateTenants,
    tenantId,
  ]);

  const activeDimension = dimensions.find((i) => i.code === tenantId);
  const creationDimensions = dimensions.length
    ? dimensions
    : allowedDimensions || [];
  const creationCodes = creationDimensions.map((d) => d.code);
  const selectedCreateTenantIds = [
    ...new Set(
      (createTenantIds.length ? createTenantIds : [tenantId]).filter((c) =>
        creationCodes.includes(c),
      ),
    ),
  ];
  if (!selectedCreateTenantIds.length && creationCodes.length) {
    selectedCreateTenantIds.push(creationCodes[0]);
  }
  const allSelected =
    creationCodes.length > 0 &&
    creationCodes.every((c) => selectedCreateTenantIds.includes(c));
  const selectedDimensionNames = creationDimensions
    .filter((dimension) => selectedCreateTenantIds.includes(dimension.code))
    .map((dimension) => dimension.name || dimension.code);
  const selectionLabel =
    selectedDimensionNames.length === creationDimensions.length &&
    creationDimensions.length > 1
      ? "All Dimensions"
      : selectedDimensionNames.join(", ") || activeDimension?.name || tenantId;
  const outletKey = selectedCreateTenantIds.join("|") || tenantId;

  const setCreateDimensionChecked = (code, checked) => {
    const next = checked
      ? [...new Set([...selectedCreateTenantIds, code])]
      : selectedCreateTenantIds.filter((c) => c !== code);
    if (!next.length) return;
    setCreateTenants(next.filter((c) => creationCodes.includes(c)));
  };
  const setAllCreateDimensions = (checked) =>
    setCreateTenants(checked ? creationCodes : [selectedCreateTenantIds[0] || tenantId]);

  /* ── Sidebar inner content ── */
  const SidebarContent = () => (
    <div className="flex h-full flex-col gap-0">
      {/* ── Brand block ── */}
      <div className="px-4 pt-1 pb-5">
        <div className="flex items-center gap-3">
          <img
            src="/logo-side.png"
            alt="CoreLedger"
            className="h-10 w-10 shrink-0 rounded-xl object-contain shadow-lg shadow-blue-900/20"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-white leading-tight">
              {selectionLabel}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-[10px] text-slate-500 tracking-wide">
                CoreLedger
              </p>
              {!isTenantChild ? (
                <span className="inline-flex shrink-0 rounded-md bg-amber-500/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200 ring-1 ring-amber-400/25">
                  Admin
                </span>
              ) : (
                <span
                  className="inline-flex max-w-[9.5rem] truncate rounded-md bg-white/[0.08] px-2 py-0.5 text-[9px] font-semibold tracking-wide text-slate-300 ring-1 ring-white/10"
                  title={(tenantRole || "Staff").trim() || "Staff"}
                >
                  {(tenantRole || "Staff").trim() || "Staff"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-4 h-px bg-gradient-to-r from-white/0 via-white/[0.08] to-white/0" />

      {/* ── Dashboard link ── */}
      <div className="mt-3 px-2">
        {isOnboardingOnly ? (
          <NavLink
            to="/users/configure/create"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all ${
                isActive
                  ? "bg-white/[0.1] text-white"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
              }`
            }
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-300">
              {icons.users}
            </span>
            Create Company
          </NavLink>
        ) : showDashboardNav ? (
          <NavLink
            to="/"
            end
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all ${
                isActive
                  ? "bg-white/[0.1] text-white"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isActive ? "bg-blue-500/20 text-blue-300" : "text-slate-500"
                  }`}
                >
                  {icons.dashboard}
                </span>
                <span>Dashboard</span>
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />
                )}
              </>
            )}
          </NavLink>
        ) : null}
      </div>

      {/* ── Nav sections ── */}
      {!isOnboardingOnly && (
        <nav className="mt-3 flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
          {filteredNavigation.map((section) => (
            <NavSection
              key={section.id}
              section={section}
              onNavigate={() => setMobileOpen(false)}
            />
          ))}
        </nav>
      )}

      {/* ── Footer ── */}
      <div className="mt-auto px-3 pb-4 pt-3">
        <div className="mx-1 mb-3 h-px bg-gradient-to-r from-white/0 via-white/[0.07] to-white/0" />
        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2 text-[13px] font-semibold text-slate-400 transition-all hover:bg-white/[0.08] hover:text-slate-200"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  );

  /* ── Initials from tenant or user ── */
  const initials = (selectionLabel || tenantId || "?")
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#f4f6f9] dark:bg-slate-950">
      {/* ═══════════════════════════════════════════
          SIDEBAR
      ═══════════════════════════════════════════ */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[220px] transform transition-transform duration-300 ease-out lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Glass-dark sidebar surface */}
        <div className="flex h-full flex-col bg-[#0d1424] border-r border-white/[0.05]">
          {/* Close button — mobile only */}
          <div className="absolute right-3 top-3 lg:hidden">
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              {icons.close}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pt-4">
            <SidebarContent />
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ═══════════════════════════════════════════
          MAIN AREA
      ═══════════════════════════════════════════ */}
      <div className="lg:pl-[220px]">
        {/* ── TOP BAR ── */}
        <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/80 shadow-[0_1px_0_0_rgba(0,0,0,0.04)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/85 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)]">
          {/* Primary row */}
          <div className="flex items-center gap-3 px-4 py-2.5 lg:px-6">
            {/* Hamburger — mobile */}
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              {icons.menu}
            </button>

            {/* Page identity */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-500">
                  {pageMeta.eyebrow}
                </span>
                <span className="text-slate-300 text-xs">·</span>
                <h1 className="truncate text-[15px] font-bold text-slate-800 dark:text-slate-100">
                  {pageMeta.title}
                </h1>
              </div>
            </div>

            {/* Right actions */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={
                  isDark ? "Switch to light mode" : "Switch to dark mode"
                }
                title={isDark ? "Light mode" : "Dark mode"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {isDark ? icons.sun : icons.moon}
              </button>

              {/* Avatar */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-[11px] font-bold text-white shadow-sm">
                {initials}
              </div>
            </div>
          </div>

          {/* ── View filter row (secondary) ── */}
          {!isOnboardingOnly && creationDimensions.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-1.5 dark:border-slate-700 dark:bg-slate-900/50 lg:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                  View data for
                </span>

                {creationDimensions.length > 1 && (
                  <CheckPill
                    label="All"
                    checked={allSelected}
                    onChange={(e) => setAllCreateDimensions(e.target.checked)}
                    isAll
                  />
                )}

                {creationDimensions.map((dimension) => {
                  const checked = selectedCreateTenantIds.includes(
                    dimension.code,
                  );
                  return (
                    <CheckPill
                      key={dimension.code}
                      label={dimension.name || dimension.code}
                      checked={checked}
                      onChange={(e) =>
                        setCreateDimensionChecked(
                          dimension.code,
                          e.target.checked,
                        )
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}
        </header>

        {/* ── Page content ── */}
        <main className="px-3 py-5 sm:px-5 lg:px-7 lg:py-6">
          <div className="mx-auto max-w-[1600px]">
            <Outlet key={outletKey} />
          </div>
        </main>

        <footer className="border-t border-slate-200/60 px-4 py-4 dark:border-slate-700/60 lg:px-6">
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} CoreLedger — a product of{" "}
            <a
              href="https://www.trisitesolutions.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-600 transition-colors hover:text-emerald-700 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              TrisiteSolutions
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Layout;
