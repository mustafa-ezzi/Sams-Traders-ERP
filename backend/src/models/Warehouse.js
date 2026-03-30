import mongoose from "mongoose";

const warehouseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    location: {
      type: String,
      required: true,
      trim: true,
    },

    // 🔥 multi-tenant support (VERY IMPORTANT for SaaS)
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // or Tenant model later
      required: true,
    },
  },
  { timestamps: true }
);

// ✅ unique per tenant (same name allowed in different tenants)
warehouseSchema.index({ name: 1, tenant: 1 }, { unique: true });

export default mongoose.model("Warehouse", warehouseSchema);