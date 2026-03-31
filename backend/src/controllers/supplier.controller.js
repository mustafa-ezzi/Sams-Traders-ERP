import { ZodError } from "zod";
import {
  createParty,
  deleteParty,
  getParties,
  getPartyById,
  updateParty,
} from "../services/party.service.js";
import {
  partyBodySchema,
  partyListQuerySchema,
} from "../validations/party.validation.js";
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

export const createSupplierHandler = async (req, res) => {
  try {
    const data = partyBodySchema.parse(req.body);
    const supplier = await createParty("supplier", req.user.tenant_id, data);
    res.status(201).json({ data: supplier });
  } catch (error) {
    handleError(res, error);
  }
};

export const getSuppliersHandler = async (req, res) => {
  try {
    const query = partyListQuerySchema.parse(req.query);
    const response = await getParties("supplier", req.user.tenant_id, query);
    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
};

export const getSupplierByIdHandler = async (req, res) => {
  try {
    const supplier = await getPartyById("supplier", req.user.tenant_id, req.params.id);
    res.status(200).json({ data: supplier });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateSupplierHandler = async (req, res) => {
  try {
    const data = partyBodySchema.parse(req.body);
    const supplier = await updateParty(
      "supplier",
      req.user.tenant_id,
      req.params.id,
      data
    );
    res.status(200).json({ data: supplier });
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteSupplierHandler = async (req, res) => {
  try {
    await deleteParty("supplier", req.user.tenant_id, req.params.id);
    res.status(200).json({
      data: null,
      message: "Supplier deleted successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
};
