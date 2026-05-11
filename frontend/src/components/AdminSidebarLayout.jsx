import { NavLink } from "react-router-dom";
import Card from "./ui/Card";
import Button from "./ui/Button";
import adminAuthService from "../api/services/adminAuthService";

const adminNavItems = [
  { to: "/admin/users", label: "Users" },
  { to: "/admin/inquiries", label: "Inquiries" },
];

const AdminSidebarLayout = ({ children, title, subtitle }) => (
  <section className="min-h-screen bg-slate-50 px-3 py-6 sm:px-5 lg:px-8">
    <div className="mx-auto grid max-w-7xl grid-cols-12 gap-4">
      <main className="col-span-12 md:col-span-9">
        <Card className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
              God console
            </p>
            <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
        </Card>
        {children}
      </main>
      <aside className="col-span-12 md:col-span-3">
        <Card className="border-0 bg-slate-900 p-3 text-white shadow-md">
          <div className="mb-3 flex items-center justify-between gap-2 px-2">
            <p className="text-xs uppercase tracking-wide text-slate-300">Navigation</p>
            <span className="shrink-0 rounded-md bg-amber-500/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-100 ring-1 ring-amber-400/35">
              Admin
            </span>
          </div>
          <nav className="space-y-1">
            {adminNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-lg px-2 py-1.5 text-sm ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-200 hover:bg-slate-800"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Button
            variant="secondary"
            className="mt-4 w-full"
            onClick={() => {
              adminAuthService.logout();
              window.location.href = "/admin/login";
            }}
          >
            Logout
          </Button>
        </Card>
      </aside>
    </div>
  </section>
);

export default AdminSidebarLayout;

