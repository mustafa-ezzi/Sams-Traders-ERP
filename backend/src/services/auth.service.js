import jwt from "jsonwebtoken";
import { HttpError } from "../utils/httpError.js";

const getTenantCredentials = (tenantId) => {
  if (tenantId === "SAMS_TRADERS") {
    return {
      email: process.env.SAMS_LOGIN_EMAIL || "sams@test.com",
      password: process.env.SAMS_LOGIN_PASSWORD || "sams123",
    };
  }

  return {
    email: process.env.AM_LOGIN_EMAIL || "am@test.com",
    password: process.env.AM_LOGIN_PASSWORD || "amtraders123",
  };
};

export const login = async ({ email, password, tenantId }) => {
  if (!process.env.JWT_SECRET) {
    throw new HttpError(500, "JWT_SECRET is missing in environment");
  }

  const validCredentials = getTenantCredentials(tenantId);
  if (email !== validCredentials.email || password !== validCredentials.password) {
    throw new HttpError(401, "Invalid credentials");
  }

  const token = jwt.sign(
    {
      email,
      tenant_id: tenantId,
    },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );

  return {
    token,
    user: {
      email,
      tenantId,
    },
  };
};

