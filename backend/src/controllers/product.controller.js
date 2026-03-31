import { ZodError } from "zod";
import {
  productBodySchema,
  productListQuerySchema,
} from "../validations/product.validation.js";
import {
  createProduct,
  deleteProduct,
  getProductById,
  getProducts,
  updateProduct,
} from "../services/product.service.js";
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

export const createProductHandler = async (req, res) => {
  try {
    const data = productBodySchema.parse(req.body);
    const product = await createProduct(req.user.tenant_id, data);

    res.status(201).json({ data: product });
  } catch (error) {
    handleError(res, error);
  }
};

export const getProductsHandler = async (req, res) => {
  try {
    const query = productListQuerySchema.parse(req.query);
    const response = await getProducts(req.user.tenant_id, query);

    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
};

export const getProductByIdHandler = async (req, res) => {
  try {
    const product = await getProductById(req.user.tenant_id, req.params.id);

    res.status(200).json({ data: product });
  } catch (error) {
    handleError(res, error);
  }
};

export const updateProductHandler = async (req, res) => {
  try {
    const data = productBodySchema.parse(req.body);
    const product = await updateProduct(req.user.tenant_id, req.params.id, data);

    res.status(200).json({ data: product });
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteProductHandler = async (req, res) => {
  try {
    await deleteProduct(req.user.tenant_id, req.params.id);

    res.status(200).json({
      data: null,
      message: "Product deleted successfully",
    });
  } catch (error) {
    handleError(res, error);
  }
};
