import Card from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";

const metrics = [
  { label: "Raw Materials", value: "128", detail: "Active inventory lines" },
  { label: "Products", value: "64", detail: "Sellable catalog items" },
  { label: "Warehouses", value: "06", detail: "Storage locations" },
  { label: "Opening Stock", value: "312", detail: "Initial stock entries" },
];

const DashboardPage = () => {
  const { tenantId } = useAuth();

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden bg-[linear-gradient(135deg,rgba(26,88,255,0.98),rgba(0,187,249,0.92))] p-0 text-white">
        <div className="grid gap-6 px-6 py-7 md:grid-cols-[1.4fr_0.9fr] md:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.26em] text-blue-100/90">
              Smart ERP Workspace
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-extrabold tracking-tight md:text-4xl">
              A clean command center for {tenantId === "SAMS_TRADERS" ? "SAMS Traders" : "AM Traders"}.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-blue-50/90 md:text-base">
              Use the left navigation to manage masters, inventory, stock setup, and product costing with a clearer ERP flow.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[24px] border border-white/15 bg-white/12 p-4 backdrop-blur-sm"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-blue-100/80">
                  {metric.label}
                </p>
                <p className="mt-3 text-3xl font-extrabold">{metric.value}</p>
                <p className="mt-2 text-sm text-blue-100/85">{metric.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-slate-400">
            Workflow Focus
          </p>
          <h3 className="mt-3 text-2xl font-bold text-slate-900">
            Keep daily operations simple and fast
          </h3>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              "Create clean master data first so product and raw material forms stay frictionless.",
              "Maintain tenant-based records using the switcher in the top bar.",
              "Use product costing and opening stock pages as your operations starting point.",
            ].map((item) => (
              <div
                key={item}
                className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-600"
              >
                {item}
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-slate-950 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-cyan-300">
            ERP Direction
          </p>
          <h3 className="mt-3 text-2xl font-bold">Better visibility, less friction</h3>
          <ul className="mt-5 space-y-4 text-sm leading-7 text-slate-300">
            <li>Sidebar-first navigation like a production ERP system.</li>
            <li>More polished cards, forms, tables, and list states.</li>
            <li>Stronger visual hierarchy for faster daily use.</li>
          </ul>
        </Card>
      </div>
    </section>
  );
};

export default DashboardPage;
