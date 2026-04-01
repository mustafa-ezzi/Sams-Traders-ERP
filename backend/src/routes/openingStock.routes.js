import express from "express";
import {
  createOpeningStockHandler,
  deleteOpeningStockHandler,
  getOpeningStockByIdHandler,
  getOpeningStocksHandler,
  updateOpeningStockHandler,
} from "../controllers/openingStock.controller.js";

const router = express.Router();

router.post("/", createOpeningStockHandler);
router.get("/", getOpeningStocksHandler);
router.get("/:id", getOpeningStockByIdHandler);
router.put("/:id", updateOpeningStockHandler);
router.delete("/:id", deleteOpeningStockHandler);

export default router;
