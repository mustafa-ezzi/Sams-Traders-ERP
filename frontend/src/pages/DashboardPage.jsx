import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Pie,
  PieChart,
  Cell,
  Legend,
  ResponsiveContainer,
} from "recharts";
import Card from "../components/ui/Card";
import StateView from "../components/StateView";
import Button from "../components/ui/Button";
import accountService from "../api/services/accountService";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

/* ─── formatters ─────────────────────────────────────────────── */
const money = (value) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const moneyShort = (value) => {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `₨${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₨${(n / 1_000).toFixed(0)}K`;
  return `₨${n}`;
};

const count = (value) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Number(value || 0)
  );

const extractErrorMessage = (error) => {
  const data = error?.response?.data;
  if (!data) return "Failed to load dashboard";
  if (typeof data === "string") return data;
  return data.message || data.detail || "Failed to load dashboard";
};

/* ─── useInView — fires once when element enters viewport ───── */
const useInView = (threshold = 0.15) => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setInView(true); obs.disconnect(); }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
};

/* ─── AnimatedCard — fade + slide up on scroll ──────────────── */
const AnimatedCard = ({ children, delay = 0, className = "" }) => {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

/* ─── AnimatedChart — delays chart mount until visible ──────── */
/* This forces recharts to run its entrance animation on scroll  */
const AnimatedChart = ({ children, height = 260, delay = 0 }) => {
  const [ref, inView] = useInView(0.1);
  return (
    <div
      ref={ref}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {inView ? children : <div style={{ height }} />}
    </div>
  );
};

/* ─── shared tooltip styles ─────────────────────────────────── */
const TOOLTIP_STYLE = {
  backgroundColor: "#0f172a",
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: "14px",
  padding: "10px 14px",
  boxShadow: "0 20px 40px rgba(0,0,0,0.45)",
};
const TOOLTIP_LABEL_STYLE = {
  color: "#94a3b8",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 6,
};
const TOOLTIP_ITEM_STYLE = { color: "#f1f5f9", fontSize: "13px" };

const MoneyTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <p style={TOOLTIP_LABEL_STYLE}>{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ ...TOOLTIP_ITEM_STYLE, color: entry.color }}>
          {entry.name}: {money(entry.value)}
        </p>
      ))}
    </div>
  );
};

/* ─── Revenue vs Procurement ────────────────────────────────── */
const RevenueAreaChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={260}>
    <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <defs>
        <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#0f766e" stopOpacity={0.35} />
          <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
        </linearGradient>
        <linearGradient id="gradPurchases" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
      <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }} axisLine={false} tickLine={false} />
      <YAxis tickFormatter={moneyShort} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={68} />
      <Tooltip content={<MoneyTooltip />} />
      <Legend wrapperStyle={{ paddingTop: 12, fontSize: 13, color: "#64748b" }} formatter={(val) => <span style={{ color: "#64748b", fontWeight: 500 }}>{val}</span>} />
      <Area
        isAnimationActive animationDuration={1200} animationEasing="ease-out"
        type="monotone" dataKey="sales" name="Sales" stroke="#0f766e" strokeWidth={3}
        fill="url(#gradSales)" dot={{ r: 4, fill: "#fff", stroke: "#0f766e", strokeWidth: 2.5 }}
        activeDot={{ r: 6, fill: "#0f766e", stroke: "#fff", strokeWidth: 2 }}
      />
      <Area
        isAnimationActive animationDuration={1400} animationEasing="ease-out" animationBegin={200}
        type="monotone" dataKey="purchases" name="Purchases" stroke="#2563eb" strokeWidth={3}
        fill="url(#gradPurchases)" dot={{ r: 4, fill: "#fff", stroke: "#2563eb", strokeWidth: 2.5 }}
        activeDot={{ r: 6, fill: "#2563eb", stroke: "#fff", strokeWidth: 2 }}
      />
    </AreaChart>
  </ResponsiveContainer>
);

