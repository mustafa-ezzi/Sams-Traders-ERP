import { ZodError } from "zod";
import {
  unitBodySchema,
  unitListQuerySchema,
} from "../validations/unit.validation.js";
import {
  createUnit,
  deleteUnit,
  getUnitById,
  getUnits,
  updateUnit,
} from "../services/unit.service.js";
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

export const createUnitHandler = async (req, res) => {
  try {
    const data = unitBodySchema.parse(req.body);
    const unit = await createUnit(req.user.tenant_id, data);

    res.status(201).json({ data: unit });
  } catch (error) {
    handleError(res, error);
  }
};

export const getUnitsHandler = async (req, res) => {
  try {
    const query = unitListQuerySchema.parse(req.query);
    const response = await getUnits(req.user.tenant_id, query);

    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
};

export const getUnitByIdHandler = async (req, res) => {
  try {
    const unit = await getUnitById(req.user.tenant_id, req.params.id);

    res.status(200).json({ data: unit });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateUnitHandler = async (req, res) => {
  try {
    const data = unitBodySchema.parse(req.body);
    const unit = await updateUnit(req.user.tenant_id, req.params.id, data);

    res.status(200).json({ data: unit });
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteUnitHandler = async (req, res) => {
  try {
    await deleteUnit(req.user.tenant_id, req.params.id);

    res.status(200).json({
      data: null,
      message: "Unit deleted successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
};

