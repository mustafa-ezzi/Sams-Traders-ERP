import jwt from "jsonwebtoken";
import { HttpError } from "../utils/httpError.js";

const validTenantIds = new Set(["SAMS_TRADERS", "AM_TRADERS"]);

export const authenticateTenant = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new HttpError(401, "Authentication token is required");
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const tenantId = decoded?.tenant_id ?? decoded?.tenantId;

    if (!tenantId || !validTenantIds.has(tenantId)) {
      throw new HttpError(403, "A valid tenant_id is required in the JWT");
    }

    req.user = {
      ...decoded,
      tenant_id: tenantId,
    };

    next();
  } catch (error) {
    res.status(error.statusCode || 401).json({
      error: true,
      message: error.message || "Unauthorized",
      details: {},
    });
  }
};
