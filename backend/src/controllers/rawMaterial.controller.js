import { ZodError } from "zod";
import {
  rawMaterialBodySchema,
  rawMaterialListQuerySchema,
} from "../validations/rawMaterial.validation.js";
import {
  createRawMaterial,
  deleteRawMaterial,
  getRawMaterialById,
  getRawMaterials,
  updateRawMaterial,
} from "../services/rawMaterial.service.js";
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

export const createRawMaterialHandler = async (req, res) => {
  try {
    const data = rawMaterialBodySchema.parse(req.body);
    const rawMaterial = await createRawMaterial(req.user.tenant_id, data);

    res.status(201).json({ data: rawMaterial });
  } catch (error) {
    handleError(res, error);
  }
};

export const getRawMaterialsHandler = async (req, res) => {
  try {
    const query = rawMaterialListQuerySchema.parse(req.query);
    const response = await getRawMaterials(req.user.tenant_id, query);

    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
};

export const getRawMaterialByIdHandler = async (req, res) => {
  try {
    const rawMaterial = await getRawMaterialById(
      req.user.tenant_id,
      req.params.id
    );

    res.status(200).json({ data: rawMaterial });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateRawMaterialHandler = async (req, res) => {
  try {
    const data = rawMaterialBodySchema.parse(req.body);
    const rawMaterial = await updateRawMaterial(
      req.user.tenant_id,
      req.params.id,
      data
    );

    res.status(200).json({ data: rawMaterial });
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteRawMaterialHandler = async (req, res) => {
  try {
    await deleteRawMaterial(req.user.tenant_id, req.params.id);

    res.status(200).json({
      data: null,
      message: "Raw material deleted successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
};
