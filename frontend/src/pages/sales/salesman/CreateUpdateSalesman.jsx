import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useParams } from "react-router-dom";
import salesmanService from "../../../api/services/salesmanService";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import { useToast } from "../../../context/ToastContext";

const commissionSchema = z
  .union([z.string(), z.number()])
  .transform((value) => {
    if (value === "" || value === null || value === undefined) return 0;
    return Number(value);
  })
  .refine((value) => !Number.isNaN(value), "Enter a valid number")
  .refine((value) => value >= 0 && value <= 100, "Must be between 0 and 100");

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.union([z.string().trim().email("Email must be valid"), z.literal("")]),
  phone_number: z.string().trim(),
  commission_on_sales: commissionSchema,
  commission_on_recovery: commissionSchema,
});

const defaultValues = {
  name: "",
  email: "",
  phone_number: "",
  commission_on_sales: 0,
  commission_on_recovery: 0,
};

const CreateUpdateSalesman = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editingId = id || "";
  const [loadingRecord, setLoadingRecord] = useState(Boolean(id));

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  useEffect(() => {
    if (!id) {
      setLoadingRecord(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadingRecord(true);
      try {
        const response = await salesmanService.getById(id);
        const record = response.data || response;
        if (cancelled) return;
        form.reset({
          name: record.name || "",
          email: record.email || "",
          phone_number: record.phone_number || "",
          commission_on_sales: Number(record.commission_on_sales || 0),
          commission_on_recovery: Number(record.commission_on_recovery || 0),
        });
      } catch {
        if (!cancelled) {
          toast.error("Failed to load salesman");
          navigate("/salesmen", { replace: true });
        }
      } finally {
        if (!cancelled) setLoadingRecord(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, form, navigate, toast]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const payload = {
        ...values,
        email: values.email || null,
      };

      if (editingId) {
        await salesmanService.update(editingId, payload);
        toast.success("Salesman updated");
      } else {
        await salesmanService.create(payload);
        toast.success("Salesman created");
      }
      navigate("/salesmen");
    } catch (submitError) {
      toast.error(submitError?.response?.data?.message || "Save failed");
    }
  });

  return (
    <section className="space-y-6">
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {editingId ? "Edit Salesman" : "Create Salesman"}
            </h2>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/salesmen")}
          >
            Back to list
          </Button>
        </div>

        {loadingRecord ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : (
          <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
            <FormInput
              label="Name"
              required
              placeholder="Enter salesman name"
              error={form.formState.errors.name?.message}
              {...form.register("name")}
            />
            <FormInput
              label="Email"
              placeholder="Enter email"
              error={form.formState.errors.email?.message}
              {...form.register("email")}
            />
            <FormInput
              label="Phone Number"
              placeholder="Enter phone number"
              error={form.formState.errors.phone_number?.message}
              {...form.register("phone_number")}
            />
            <FormInput
              label="Commission on Sales (%)"
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="e.g. 5 for 5%"
              error={form.formState.errors.commission_on_sales?.message}
              {...form.register("commission_on_sales")}
            />
            <FormInput
              label="Commission on Recovery (%)"
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="e.g. 3 for 3%"
              error={form.formState.errors.commission_on_recovery?.message}
              {...form.register("commission_on_recovery")}
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 md:col-span-2">
              {editingId
                ? "Salesman code cannot be changed after creation."
                : "A unique code (for example SM-00001) is generated automatically when you save."}
            </div>
            <div className="flex justify-end md:col-span-2">
              <Button type="submit">
                {editingId ? "Update Salesman" : "Save Salesman"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </section>
  );
};

export default CreateUpdateSalesman;
