import { ZodError } from "zod";
import { buildErrorResponse } from "../utils/httpError.js";
import { loginBodySchema } from "../validations/auth.validation.js";
import { login } from "../services/auth.service.js";

export const loginHandler = async (req, res) => {
  try {
    const data = loginBodySchema.parse(req.body);
    const response = await login(data);
    res.status(200).json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: true,
        message: "Validation failed",
        details: error.flatten(),
      });
      return;
    }

    const { statusCode, body } = buildErrorResponse(error);
    res.status(statusCode).json(body);
  }
};

