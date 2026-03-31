import express from "express";
import {
  createSizeHandler,
  deleteSizeHandler,
  getSizeByIdHandler,
  getSizesHandler,
  updateSizeHandler,
} from "../controllers/size.prisma.controller.js";

const router = express.Router();

router.post("/", createSizeHandler);
router.get("/", getSizesHandler);
router.get("/:id", getSizeByIdHandler);
router.put("/:id", updateSizeHandler);
router.delete("/:id", deleteSizeHandler);

export default router;