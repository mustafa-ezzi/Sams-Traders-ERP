import { ZodError } from "zod";
import {
  openingStockBodySchema,
  openingStockListQuerySchema,
} from "../validations/openingStock.validation.js";
import {
  createOpeningStock,
  deleteOpeningStock,
  getOpeningStockById,
  getOpeningStocks,
  updateOpeningStock,
} from "../services/openingStock.service.js";
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

export const createOpeningStockHandler = async (req, res) => {
  try {
    const data = openingStockBodySchema.parse(req.body);
    const openingStock = await createOpeningStock(req.user.tenant_id, data);

    res.status(201).json({ data: openingStock });
  } catch (error) {
    handleError(res, error);
  }
};

export const getOpeningStocksHandler = async (req, res) => {
  try {
    const query = openingStockListQuerySchema.parse(req.query);
    const response = await getOpeningStocks(req.user.tenant_id, query);

    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
};

export const getOpeningStockByIdHandler = async (req, res) => {
  try {
    const openingStock = await getOpeningStockById(req.user.tenant_id, req.params.id);

    res.status(200).json({ data: openingStock });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateOpeningStockHandler = async (req, res) => {
  try {
    const data = openingStockBodySchema.parse(req.body);
    const openingStock = await updateOpeningStock(
      req.user.tenant_id,
      req.params.id,
      data
    );

    res.status(200).json({ data: openingStock });
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteOpeningStockHandler = async (req, res) => {
  try {
    await deleteOpeningStock(req.user.tenant_id, req.params.id);

    res.status(200).json({
      data: null,
      message: "Opening stock deleted successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
};
