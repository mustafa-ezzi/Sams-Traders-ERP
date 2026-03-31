import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Button from "./ui/Button";

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
    strokeWidth="2"
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
};

const navigation = [
  {
    title: "Inventory Core",
    id: "inventory",
    defaultOpen: true,
    items: [
      { to: "/raw-materials", label: "Raw Materials", icon: icons.raw },
      { to: "/products", label: "Products", icon: icons.products },
      { to: "/warehouses", label: "Warehouses", icon: icons.warehouse },
      { to: "/opening-stock", label: "Opening Stock", icon: icons.stock },
    ],
  },
  {
    title: "Masters",
    id: "masters",
    defaultOpen: true,
    items: [
      { to: "/masters/units", label: "Units", icon: icons.masters },
      { to: "/masters/sizes", label: "Sizes", icon: icons.masters },
      { to: "/masters/categories", label: "Categories", icon: icons.masters },
      { to: "/masters/brands", label: "Brands", icon: icons.masters },
    ],
  },
];

const pageTitles = {
  "/": { title: "Dashboard", eyebrow: "ERP Overview" },
  "/raw-materials": { title: "Raw Materials", eyebrow: "Inventory Control" },
  "/products": { title: "Products", eyebrow: "Production Catalog" },
  "/warehouses": { title: "Warehouses", eyebrow: "Storage Network" },
  "/opening-stock": { title: "Opening Stock", eyebrow: "Inventory Snapshot" },
  "/masters/units": { title: "Units", eyebrow: "Master Data" },
  "/masters/sizes": { title: "Sizes", eyebrow: "Master Data" },
  "/masters/categories": { title: "Categories", eyebrow: "Master Data" },
  "/masters/brands": { title: "Brands", eyebrow: "Master Data" },
};

const tenantLabels = {
  SAMS_TRADERS: "SAMS Traders",
  AM_TRADERS: "AM Traders",
};

// Collapsible nav section
const NavSection = ({ section, onNavigate }) => {
  const [open, setOpen] = useState(section.defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center justify-between rounded-xl px-3 py-2 transition hover:bg-white/5"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">
          {section.title}
        </span>
        <ChevronRight
          className={`h-3.5 w-3.5 text-slate-600 transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-250 ease-in-out ${
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="mt-1 space-y-0.5 pb-1">
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-[0_8px_20px_-10px_rgba(56,189,248,0.65)]"
                    : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
                }`
              }
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/8 text-cyan-300 transition group-hover:bg-white/12">
                {item.icon}
              </span>
              <span>{item.label}</span>
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

  const pageMeta = useMemo(
    () => pageTitles[pathname] || { title: "ERP Workspace", eyebrow: "Operations" },
    [pathname]
  );

  const SidebarContent = () => (
    <>
      {/* Tenant card */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.05] p-4">
        <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Active Tenant</p>
        <p className="mt-1.5 text-base font-semibold text-white">{tenantLabels[tenantId]}</p>
      </div>

      {/* Dashboard — always visible, no section */}
      <div className="mt-6">
        <NavLink
          to="/"
          end
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-[0_8px_20px_-10px_rgba(56,189,248,0.65)]"
                : "text-slate-300 hover:bg-white/[0.07] hover:text-white"
            }`
          }
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/8 text-cyan-300 transition group-hover:bg-white/12">
            {icons.dashboard}
          </span>
          <span>Dashboard</span>
        </NavLink>
      </div>

      {/* Divider */}
      <div className="my-4 h-px bg-white/[0.07]" />

      {/* Collapsible sections */}
      <nav className="space-y-2">
        {navigation.map((section) => (
          <NavSection
            key={section.id}
            section={section}
            onNavigate={() => setMobileOpen(false)}
          />
        ))}
      </nav>

      {/* Status card */}
      
    </>
  );

  return (
    <div className="min-h-screen">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-[272px] transform border-r border-white/8 bg-[linear-gradient(180deg,#0c1429_0%,#101c38_50%,#111827_100%)] px-4 py-6 text-white shadow-[20px_0_50px_-20px_rgba(15,23,42,0.7)] transition duration-300 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          {/* Logo slot */}
          <div />
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <Icon className="h-4 w-4">
              <path d="M6 6l12 12M18 6 6 18" />
            </Icon>
          </button>
        </div>

        <div className="mt-6 flex h-[calc(100vh-80px)] flex-col overflow-y-auto">
          <SidebarContent />
        </div>
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-20 border-b border-white/60 bg-white/75 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 px-4 py-4 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm lg:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <Icon className="h-5 w-5">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </Icon>
              </button>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-blue-500">
                  {pageMeta.eyebrow}
                </p>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                  {pageMeta.title}
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3.5 py-2 text-sm font-medium text-cyan-700">
                {tenantLabels[tenantId]}
              </div>
              <select
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                value={tenantId}
                onChange={(e) => setTenant(e.target.value)}
              >
                <option value="SAMS_TRADERS">SAMS Traders</option>
                <option value="AM_TRADERS">AM Traders</option>
              </select>
              <Button variant="secondary" onClick={logout}>
                Logout
              </Button>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;