/* ─── Profit Trend ──────────────────────────────────────────── */
const ProfitAreaChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={260}>
    <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <defs>
        <linearGradient id="gradSales2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
        </linearGradient>
        <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#16a34a" stopOpacity={0.4} />
          <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
      <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }} axisLine={false} tickLine={false} />
      <YAxis tickFormatter={moneyShort} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={68} />
      <Tooltip content={<MoneyTooltip />} />
      <Legend wrapperStyle={{ paddingTop: 12, fontSize: 13, color: "#64748b" }} formatter={(val) => <span style={{ color: "#64748b", fontWeight: 500 }}>{val}</span>} />
      <Area
        isAnimationActive animationDuration={1200} animationEasing="ease-out"
        type="monotone" dataKey="sales" name="Sales" stroke="#2563eb" strokeWidth={3}
        fill="url(#gradSales2)" dot={{ r: 4, fill: "#fff", stroke: "#2563eb", strokeWidth: 2.5 }}
        activeDot={{ r: 6, fill: "#2563eb", stroke: "#fff", strokeWidth: 2 }}
      />
      <Area
        isAnimationActive animationDuration={1400} animationEasing="ease-out" animationBegin={200}
        type="monotone" dataKey="profit" name="Profit" stroke="#16a34a" strokeWidth={3}
        fill="url(#gradProfit)" dot={{ r: 4, fill: "#fff", stroke: "#16a34a", strokeWidth: 2.5 }}
        activeDot={{ r: 6, fill: "#16a34a", stroke: "#fff", strokeWidth: 2 }}
      />
    </AreaChart>
  </ResponsiveContainer>
);

/* ─── Cash Movement ─────────────────────────────────────────── */
const CashBarChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={240}>
    <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
      <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 12, fontWeight: 500 }} axisLine={false} tickLine={false} />
      <YAxis tickFormatter={moneyShort} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={68} />
      <Tooltip content={<MoneyTooltip />} />
      <Legend wrapperStyle={{ paddingTop: 12, fontSize: 13, color: "#64748b" }} formatter={(val) => <span style={{ color: "#64748b", fontWeight: 500 }}>{val}</span>} />
      <Bar isAnimationActive animationDuration={1000} animationEasing="ease-out" dataKey="receipts" name="Receipts" fill="#0891b2" radius={[6, 6, 0, 0]} maxBarSize={28} />
      <Bar isAnimationActive animationDuration={1200} animationEasing="ease-out" animationBegin={150} dataKey="payments" name="Payments" fill="#e11d48" radius={[6, 6, 0, 0]} maxBarSize={28} />
    </BarChart>
  </ResponsiveContainer>
);

/* ─── Financial Mix Pie ─────────────────────────────────────── */
const PIE_COLORS = ["#0f766e", "#2563eb", "#a855f7", "#64748b"];

