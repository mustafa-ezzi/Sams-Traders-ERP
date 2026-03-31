import { ZodError } from "zod";
import { buildErrorResponse } from "../utils/httpError.js";
import {
  categoryBodySchema,
  categoryListQuerySchema,
} from "../validations/category.validation.js";
import {
  createCategory,
  deleteCategory,
  getCategories,
  getCategoryById,
  updateCategory,
} from "../services/category.service.js";

const handleError = (res, error) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: true, message: "Validation failed", details: error.flatten() });
    return;
  }
  const { statusCode, body } = buildErrorResponse(error);
  res.status(statusCode).json(body);
};

export const createCategoryHandler = async (req, res) => {
  try {
    const data = categoryBodySchema.parse(req.body);
    const record = await createCategory(req.user.tenant_id, data);
    res.status(201).json({ data: record });
  } catch (error) {
    handleError(res, error);
  }
};

export const getCategoriesHandler = async (req, res) => {
  try {
    const query = categoryListQuerySchema.parse(req.query);
    const response = await getCategories(req.user.tenant_id, query);
    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
};

export const getCategoryByIdHandler = async (req, res) => {
  try {
    const record = await getCategoryById(req.user.tenant_id, req.params.id);
    res.status(200).json({ data: record });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateCategoryHandler = async (req, res) => {
  try {
    const data = categoryBodySchema.parse(req.body);
    const record = await updateCategory(req.user.tenant_id, req.params.id, data);
    res.status(200).json({ data: record });
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteCategoryHandler = async (req, res) => {
  try {
    await deleteCategory(req.user.tenant_id, req.params.id);
    res.status(200).json({ data: null, message: "Category deleted successfully" });
  } catch (error) {
    handleError(res, error);
  }
};

