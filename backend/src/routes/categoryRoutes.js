import express from "express";
import {
  createCategoryHandler,
  deleteCategoryHandler,
  getCategoriesHandler,
  getCategoryByIdHandler,
  updateCategoryHandler,
} from "../controllers/category.prisma.controller.js";

const router = express.Router();

router.post("/", createCategoryHandler);
router.get("/", getCategoriesHandler);
router.get("/:id", getCategoryByIdHandler);
router.put("/:id", updateCategoryHandler);
router.delete("/:id", deleteCategoryHandler);

export default router;