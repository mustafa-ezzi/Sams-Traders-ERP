import mongoose from "mongoose";

const productMaterialSchema = new mongoose.Schema(
  {
    raw_material: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RawMaterial",
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: [0.0001, "Quantity must be greater than 0"],
    },

    rate: {
      type: Number,
      required: true,
      min: [0, "Rate cannot be negative"],
    },

    amount: {
      type: Number,
      default: 0, // will be calculated
    },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    product_type: {
      type: String,
      enum: ["READY_MADE", "MANUFACTURED"],
      required: true,
    },

    packaging_cost: {
      type: Number,
      required: true,
      min: [0, "Packaging cost cannot be negative"],
    },

    net_amount: {
      type: Number,
      default: 0, // calculated
    },

    materials: [productMaterialSchema], // 🔥 line items
  },
  { timestamps: true }
);