import { ZodError } from "zod";
import {
  sizeBodySchema,
  sizeListQuerySchema,
} from "../validations/size.validation.js";
import {
  createSize,
  deleteSize,
  getSizeById,
  getSizes,
  updateSize,
} from "../services/size.service.js";
import { buildErrorResponse } from "../utils/httpError.js";

const handleError = (res, error) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: true,
      message: "Validation failed",
      details: error.flatten(),
    });
  }

  const { statusCode, body } = buildErrorResponse(error);
  return res.status(statusCode).json(body);
};

export const createSizeHandler = async (req, res) => {
  try {
    const data = sizeBodySchema.parse(req.body);
    const size = await createSize(req.user.tenant_id, data);

    res.status(201).json({ data: size });
  } catch (error) {
    handleError(res, error);
  }
};

export const getSizesHandler = async (req, res) => {
  try {
    const query = sizeListQuerySchema.parse(req.query);
    const response = await getSizes(req.user.tenant_id, query);

    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
};

export const getSizeByIdHandler = async (req, res) => {
  try {
    const size = await getSizeById(req.user.tenant_id, req.params.id);

    res.status(200).json({ data: size });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateSizeHandler = async (req, res) => {
  try {
    const data = sizeBodySchema.parse(req.body);
    const size = await updateSize(req.user.tenant_id, req.params.id, data);

    res.status(200).json({ data: size });
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteSizeHandler = async (req, res) => {
  try {
    await deleteSize(req.user.tenant_id, req.params.id);

    res.status(200).json({
      data: null,
      message: "Size deleted successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
};

