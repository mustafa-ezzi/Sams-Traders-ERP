import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import authService from "../api/services/authService";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import FormInput from "../components/ui/FormInput";
import { useToast } from "../context/ToastContext";

const schema = z.object({
  token: z.string().min(1, "JWT token is required"),
});

const apiLoginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const LoginPage = () => {
  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [tab] = useState("api");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const toast = useToast();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { token: "" },
  });
  const apiForm = useForm({
    resolver: zodResolver(apiLoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setError("");
    const activeTenant = localStorage.getItem("tenantId") || "SAMS_TRADERS";
    login({
      token: values.token,
      tenantId: activeTenant,
      allowedDimensions: [],
    });
    toast.success("Login successful");
    navigate("/");
  });

  const onApiSubmit = apiForm.handleSubmit(async (values) => {
    setError("");
    setInfo("");
    try {
      const response = await authService.login(values);

      const accessToken = response?.access;
      const refreshToken = response?.refresh;
      const user = response?.user;
      const allowedDimensions = user?.allowed_dimensions || [];
      const loginTenant = user?.tenant_id || allowedDimensions?.[0]?.code || "";

      if (!accessToken || !user) {
        setError("Login response is missing token or user data.");
        toast.error("Invalid response from backend");
        return;
      }

      localStorage.setItem("token", accessToken);
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("tenantId", loginTenant);

      login({
        token: accessToken,
        tenantId: loginTenant,
        allowedDimensions,
        isTenantChild: Boolean(user?.is_tenant_child ?? user?.isTenantChild),
        uiPermissions: user?.ui_permissions ?? user?.uiPermissions ?? [],
        tenantRole: user?.tenant_role ?? user?.tenantRole ?? "",
      });

      toast.success(`Welcome ${user.email}!`);
      navigate("/");
    } catch (apiError) {
      const errorMessage =
        apiError?.response?.data?.message ||
        apiError?.response?.data?.details?.non_field_errors?.[0] ||
        apiError?.response?.data?.detail ||
        "API login failed. Check backend auth setup.";
      setError(errorMessage);
      setInfo("Ensure backend is running and user credentials are correct.");
      toast.error("Login failed");
    }
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(55,125,255,0.22),transparent_24%),radial-gradient(circle_at_80%_20%,rgba(0,187,249,0.18),transparent_20%),linear-gradient(180deg,#f3f7ff_0%,#eef3fb_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_24%),radial-gradient(circle_at_80%_20%,rgba(14,165,233,0.12),transparent_20%),linear-gradient(180deg,#0f172a_0%,#020617_100%)]" />

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        {isDark ? "☀" : "☾"}
      </button>

      <div className="relative z-10 flex w-full justify-center">
        <Card className="w-full max-w-lg bg-white/92 px-4 py-5 sm:px-6 sm:py-6">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Sign In
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Sign in once, then switch dimensions from the top bar.
          </p>

          <div className="mt-6">
            {tab === "api" ? (
              <form className="space-y-4" onSubmit={onApiSubmit}>
                <FormInput
                  label="Email"
                  required
                  error={apiForm.formState.errors.email?.message}
                  {...apiForm.register("email")}
                />
                <FormInput
                  label="Password"
                  required
                  type="password"
                  error={apiForm.formState.errors.password?.message}
                  {...apiForm.register("password")}
                />
                <Button className="w-full" type="submit">
                  Login
                </Button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={onSubmit}>
                <FormInput
                  label="JWT Token"
                  required
                  as="textarea"
                  rows={5}
                  error={form.formState.errors.token?.message}
                  {...form.register("token")}
                />
                <Button className="w-full" type="submit">
                  Continue
                </Button>
              </form>
            )}
          </div>

          {error && (
            <p className="mt-4 text-sm font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          {info && (
            <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">
              {info}
            </p>
          )}

          <div className="mt-5 rounded-[24px] bg-slate-50 p-4 text-xs leading-6 text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-slate-100">
              Dev Test Credentials:
            </strong>
            <br />
            Use any valid seeded account, for example{" "}
            <code className="text-slate-700 dark:text-slate-200">
              sams@test.com
            </code>{" "}
            /{" "}
            <code className="text-slate-700 dark:text-slate-200">sams123</code>.
            <br />
            Switch dimension after login from the navbar.
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
