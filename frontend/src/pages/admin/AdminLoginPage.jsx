import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import { useToast } from "../../context/ToastContext";
import adminAuthService from "../../api/services/adminAuthService";

const AdminLoginPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await adminAuthService.login(form);
      localStorage.setItem("adminToken", response.access);
      localStorage.setItem("adminRefreshToken", response.refresh || "");
      toast.success("Signed in to God console");
      navigate("/admin/users");
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message ||
        apiError?.response?.data?.detail ||
        "Admin login failed";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(55,125,255,0.22),transparent_24%),radial-gradient(circle_at_80%_20%,rgba(0,187,249,0.18),transparent_20%),linear-gradient(180deg,#f3f7ff_0%,#eef3fb_100%)]" />
      <div className="relative z-10 flex w-full justify-center">
        <Card className="w-full max-w-lg bg-white/92 px-4 py-5 sm:px-5 sm:py-6">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            God sign-in
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Staff (God) access: manage tenant admins, their staff users,
            dimensions, and inquiries.
          </p>
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <FormInput
              label="Username"
              required
              value={form.username}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, username: event.target.value }))
              }
            />
            <FormInput
              label="Password"
              type="password"
              required
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
            />
            <Button className="w-full" type="submit" disabled={saving}>
              {saving ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          {error ? (
            <p className="mt-4 text-sm font-medium text-rose-600">{error}</p>
          ) : null}
        </Card>
      </div>
    </div>
  );
};

export default AdminLoginPage;
