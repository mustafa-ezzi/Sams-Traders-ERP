import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import authService from "../api/services/authService";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import FormInput from "../components/ui/FormInput";
import { useToast } from "../context/ToastContext";

const schema = z.object({
  token: z.string().min(1, "JWT token is required"),
  tenant_id: z.enum(["SAMS_TRADERS", "AM_TRADERS"]),
});

const apiLoginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  tenant_id: z.enum(["SAMS_TRADERS", "AM_TRADERS"]),
});

const decodeTenantFromJwt = (token) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.tenant_id || payload?.tenant_id || "";
  } catch {
    return "";
  }
};

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("api");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const toast = useToast();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { token: "", tenant_id: "SAMS_TRADERS" },
  });
  const apiForm = useForm({
    resolver: zodResolver(apiLoginSchema),
    defaultValues: { email: "", password: "", tenant_id: "SAMS_TRADERS" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setError("");
    const tenantInJwt = decodeTenantFromJwt(values.token);
    if (tenantInJwt && tenantInJwt !== values.tenant_id) {
      setError(`Selected tenant does not match token tenant (${tenantInJwt}).`);
      toast.error("Tenant mismatch in token");
      return;
    }
    login(values.token, values.tenant_id);
    toast.success("Login successful");
    navigate("/");
  });

  const onApiSubmit = apiForm.handleSubmit(async (values) => {
    setError("");
    setInfo("");
    try {
      const response = await authService.login(values);
      const token = response?.token || response?.data?.token;
      if (!token) {
        setError("Login response did not include token.");
        toast.error("Token missing in response");
        return;
      }
      login(token, values.tenant_id);
      toast.success("Login successful");
      navigate("/");
    } catch (apiError) {
      setError(
        apiError?.response?.data?.message ||
        "API login failed. Check backend auth setup."
      );
      setInfo(
        "Ensure backend is running and JWT_SECRET is set. Route used: /api/v1/auth/login"
      );
      toast.error("API login failed");
    }
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(55,125,255,0.22),transparent_24%),radial-gradient(circle_at_80%_20%,rgba(0,187,249,0.18),transparent_20%),linear-gradient(180deg,#f3f7ff_0%,#eef3fb_100%)]" />

      <div className="relative z-10 flex w-full justify-center">
        <Card className="w-full max-w-lg bg-white/92 px-4 py-5 sm:px-5 sm:py-6">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Sign In</h2>
          <p className="mt-2 text-sm text-slate-500">
            Choose API login if your auth route is ready, or paste a JWT manually.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
            <Button
              type="button"
              onClick={() => setTab("api")}
              variant={tab === "api" ? "primary" : "ghost"}
            >
              API Login
            </Button>
            <Button
              type="button"
              onClick={() => setTab("manual")}
              variant={tab === "manual" ? "primary" : "ghost"}
            >
              Manual Token
            </Button>
          </div>

          <div className="mt-6">
            {tab === "api" ? (
              <form className="space-y-4" onSubmit={onApiSubmit}>
                <FormInput label="Email" required error={apiForm.formState.errors.email?.message} {...apiForm.register("email")} />
                <FormInput label="Password" required type="password" error={apiForm.formState.errors.password?.message} {...apiForm.register("password")} />
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Tenant</label>
                  <select className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" {...apiForm.register("tenant_id")}>
                    <option value="SAMS_TRADERS">SAMS Traders</option>
                    <option value="AM_TRADERS">AM Traders</option>
                  </select>
                </div>
                <Button className="w-full" type="submit">
                  Login
                </Button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={onSubmit}>
                <FormInput label="JWT Token" required as="textarea" rows={5} error={form.formState.errors.token?.message} {...form.register("token")} />
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">Tenant</label>
                  <select className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" {...form.register("tenant_id")}>
                    <option value="SAMS_TRADERS">SAMS Traders</option>
                    <option value="AM_TRADERS">AM Traders</option>
                  </select>
                </div>
                <Button className="w-full" type="submit">
                  Continue
                </Button>
              </form>
            )}
          </div>

          {error && <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
          {info && <p className="mt-3 text-sm font-medium text-amber-700">{info}</p>}

          <div className="mt-5 rounded-[24px] bg-slate-50 p-4 text-xs leading-6 text-slate-600">
            Dev default API credentials:
            SAMS: `sams@test.com` / `sams123`, AM: `am@test.com` / `amtraders123`.
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
