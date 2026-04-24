import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Button from "./ui/Button";
import dimensionService from "../api/services/dimensionService";
// import { useLocation } from "react-router-dom";

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

const ChevronRight = ({ className = "" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const icons = {
  dashboard: (
    <Icon className="h-[15px] w-[15px]">
      <path d="M3 13.5 12 4l9 9.5" />
      <path d="M5 11.5V20h14v-8.5" />
    </Icon>
  ),
  raw: (
    <Icon className="h-[15px] w-[15px]">
      <path d="M5 12h14" />
      <path d="M7 7h10v10H7z" />
    </Icon>
  ),
  products: (
    <Icon className="h-[15px] w-[15px]">
      <path d="M4 7.5 12 3l8 4.5-8 4.5L4 7.5Z" />
      <path d="M4 7.5V16.5L12 21l8-4.5V7.5" />
      <path d="M12 12v9" />
    </Icon>
  ),
  warehouse: (
    <Icon className="h-[15px] w-[15px]">
      <path d="M3 21h18" />
      <path d="M5 21V8l7-4 7 4v13" />
      <path d="M9 21v-6h6v6" />
    </Icon>
  ),
  stock: (
    <Icon className="h-[15px] w-[15px]">
      <path d="M12 3v18" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 21h14" />
    </Icon>
  ),
  masters: (
    <Icon className="h-[15px] w-[15px]">
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
      <path d="M4 7l8 4 8-4" />
      <path d="M12 11v10" />
    </Icon>
  ),
  parties: (
    <Icon className="h-[15px] w-[15px]">
      <path d="M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M20 8v6" />
      <path d="M17 11h6" />
    </Icon>
  ),
  accounts: (
    <Icon className="h-[15px] w-[15px]">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
      <circle cx="7" cy="6" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="17" cy="18" r="1.2" />
    </Icon>
  ),
  reports: (
    <Icon className="h-[15px] w-[15px]">
      <path d="M5 19V5" />
      <path d="M10 19V9" />
      <path d="M15 19v-6" />
      <path d="M20 19V7" />
    </Icon>
  ),
  users: (
    <Icon className="h-[15px] w-[15px]">
      <path d="M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M20 8v6" />
      <path d="M17 11h6" />
    </Icon>
  ),
};

const navigation = [

  {
    title: "Purchase",
    id: "purchase",
    items: [
      { to: "/purchase-invoices", label: "Invoices", icon: icons.stock },
      { to: "/purchase-returns", label: "Returns", icon: icons.stock },
      { to: "/opening-stock", label: "Opening Stock", icon: icons.stock },
    ],
  },
  {
    title: "Sales",
    id: "sales",
    items: [
      { to: "/sales-invoices", label: "Invoices", icon: icons.stock },
      { to: "/sales-returns", label: "Returns", icon: icons.stock },
    ],
  },
  {
    title: "Bank Transactions",
    id: "bank",
    items: [
      { to: "/purchase-bank-payments", label: "Bank Payments", icon: icons.stock },
      { to: "/sales-bank-receipts", label: "Bank Receipts", icon: icons.stock },
      { to: "/expenses", label: "Expenses", icon: icons.stock },
    ],
  },
  {
    title: "Reports",
    id: "reports",
    items: [
      { to: "/reports/ledger", label: "Ledger Reports", icon: icons.reports },
      { to: "/reports/party-ledger", label: "Party Ledger", icon: icons.reports },
      // { to: "/reports/coa-completeness", label: "COA Completeness", icon: icons.reports },
    ],
  },
  {
    title: "Administrator",
    id: "administrator",
    items: [
      { to: "/masters/sizes", label: "Sizes", icon: icons.masters },
      { to: "/masters/units", label: "Units", icon: icons.masters },
      { to: "/masters/brands", label: "Brands", icon: icons.masters },
      { to: "/masters/categories", label: "Categories", icon: icons.masters },
      { to: "/customers", label: "Customers", icon: icons.parties },
      { to: "/suppliers", label: "Suppliers", icon: icons.parties },
      { to: "/warehouses", label: "Warehouses", icon: icons.warehouse },
      { to: "/raw-materials", label: "Raw Materials", icon: icons.raw },
      { to: "/products", label: "Products", icon: icons.products },
      // { to: "/production", label: "production", icon: icons.products },

      { to: "/accounts", label: "Chart Of Accounts", icon: icons.accounts },
    ],
  },
  {
    title: "Users",
    id: "users",
    items: [
      { to: "/users/dimensions", label: "Dimensions", icon: icons.users },
    ],
  },
];

const pageTitles = {
  "/": { title: "Dashboard", eyebrow: "Overview" },
  "/raw-materials": { title: "Raw Materials", eyebrow: "Inventory" },
  "/products": { title: "Products", eyebrow: "Inventory" },
  "/accounts": { title: "Chart of Accounts", eyebrow: "Accounting" },
  "/users/dimensions": { title: "Dimensions", eyebrow: "Users" },
  "/reports/ledger": { title: "Ledger Reports", eyebrow: "Reports" },
  "/reports/party-ledger": { title: "Party Ledger", eyebrow: "Reports" },
  "/reports/coa-completeness": { title: "COA Completeness", eyebrow: "Reports" },
  "/warehouses": { title: "Warehouses", eyebrow: "Inventory" },
  "/opening-stock": { title: "Opening Stock", eyebrow: "Inventory" },
  "/production": { title: "Production", eyebrow: "Inventory" },
  "/purchase-invoices": { title: "Purchase Invoices", eyebrow: "Purchase" },
  "/purchase-returns": { title: "Purchase Returns", eyebrow: "Purchase" },
  "/purchase-bank-payments": { title: "Bank Payments", eyebrow: "Purchase" },
  "/expenses": { title: "Expenses", eyebrow: "Accounting" },
  "/sales-invoices": { title: "Sales Invoices", eyebrow: "Sales" },
  "/sales-returns": { title: "Sales Returns", eyebrow: "Sales" },
  "/sales-bank-receipts": { title: "Bank Receipts", eyebrow: "Sales" },
  "/customers": { title: "Customers", eyebrow: "Parties" },
  "/suppliers": { title: "Suppliers", eyebrow: "Parties" },
  "/masters/units": { title: "Units", eyebrow: "Masters" },
  "/masters/sizes": { title: "Sizes", eyebrow: "Masters" },
  "/masters/categories": { title: "Categories", eyebrow: "Masters" },
  "/masters/brands": { title: "Brands", eyebrow: "Masters" },
};

const NavSection = ({ section, onNavigate }) => {
  const { pathname } = useLocation();

  const isActiveSection = section.items.some(item =>
    pathname.startsWith(item.to)
  );

  const [open, setOpen] = useState(isActiveSection);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.05]"
      >
        <span className="text-[14px] font-semibold uppercase tracking-widest text-slate-500 transition-colors group-hover:text-slate-400">
          {section.title}
        </span>
        <ChevronRight
          className={`h-3 w-3 text-slate-600 transition-all duration-200 group-hover:text-slate-400 ${open ? "rotate-90" : ""
            }`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ${open ? "opacity-100" : "opacity-0"
          }`}
        style={{
          maxHeight: open ? "500px" : "0px", // can also calculate dynamically
        }}
      >
        <div className="mt-0.5 space-y-px pb-1">
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-lg px-1 py-1 text-sm transition-all ${isActive
                  ? "bg-white/[0.1] text-white"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors ${isActive
                      ? "bg-blue-500/20 text-blue-300"
                      : "text-slate-500 group-hover:text-slate-300"
                      }`}
                  >
                    {item.icon}
                  </span>
                  <span className="font-medium">{item.label}</span>
                  {isActive && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />
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

const Layout = () => {
  const { pathname } = useLocation();
  const { tenantId, setTenant, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dimensions, setDimensions] = useState([]);

  const pageMeta = useMemo(
    () => pageTitles[pathname] || { title: "Workspace", eyebrow: "ERP" },
    [pathname]
  );

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      return;
    }

    dimensionService
      .list()
      .then((items) => setDimensions(items || []))
      .catch(() => setDimensions([]));
  }, []);

  const activeDimension = dimensions.find((item) => item.code === tenantId);

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Brand / Dimension */}
      <div className="px-3 pb-5">
        <p className="text-[26px] font-semibold text-white/90">{activeDimension?.name || tenantId}</p>
        <p className="mt-0.5 text-[14px] text-slate-500">ERP Workspace</p>
      </div>

      <div className="h-px bg-white/[0.06]" />

      {/* Dashboard */}
      <div className="mt-4 px-0">
        <NavLink
          to="/"
          end
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${isActive
              ? "bg-white/[0.1] text-white"
              : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors ${isActive ? "bg-blue-500/20 text-blue-300" : "text-slate-500 group-hover:text-slate-300"
                  }`}
              >
                {icons.dashboard}
              </span>
              <span className="font-medium">Dashboard</span>
              {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />}
            </>
          )}
        </NavLink>
      </div>

      {/* Collapsible sections */}
      <nav className="mt-4 flex-1 space-y-0.5">
        {navigation.map((section) => (
          <NavSection
            key={section.id}
            section={section}
            onNavigate={() => setMobileOpen(false)}
          />
        ))}
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[240px] transform border-r border-white/[0.06] bg-[#0d1424] px-3 py-5 transition duration-300 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="mb-4 flex items-center justify-between px-3">
          {/* Logo slot — drop your SVG/wordmark here */}
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300 lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <Icon className="h-4 w-4">
              <path d="M6 6l12 12M18 6 6 18" />
            </Icon>
          </button>
        </div>

        <div className="h-[calc(100vh-56px)] overflow-y-auto">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="lg:pl-[240px]">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-7">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 lg:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <Icon className="h-4 w-4">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </Icon>
              </button>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-500">
                  {pageMeta.eyebrow}
                </p>
                <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                  {pageMeta.title}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                value={tenantId}
                onChange={(e) => {
                  const value = e.target.value;
                  setTenant(value);

                  // force full app reload
                  window.location.reload();
                }}
              >
                {(dimensions.length ? dimensions : [{ code: tenantId, name: tenantId }]).map((dimension) => (
                  <option key={dimension.code} value={dimension.code}>
                    {dimension.name}
                  </option>
                ))}
              </select>
              <Button variant="secondary" onClick={logout}>
                Logout
              </Button>
            </div>
          </div>
        </header>

        <main className="px-3 py-5 sm:px-5 lg:px-7 lg:py-7">
          <div className="mx-auto max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
