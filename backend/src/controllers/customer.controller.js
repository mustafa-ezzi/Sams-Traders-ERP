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

export const createCustomerHandler = async (req, res) => {
  try {
    const data = partyBodySchema.parse(req.body);
    const customer = await createParty("customer", req.user.tenant_id, data);
    res.status(201).json({ data: customer });
  } catch (error) {
    handleError(res, error);
  }
};

export const getCustomersHandler = async (req, res) => {
  try {
    const query = partyListQuerySchema.parse(req.query);
    const response = await getParties("customer", req.user.tenant_id, query);
    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
};

export const getCustomerByIdHandler = async (req, res) => {
  try {
    const customer = await getPartyById("customer", req.user.tenant_id, req.params.id);
    res.status(200).json({ data: customer });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateCustomerHandler = async (req, res) => {
  try {
    const data = partyBodySchema.parse(req.body);
    const customer = await updateParty(
      "customer",
      req.user.tenant_id,
      req.params.id,
      data
    );
    res.status(200).json({ data: customer });
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteCustomerHandler = async (req, res) => {
  try {
    await deleteParty("customer", req.user.tenant_id, req.params.id);
    res.status(200).json({
      data: null,
      message: "Customer deleted successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
};
