import express from "express";
import {
  createRawMaterialHandler,
  deleteRawMaterialHandler,
  getRawMaterialByIdHandler,
  getRawMaterialsHandler,
  updateRawMaterialHandler,
} from "../controllers/rawMaterial.controller.js";

const router = express.Router();

router.post("/", createRawMaterialHandler);
router.get("/", getRawMaterialsHandler);
router.get("/:id", getRawMaterialByIdHandler);
router.put("/:id", updateRawMaterialHandler);
router.delete("/:id", deleteRawMaterialHandler);

export default router;
