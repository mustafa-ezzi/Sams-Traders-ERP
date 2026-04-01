import express from "express";
import {
  createWarehouseHandler,
  deleteWarehouseHandler,
  getWarehouseByIdHandler,
  getWarehousesHandler,
  updateWarehouseHandler,
} from "../controllers/warehouse.controller.js";

const router = express.Router();

router.post("/", createWarehouseHandler);
router.get("/", getWarehousesHandler);
router.get("/:id", getWarehouseByIdHandler);
router.put("/:id", updateWarehouseHandler);
router.delete("/:id", deleteWarehouseHandler);

export default router;
