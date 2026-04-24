import { useEffect, useMemo, useState } from "react";
import Card from "../components/ui/Card";
import StateView from "../components/StateView";
import Button from "../components/ui/Button";
import accountService from "../api/services/accountService";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

const money = (value) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const count = (value) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const extractErrorMessage = (error) => {
  const data = error?.response?.data;
  if (!data) return "Failed to load dashboard";
  if (typeof data === "string") return data;
  return data.message || data.detail || "Failed to load dashboard";
};

const MixedBars = ({ data }) => {
  const maxValue = Math.max(
    1,
    ...data.flatMap((item) => [
      Number(item.receipts || 0),
      Number(item.payments || 0),
    ])
  );

  return (
    <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-4">
      <div className="flex h-56 items-end gap-3">
        {data.map((item) => (
          <div key={item.month} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-48 w-full items-end justify-center gap-1 rounded-2xl bg-slate-50/90 px-1 pb-1 pt-3">
              {[
                {
                  key: "receipts",
                  value: Number(item.receipts || 0),
                  color: "linear-gradient(180deg,#0891b2,#67e8f9)",
                },
                {
                  key: "payments",
                  value: Number(item.payments || 0),
                  color: "linear-gradient(180deg,#dc2626,#fda4af)",
                },
              ].map((bar) => (
                <div
                  key={`${item.month}-${bar.key}`}
                  className="w-full rounded-t-2xl shadow-[0_8px_20px_-12px_rgba(15,23,42,0.55)]"
                  style={{
                    height: `${Math.max(8, (bar.value / maxValue) * 100)}%`,
                    background: bar.color,
                  }}
                  title={`${bar.key}: ${money(bar.value)}`}
                />
              ))}
            </div>
            <p className="text-center text-xs font-medium text-slate-500">{item.month}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const ComparisonChart = ({ data, leftKey, rightKey, leftColor, rightColor }) => {
  const width = 720;
  const height = 260;
  const padding = 28;
  const values = data.flatMap((item) => [Number(item[leftKey] || 0), Number(item[rightKey] || 0)]);
  const maxValue = Math.max(1, ...values);

  const buildSeries = (key) =>
    data.map((item, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(1, data.length - 1);
      const y =
        height -
        padding -
        (Number(item[key] || 0) / maxValue) * (height - padding * 2);
      return { x, y, label: item.month, value: Number(item[key] || 0) };
    });

  const leftSeries = buildSeries(leftKey);
  const rightSeries = buildSeries(rightKey);

  const points = (series) => series.map((point) => `${point.x},${point.y}`).join(" ");
  const area = (series) => {
    if (!series.length) return "";
    return `M ${series[0].x} ${height - padding} L ${series
      .map((point) => `${point.x} ${point.y}`)
      .join(" L ")} L ${series[series.length - 1].x} ${height - padding} Z`;
  };

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full overflow-visible">
        <defs>
          <linearGradient id="gridStroke" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#cbd5e1" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="leftArea" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={leftColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={leftColor} stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="rightArea" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={rightColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={rightColor} stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3, 4].map((step) => {
          const y = padding + ((height - padding * 2) / 4) * step;
          return (
            <line
              key={step}
              x1={padding}
              x2={width - padding}
              y1={y}
              y2={y}
              stroke="url(#gridStroke)"
              strokeWidth="1"
            />
          );
        })}

        <path d={area(rightSeries)} fill="url(#rightArea)" />
        <path d={area(leftSeries)} fill="url(#leftArea)" />

        <polyline
          fill="none"
          stroke={leftColor}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points(leftSeries)}
        />
        <polyline
          fill="none"
          stroke={rightColor}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points(rightSeries)}
        />

        {leftSeries.map((point) => (
          <circle key={`left-${point.label}`} cx={point.x} cy={point.y} r="4.5" fill="white" stroke={leftColor} strokeWidth="3" />
        ))}
        {rightSeries.map((point) => (
          <circle key={`right-${point.label}`} cx={point.x} cy={point.y} r="4.5" fill="white" stroke={rightColor} strokeWidth="3" />
        ))}
      </svg>

      <div className="grid grid-cols-6 gap-2 text-center text-xs text-slate-500">
        {data.map((item) => (
          <div key={item.month}>{item.month}</div>
        ))}
      </div>
    </div>
  );
};

