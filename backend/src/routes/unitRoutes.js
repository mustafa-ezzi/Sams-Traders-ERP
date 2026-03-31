import express from "express";
import {
  createUnitHandler,
  deleteUnitHandler,
  getUnitByIdHandler,
  getUnitsHandler,
  updateUnitHandler,
} from "../controllers/unit.prisma.controller.js";

const router = express.Router();

router.post("/", createUnitHandler);
router.get("/", getUnitsHandler);
router.get("/:id", getUnitByIdHandler);
router.put("/:id", updateUnitHandler);
router.delete("/:id", deleteUnitHandler);

export default router;