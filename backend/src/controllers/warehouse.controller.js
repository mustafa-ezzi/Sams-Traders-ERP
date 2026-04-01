import { ZodError } from "zod";
import {
  warehouseBodySchema,
  warehouseListQuerySchema,
} from "../validations/warehouse.validation.js";
import {
  createWarehouse,
  deleteWarehouse,
  getWarehouseById,
  getWarehouses,
  updateWarehouse,
} from "../services/warehouse.service.js";
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

export const createWarehouseHandler = async (req, res) => {
  try {
    const data = warehouseBodySchema.parse(req.body);
    const warehouse = await createWarehouse(req.user.tenant_id, data);

    res.status(201).json({ data: warehouse });
  } catch (error) {
    handleError(res, error);
  }
};

export const getWarehousesHandler = async (req, res) => {
  try {
    const query = warehouseListQuerySchema.parse(req.query);
    const response = await getWarehouses(req.user.tenant_id, query);

    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
};

export const getWarehouseByIdHandler = async (req, res) => {
  try {
    const warehouse = await getWarehouseById(req.user.tenant_id, req.params.id);

    res.status(200).json({ data: warehouse });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateWarehouseHandler = async (req, res) => {
  try {
    const data = warehouseBodySchema.parse(req.body);
    const warehouse = await updateWarehouse(req.user.tenant_id, req.params.id, data);

    res.status(200).json({ data: warehouse });
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteWarehouseHandler = async (req, res) => {
  try {
    await deleteWarehouse(req.user.tenant_id, req.params.id);

    res.status(200).json({
      data: null,
      message: "Warehouse deleted successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
};
