import express from "express";
import {
  createBrandHandler,
  deleteBrandHandler,
  getBrandByIdHandler,
  getBrandsHandler,
  updateBrandHandler,
} from "../controllers/brand.prisma.controller.js";

const router = express.Router();

router.post("/", createBrandHandler);
router.get("/", getBrandsHandler);
router.get("/:id", getBrandByIdHandler);
router.put("/:id", updateBrandHandler);
router.delete("/:id", deleteBrandHandler);

export default router;