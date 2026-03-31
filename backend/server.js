import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import prisma from "./src/lib/prisma.js";
import { authenticateTenant } from "./src/middlewares/authenticateTenant.js";
import rawMaterialRoutes from "./src/routes/rawMaterial.routes.js";
import productRoutes from "./src/routes/product.routes.js";
import customerRoutes from "./src/routes/customer.routes.js";
import supplierRoutes from "./src/routes/supplier.routes.js";
import authRoutes from "./src/routes/auth.routes.js";
import unitRoutes from "./src/routes/unitRoutes.js";
import sizeRoutes from "./src/routes/sizeRoutes.js";
import categoryRoutes from "./src/routes/categoryRoutes.js";
import brandRoutes from "./src/routes/brandRoutes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/v1/auth", authRoutes);

app.use("/api/v1/raw-materials", authenticateTenant, rawMaterialRoutes);
app.use("/api/v1/products", authenticateTenant, productRoutes);
app.use("/api/v1/customers", authenticateTenant, customerRoutes);
app.use("/api/v1/suppliers", authenticateTenant, supplierRoutes);
app.use("/api/v1/units", authenticateTenant, unitRoutes);
app.use("/api/v1/sizes", authenticateTenant, sizeRoutes);
app.use("/api/v1/categories", authenticateTenant, categoryRoutes);
app.use("/api/v1/brands", authenticateTenant, brandRoutes);

app.get("/", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.send("API + DB Running");
  } catch (error) {
    res.status(500).send("DB not connected");
  }
});

app.get("/test-db", async (req, res) => {
  try {
    const units = await prisma.unit.findMany({
      where: {
        deletedAt: null,
      },
      take: 5,
    });

    res.json({ data: units });
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message,
      details: {},
    });
  }
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
