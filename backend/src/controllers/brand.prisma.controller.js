import { ZodError } from "zod";
import { buildErrorResponse } from "../utils/httpError.js";
import { brandBodySchema, brandListQuerySchema } from "../validations/brand.validation.js";
import {
  createBrand,
  deleteBrand,
  getBrandById,
  getBrands,
  updateBrand,
} from "../services/brand.service.js";

const handleError = (res, error) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: true, message: "Validation failed", details: error.flatten() });
    return;
  }
  const { statusCode, body } = buildErrorResponse(error);
  res.status(statusCode).json(body);
};

export const createBrandHandler = async (req, res) => {
  try {
    const data = brandBodySchema.parse(req.body);
    const record = await createBrand(req.user.tenant_id, data);
    res.status(201).json({ data: record });
  } catch (error) {
    handleError(res, error);
  }
};

export const getBrandsHandler = async (req, res) => {
  try {
    const query = brandListQuerySchema.parse(req.query);
    const response = await getBrands(req.user.tenant_id, query);
    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
};

export const getBrandByIdHandler = async (req, res) => {
  try {
    const record = await getBrandById(req.user.tenant_id, req.params.id);
    res.status(200).json({ data: record });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateBrandHandler = async (req, res) => {
  try {
    const data = brandBodySchema.parse(req.body);
    const record = await updateBrand(req.user.tenant_id, req.params.id, data);
    res.status(200).json({ data: record });
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteBrandHandler = async (req, res) => {
  try {
    await deleteBrand(req.user.tenant_id, req.params.id);
    res.status(200).json({ data: null, message: "Brand deleted successfully" });
  } catch (error) {
    handleError(res, error);
  }
};

