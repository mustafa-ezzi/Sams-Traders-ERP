import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
  {
    brand: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },

    size: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Size",
      required: true,
    },

    purchase_unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
    },

    selling_unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
    },

    purchase_price: {
      type: Number,
      required: true,
      min: 0,
    },

    selling_price: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true } // each item gets its own id
);

const rawMaterialSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    items: [itemSchema], // 🔥 array of items
  },
  { timestamps: true }
);

export default mongoose.model("RawMaterial", rawMaterialSchema);