const ProgressList = ({ items, accent }) => {
  const maxAmount = Math.max(1, ...items.map((item) => Number(item.amount || 0)));

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.name} className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
            <p className="text-sm text-slate-500">{money(item.amount)}</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(8, (Number(item.amount || 0) / maxAmount) * 100)}%`,
                background: accent,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const DashboardPage = () => {
  const { tenantId } = useAuth();
  const toast = useToast();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await accountService.getDashboardOverview(tenantId);
      setDashboard(response);
    } catch (loadError) {
      const message = extractErrorMessage(loadError);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [tenantId]);

  const headlineCards = useMemo(() => {
    if (!dashboard) return [];
    return [
      {
        label: "Total Sales",
        value: money(dashboard.kpis?.total_sales),
        tone: "from-emerald-500 to-teal-500",
      },
      {
        label: "Total Profit",
        value: money(dashboard.kpis?.total_profit),
        tone: "from-amber-500 to-orange-500",
      },
      {
        label: "Total Purchase",
        value: money(dashboard.kpis?.total_purchases),
        tone: "from-blue-500 to-cyan-500",
      },
      {
        label: "Receivables",
        value: money(dashboard.kpis?.receivables_outstanding),
        tone: "from-fuchsia-500 to-pink-500",
      },
      {
        label: "Payables",
        value: money(dashboard.kpis?.payables_outstanding),
        tone: "from-slate-700 to-slate-500",
      },
    ];
  }, [dashboard]);

  const monthlyCards = useMemo(() => {
    if (!dashboard) return [];
    return [
      ["Profit This Month", dashboard.kpis?.profit_this_month, "text-emerald-600"],
      ["Sales This Month", dashboard.kpis?.sales_this_month, "text-sky-600"],
      ["Purchases This Month", dashboard.kpis?.purchases_this_month, "text-indigo-600"],
      ["Receipts This Month", dashboard.kpis?.receipts_this_month, "text-cyan-600"],
    ];
  }, [dashboard]);

  return (
    <section className="space-y-6">
      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && !dashboard}
        emptyMessage="No dashboard data available."
      >
        {dashboard ? (
          <>
            <Card className="overflow-hidden border-0 bg-[radial-gradient(circle_at_top_left,#1d4ed8,transparent_36%),radial-gradient(circle_at_top_right,#0f766e,transparent_26%),linear-gradient(135deg,#0f172a,#10233f_55%,#111827)] p-0 text-white">
              <div className="grid gap-6 px-6 py-7 lg:grid-cols-[1.3fr_0.9fr] lg:px-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200/80">
                    Smart ERP Dashboard
                  </p>
                  <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight md:text-5xl">
                    {dashboard.hero?.title}
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200/90 md:text-base">
                    {dashboard.hero?.subtitle}
                  </p>

                  <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {headlineCards.map((card) => (
                      <div
                        key={card.label}
                        className={`rounded-[24px] bg-gradient-to-br ${card.tone} p-[1px] shadow-lg`}
                      >
                        <div className="rounded-[23px] bg-slate-950/70 px-4 py-4 backdrop-blur-sm">
                          <p className="text-xs uppercase tracking-[0.24em] text-slate-300">
                            {card.label}
                          </p>
                          <p className="mt-3 text-2xl font-extrabold">{card.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-[24px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/70">
                      Stock Value
                    </p>
                    <p className="mt-2 text-3xl font-extrabold">
                      {money(dashboard.stock_mix?.total)}
                    </p>
                    <div className="mt-5 space-y-3 text-sm text-slate-200">
                      <div className="flex items-center justify-between">
                        <span>Raw Materials</span>
                        <span>{money(dashboard.stock_mix?.raw_materials)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Finished Products</span>
                        <span>{money(dashboard.stock_mix?.products)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/70">
                      Journal Health
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-2xl font-extrabold">
                          {count(dashboard.journal_health?.lines_posted)}
                        </p>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-300">
                          Lines Posted
                        </p>
                      </div>
                      <div>
                        <p className="text-2xl font-extrabold">
                          {money(dashboard.journal_health?.debit_total)}
                        </p>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-300">
                          Debit Total
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <Card className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                      Revenue vs Procurement
                    </p>
                    <h3 className="mt-2 text-2xl font-bold text-slate-900">
                      Monthly commercial movement
                    </h3>
                  </div>
                  <Button variant="secondary" onClick={loadDashboard}>
                    Refresh
                  </Button>
                </div>
                <ComparisonChart
                  data={dashboard.monthly_trends || []}
                  leftKey="sales"
                  rightKey="purchases"
                  leftColor="#0f766e"
                  rightColor="#2563eb"
                />
                <div className="flex flex-wrap gap-5 text-sm">
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-3 w-3 rounded-full bg-teal-700" />
                    Sales
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-3 w-3 rounded-full bg-blue-600" />
                    Purchase
                  </div>
                </div>
              </Card>

              <Card className="space-y-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                    Monthly Snapshot
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-900">
                    Current month position
                  </h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {monthlyCards.map(([label, value, color]) => (
                    <div
                      key={label}
                      className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4"
                    >
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
                      <p className={`mt-2 text-2xl font-extrabold ${color}`}>{money(value)}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-white px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">As of</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{dashboard.today}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Currency is PKR, and profit is calculated from posted revenue minus posted COGS.
                  </p>
                </div>
              </Card>
            </div>

            <Card className="space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                  Profit Trend
                </p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900">
                  Sales and profit performance
                </h3>
              </div>
              <ComparisonChart
                data={dashboard.monthly_trends || []}
                leftKey="sales"
                rightKey="profit"
                leftColor="#2563eb"
                rightColor="#16a34a"
              />
              <div className="flex flex-wrap gap-5 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <span className="h-3 w-3 rounded-full bg-blue-600" />
                  Sales
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <span className="h-3 w-3 rounded-full bg-green-600" />
                  Profit
                </div>
              </div>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <Card className="space-y-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                    Cash Movement
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-900">
                    Receipts and payments by month
                  </h3>
                </div>
                <MixedBars data={dashboard.monthly_trends || []} />
                <div className="flex flex-wrap gap-5 text-sm">
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-3 w-3 rounded-full bg-cyan-500" />
                    Receipts
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="h-3 w-3 rounded-full bg-rose-500" />
                    Payments
                  </div>
                </div>
              </Card>

              <Card className="space-y-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                    Master Data
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-900">
                    Operational footprint
                  </h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Products", dashboard.counts?.products],
                    ["Raw Materials", dashboard.counts?.raw_materials],
                    ["Customers", dashboard.counts?.customers],
                    ["Suppliers", dashboard.counts?.suppliers],
                    ["Warehouses", dashboard.counts?.warehouses],
                    ["Opening Stock", dashboard.counts?.opening_stock],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-sm"
                    >
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
                      <p className="mt-2 text-2xl font-extrabold text-slate-900">{count(value)}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-4 items-stretch">
              <Card className="space-y-5 h-full flex flex-col">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                    Customer Ranking
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-900">Top customers</h3>
                </div>
                <ProgressList items={dashboard.top_customers || []} accent="linear-gradient(90deg,#0f766e,#5eead4)" />
              </Card>

              <Card className="space-y-5 h-full flex flex-col">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                    Supplier Ranking
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-900">Top suppliers</h3>
                </div>
                <ProgressList items={dashboard.top_suppliers || []} accent="linear-gradient(90deg,#2563eb,#93c5fd)" />
              </Card>

              <Card className="space-y-5 h-full flex flex-col">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                    Balance Snapshot
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-900">Current position</h3>
                </div>
                <div className="space-y-4">
                  {[
                    ["Total Profit", dashboard.kpis?.total_profit, "text-emerald-600"],
                    ["Receivables", dashboard.kpis?.receivables_outstanding, "text-amber-600"],
                    ["Payables", dashboard.kpis?.payables_outstanding, "text-rose-600"],
                    ["Stock Value", dashboard.stock_mix?.total, "text-indigo-600"],
                  ].map(([label, value, color]) => (
                    <div
                      key={label}
                      className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4"
                    >
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
                      <p className={`mt-2 text-2xl font-extrabold ${color}`}>{money(value)}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="space-y-5 h-full flex flex-col">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
                    Activity Feed
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-900">
                    Latest journal activity
                  </h3>
                </div>
                <div className="space-y-3 overflow-y-auto max-h-[400px] pr-1">
                  {(dashboard.recent_activity || []).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {item.reference} • {item.document_type}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {item.people_type
                              ? `${item.people_type}: ${item.people_name || "-"}`
                              : "Accounting entry"}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">{item.description || "No remarks"}</p>
                        </div>
                        <div className="text-sm">
                          <p className="font-semibold text-emerald-700">Dr {money(item.debit)}</p>
                          <p className="font-semibold text-rose-700">Cr {money(item.credit)}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                            {item.date}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        ) : null}
      </StateView>
    </section>
  );
};

export default DashboardPage;