const FinancialMixPie = ({ kpis }) => {
  const data = [
    { name: "Sales",       value: Math.abs(Number(kpis?.total_sales             || 0)) },
    { name: "Purchases",   value: Math.abs(Number(kpis?.total_purchases          || 0)) },
    { name: "Receivables", value: Math.abs(Number(kpis?.receivables_outstanding || 0)) },
    { name: "Payables",    value: Math.abs(Number(kpis?.payables_outstanding     || 0)) },
  ];
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          cx="50%" cy="50%"
          innerRadius={50} outerRadius={75}
          paddingAngle={3} dataKey="value"
          isAnimationActive
          animationBegin={100}
          animationDuration={1000}
          animationEasing="ease-out"
        >
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
        </Pie>
        <Tooltip formatter={(v) => money(v)} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#64748b" }}
          formatter={(val) => <span style={{ color: "#64748b" }}>{val}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

/* ─── Progress list — bars animate in on scroll ─────────────── */
const ProgressList = ({ items, accent }) => {
  const [ref, inView] = useInView();
  const maxAmount = Math.max(1, ...items.map((item) => Number(item.amount || 0)));
  return (
    <div className="space-y-4" ref={ref}>
      {items.map((item, idx) => (
        <div
          key={item.name}
          className="space-y-1.5"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? "translateX(0)" : "translateX(-12px)",
            transition: `opacity 0.4s ease ${idx * 80}ms, transform 0.4s ease ${idx * 80}ms`,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
            <p className="shrink-0 text-sm text-slate-500">{money(item.amount)}</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: inView ? `${Math.max(8, (Number(item.amount || 0) / maxAmount) * 100)}%` : "0%",
                background: accent,
                transition: `width 0.8s ease ${300 + idx * 100}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

/* ─── Compact stat box ──────────────────────────────────────── */
const StatBox = ({ label, value, color = "text-slate-900" }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5">
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
    <p className={`mt-1.5 text-lg font-extrabold leading-tight break-all ${color}`}>{value}</p>
  </div>
);

/* ─── Colored KPI tile — pops in on scroll with stagger ─────── */
const KpiTile = ({ label, value, tone, sub = "all time", index = 0 }) => {
  const [ref, inView] = useInView();
  return (
    <div
      ref={ref}
      className={`rounded-2xl bg-gradient-to-br ${tone} p-[1px] shadow-sm`}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0) scale(1)" : "translateY(20px) scale(0.95)",
        transition: `opacity 0.45s ease ${index * 70}ms, transform 0.45s ease ${index * 70}ms`,
      }}
    >
      <div className="rounded-[15px] bg-black/10 px-4 py-3.5 h-full">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/80">{label}</p>
        <p className="mt-2 text-[clamp(0.95rem,2vw,1.4rem)] font-extrabold leading-tight text-white break-all">
          {value}
        </p>
        <p className="mt-1 text-[10px] text-white/50">{sub}</p>
      </div>
    </div>
  );
};

/* ─── Welcome Banner ────────────────────────────────────────── */
const WelcomeBanner = ({ tenantName, name, today, period, onPeriodChange }) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  const dateStr =
    today ||
    new Date().toLocaleDateString("en-PK", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-12px)",
        transition: "opacity 0.55s ease, transform 0.55s ease",
      }}
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
          CoreLedger · Overview
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900 tracking-tight">
          Welcome to {tenantName}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {name ? `Signed in as ${name} · ` : ""}
          {dateStr}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          value={period}
          onChange={(event) => onPeriodChange(event.target.value)}
        >
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="all">All Time</option>
        </select>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700">
          <span
            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
            style={{ animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" }}
          />
          Live data
        </span>
      </div>
    </div>
  );
};

/* ─── Main page ─────────────────────────────────────────────── */
const DashboardPage = () => {
  const { tenantId, user } = useAuth();
  const toast = useToast();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("all");

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await accountService.getDashboardOverview(tenantId, period);
      setDashboard(response);
    } catch (loadError) {
      const message = extractErrorMessage(loadError);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDashboard(); }, [tenantId, period]);

  const headlineCards = useMemo(() => {
    if (!dashboard) return [];
    return [
      { label: "Total Sales",    value: money(dashboard.kpis?.total_sales),             tone: "from-emerald-500 to-teal-500" },
      { label: "Total Profit",   value: money(dashboard.kpis?.total_profit),            tone: "from-amber-500 to-orange-500" },
      { label: "Total Purchase", value: money(dashboard.kpis?.total_purchases),         tone: "from-blue-500 to-cyan-500" },
      { label: "Receivables",    value: money(dashboard.kpis?.receivables_outstanding), tone: "from-fuchsia-500 to-pink-500" },
      { label: "Payables",       value: money(dashboard.kpis?.payables_outstanding),    tone: "from-slate-600 to-slate-400" },
    ];
  }, [dashboard]);

  const monthlyCards = useMemo(() => {
    if (!dashboard) return [];
    return [
      ["Profit This Month",    dashboard.kpis?.profit_this_month,    "text-emerald-600"],
      ["Sales This Month",     dashboard.kpis?.sales_this_month,     "text-sky-600"],
      ["Purchases This Month", dashboard.kpis?.purchases_this_month, "text-indigo-600"],
      ["Receipts This Month",  dashboard.kpis?.receipts_this_month,  "text-cyan-600"],
    ];
  }, [dashboard]);

  /* Adjust field name to match your actual auth user shape */
  const displayName = user?.name || user?.full_name || user?.username || "";
  const tenantName = (tenantId || "ERP Workspace")
    .toString()
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    <section className="space-y-5">
      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && !dashboard}
        emptyMessage="No dashboard data available."
      >
        {dashboard ? (
          <>
            {/* ── Welcome banner ── */}
            <WelcomeBanner
              tenantName={tenantName}
              name={displayName}
              today={dashboard.today}
              period={period}
              onPeriodChange={setPeriod}
            />

            {/* ── Row 1: KPI tiles ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {headlineCards.map((card, i) => (
                <KpiTile key={card.label} {...card} index={i} />
              ))}
            </div>

            {/* ── Row 2: Pie + Stock/Journal + Monthly snapshot ── */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">

              <AnimatedCard delay={0}>
                <Card className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                    Financial Mix
                  </p>
                  <AnimatedChart height={180} delay={100}>
                    <FinancialMixPie kpis={dashboard.kpis} />
                  </AnimatedChart>
                </Card>
              </AnimatedCard>

              <AnimatedCard delay={80}>
                <Card className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                    Stock &amp; Journal
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <StatBox label="Stock Total"    value={moneyShort(dashboard.stock_mix?.total)} />
                    <StatBox label="Raw Materials"  value={moneyShort(dashboard.stock_mix?.raw_materials)} />
                    <StatBox label="Finished Goods" value={moneyShort(dashboard.stock_mix?.products)} />
                    <StatBox label="Lines Posted"   value={count(dashboard.journal_health?.lines_posted)} />
                    <StatBox label="Debit Total"    value={moneyShort(dashboard.journal_health?.debit_total)}  color="text-emerald-700" />
                    <StatBox label="Credit Total"   value={moneyShort(dashboard.journal_health?.credit_total)} color="text-rose-600" />
                  </div>
                </Card>
              </AnimatedCard>

              <AnimatedCard delay={160}>
                <Card className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                      Monthly Snapshot
                    </p>
                    <Button variant="secondary" size="sm" onClick={loadDashboard}>
                      Refresh
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {monthlyCards.map(([label, value, color]) => (
                      <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">{label}</p>
                        <p className={`mt-1.5 text-base font-extrabold ${color}`}>{money(value)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">As of</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{dashboard.today}</p>
                    <p className="text-xs text-slate-400 mt-0.5">PKR · Profit = Revenue − COGS</p>
                  </div>
                </Card>
              </AnimatedCard>
            </div>

            {/* ── Revenue vs Procurement ── */}
            <AnimatedCard delay={0}>
              <Card className="space-y-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Revenue vs Procurement</p>
                  <h3 className="mt-1.5 text-xl font-bold text-slate-900">Monthly commercial movement</h3>
                </div>
                <AnimatedChart height={260} delay={100}>
                  <RevenueAreaChart data={dashboard.monthly_trends || []} />
                </AnimatedChart>
              </Card>
            </AnimatedCard>

            {/* ── Profit Trend ── */}
            <AnimatedCard delay={0}>
              <Card className="space-y-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Profit Trend</p>
                  <h3 className="mt-1.5 text-xl font-bold text-slate-900">Sales and profit performance</h3>
                </div>
                <AnimatedChart height={260} delay={100}>
                  <ProfitAreaChart data={dashboard.monthly_trends || []} />
                </AnimatedChart>
              </Card>
            </AnimatedCard>

            {/* ── Cash Movement + Master Data ── */}
            <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <AnimatedCard delay={0}>
                <Card className="space-y-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Cash Movement</p>
                    <h3 className="mt-1.5 text-xl font-bold text-slate-900">Receipts and payments by month</h3>
                  </div>
                  <AnimatedChart height={240} delay={100}>
                    <CashBarChart data={dashboard.monthly_trends || []} />
                  </AnimatedChart>
                </Card>
              </AnimatedCard>

              <AnimatedCard delay={100}>
                <Card className="space-y-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Master Data</p>
                    <h3 className="mt-1.5 text-xl font-bold text-slate-900">Operational footprint</h3>
                  </div>
                  <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3">
                    {[
                      ["Products",      dashboard.counts?.products],
                      ["Raw Materials", dashboard.counts?.raw_materials],
                      ["Customers",     dashboard.counts?.customers],
                      ["Suppliers",     dashboard.counts?.suppliers],
                      ["Warehouses",    dashboard.counts?.warehouses],
                      ["Opening Stock", dashboard.counts?.opening_stock],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
                        <p className="mt-1.5 text-2xl font-extrabold text-slate-900">{count(value)}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </AnimatedCard>
            </div>

            {/* ── Bottom row ── */}
            <div className="grid gap-5 xl:grid-cols-4 items-stretch">
              <AnimatedCard delay={0}>
                <Card className="flex h-full flex-col space-y-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Customer Ranking</p>
                    <h3 className="mt-1.5 text-xl font-bold text-slate-900">Top customers</h3>
                  </div>
                  <ProgressList items={dashboard.top_customers || []} accent="linear-gradient(90deg,#0f766e,#5eead4)" />
                </Card>
              </AnimatedCard>

              <AnimatedCard delay={80}>
                <Card className="flex h-full flex-col space-y-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Supplier Ranking</p>
                    <h3 className="mt-1.5 text-xl font-bold text-slate-900">Top suppliers</h3>
                  </div>
                  <ProgressList items={dashboard.top_suppliers || []} accent="linear-gradient(90deg,#2563eb,#93c5fd)" />
                </Card>
              </AnimatedCard>

              <AnimatedCard delay={160}>
                <Card className="flex h-full flex-col space-y-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Balance Snapshot</p>
                    <h3 className="mt-1.5 text-xl font-bold text-slate-900">Current position</h3>
                  </div>
                  <div className="space-y-2.5">
                    {[
                      ["Total Profit", dashboard.kpis?.total_profit,             "text-emerald-600"],
                      ["Receivables",  dashboard.kpis?.receivables_outstanding,  "text-amber-600"],
                      ["Payables",     dashboard.kpis?.payables_outstanding,     "text-rose-600"],
                      ["Stock Value",  dashboard.stock_mix?.total,               "text-indigo-600"],
                    ].map(([label, value, color]) => (
                      <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
                        <p className={`mt-1.5 text-xl font-extrabold ${color}`}>{money(value)}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              </AnimatedCard>

              <AnimatedCard delay={240}>
                <Card className="flex h-full flex-col space-y-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Activity Feed</p>
                    <h3 className="mt-1.5 text-xl font-bold text-slate-900">Latest journal activity</h3>
                  </div>
                  <div className="max-h-[400px] space-y-3 overflow-y-auto pr-1">
                    {(dashboard.recent_activity || []).map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
                        <div className="flex flex-col gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {item.reference} • {item.document_type}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.people_type ? `${item.people_type}: ${item.people_name || "-"}` : "Accounting entry"}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">{item.description || "No remarks"}</p>
                          </div>
                          <div className="text-xs">
                            <p className="font-semibold text-emerald-700">Dr {money(item.debit)}</p>
                            <p className="font-semibold text-rose-700">Cr {money(item.credit)}</p>
                            <p className="mt-1 uppercase tracking-[0.18em] text-slate-400">{item.date}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </AnimatedCard>
            </div>
          </>
        ) : null}
      </StateView>
    </section>
  );
};

export default DashboardPage;