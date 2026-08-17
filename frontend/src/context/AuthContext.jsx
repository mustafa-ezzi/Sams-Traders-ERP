import { createContext, useContext, useMemo, useReducer } from "react";
import authService from "../api/services/authService";
import { codesFromDimensions } from "../api/viewTenants";

const AuthContext = createContext(null);

const getTokenExpiration = (token) => {
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.exp ? payload.exp * 1000 : null;
  } catch (error) {
    console.warn("Failed to decode expiration from token:", error);
    return null;
  }
};

const isTokenExpired = (token) => {
  const expiration = getTokenExpiration(token);
  if (!expiration) return false;
  return Date.now() >= expiration;
};

/** When present on the JWT, these override localStorage (keeps nav in sync after deploy / refresh). */
const readTenantClaimsFromToken = (token) => {
  if (!token) return null;
  try {
    const p = JSON.parse(atob(token.split(".")[1]));
    if (!("is_tenant_child" in p)) return null;
    return {
      isTenantChild: Boolean(p.is_tenant_child),
      uiPermissions: Array.isArray(p.ui_permissions) ? p.ui_permissions : [],
      tenantRole: typeof p.tenant_role === "string" ? p.tenant_role : "",
    };
  } catch {
    return null;
  }
};

const storedToken = localStorage.getItem("token") || "";
const storedTenantId = localStorage.getItem("tenantId") || "";
const storedAllowedDimensions = (() => {
  try {
    return JSON.parse(localStorage.getItem("allowedDimensions") || "[]");
  } catch {
    return [];
  }
})();
const storedCreateTenantIds = codesFromDimensions(
  storedAllowedDimensions,
  storedTenantId,
);

const storedIsTenantChild = localStorage.getItem("isTenantChild") === "true";
const storedUiPermissions = (() => {
  try {
    return JSON.parse(localStorage.getItem("uiPermissions") || "[]");
  } catch {
    return [];
  }
})();
const storedTenantRole = localStorage.getItem("tenantRole") || "";

const jwtTenantClaims = readTenantClaimsFromToken(storedToken);

const initialState = {
  token: storedToken,
  tenantId: storedTenantId,
  allowedDimensions: storedAllowedDimensions,
  createTenantIds: storedCreateTenantIds,
  isTenantChild: jwtTenantClaims ? jwtTenantClaims.isTenantChild : storedIsTenantChild,
  uiPermissions: jwtTenantClaims ? jwtTenantClaims.uiPermissions : storedUiPermissions,
  tenantRole: jwtTenantClaims ? jwtTenantClaims.tenantRole : storedTenantRole,
};

const reducer = (state, action) => {
  switch (action.type) {
    case "LOGIN": {
      const {
        token,
        tenantId,
        allowedDimensions = [],
        isTenantChild = false,
        uiPermissions = [],
        tenantRole = "",
      } = action.payload;
      localStorage.setItem("token", token);
      localStorage.setItem("tenantId", tenantId);
      localStorage.setItem("allowedDimensions", JSON.stringify(allowedDimensions || []));
      const viewTenantIds = codesFromDimensions(allowedDimensions, tenantId);
      localStorage.setItem("isTenantChild", isTenantChild ? "true" : "false");
      localStorage.setItem("uiPermissions", JSON.stringify(uiPermissions || []));
      localStorage.setItem("tenantRole", tenantRole || "");
      localStorage.setItem("createTenantIds", JSON.stringify(viewTenantIds));
      return {
        ...state,
        token,
        tenantId: tenantId || "",
        allowedDimensions: allowedDimensions || [],
        createTenantIds: viewTenantIds,
        isTenantChild: Boolean(isTenantChild),
        uiPermissions: uiPermissions || [],
        tenantRole: tenantRole || "",
      };
    }
    case "LOGOUT":
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("tenantId");
      localStorage.removeItem("allowedDimensions");
      localStorage.removeItem("createTenantIds");
      localStorage.removeItem("isTenantChild");
      localStorage.removeItem("uiPermissions");
      localStorage.removeItem("tenantRole");
      return {
        ...state,
        token: "",
        tenantId: "",
        allowedDimensions: [],
        createTenantIds: [],
        isTenantChild: false,
        uiPermissions: [],
        tenantRole: "",
      };
    case "SET_TENANT":
      localStorage.setItem("tenantId", action.payload);
      return {
        ...state,
        tenantId: action.payload,
      };
    case "SET_ALLOWED_DIMENSIONS":
      {
        const nextDimensions = action.payload || [];
        const nextCreateTenantIds = codesFromDimensions(
          nextDimensions,
          state.tenantId,
        );
        localStorage.setItem("allowedDimensions", JSON.stringify(nextDimensions));
        localStorage.setItem("createTenantIds", JSON.stringify(nextCreateTenantIds));
        return {
          ...state,
          allowedDimensions: nextDimensions,
          createTenantIds: nextCreateTenantIds,
        };
      }
    case "SET_CREATE_TENANTS":
      {
        const nextCreateTenantIds = [...new Set((action.payload || []).filter(Boolean))];
        localStorage.setItem("createTenantIds", JSON.stringify(nextCreateTenantIds));
        return { ...state, createTenantIds: nextCreateTenantIds };
      }
    default:
      return state;
  }
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const logout = () => {
    void authService.logout().finally(() => {
      dispatch({ type: "LOGOUT" });
      window.location.href = "/login";
    });
  };

  const value = useMemo(
    () => ({
      token: state.token,
      tenantId: state.tenantId,
      allowedDimensions: state.allowedDimensions,
      createTenantIds: state.createTenantIds,
      isTenantChild: state.isTenantChild,
      uiPermissions: state.uiPermissions,
      tenantRole: state.tenantRole,
      isAuthenticated: !!state.token && !isTokenExpired(state.token),
      login: ({
        token,
        tenantId,
        allowedDimensions = [],
        isTenantChild,
        uiPermissions,
        tenantRole,
      }) => {
        const fromJwt = readTenantClaimsFromToken(token);
        const resolvedChild =
          typeof isTenantChild === "boolean"
            ? isTenantChild
            : (fromJwt?.isTenantChild ?? false);
        const resolvedPerms =
          Array.isArray(uiPermissions) && uiPermissions.length
            ? uiPermissions
            : (fromJwt?.uiPermissions ?? uiPermissions ?? []);
        const resolvedRole =
          (tenantRole !== undefined && tenantRole !== null && tenantRole !== "")
            ? tenantRole
            : (fromJwt?.tenantRole ?? tenantRole ?? "");

        dispatch({
          type: "LOGIN",
          payload: {
            token,
            tenantId: tenantId || "",
            allowedDimensions,
            isTenantChild: resolvedChild,
            uiPermissions: Array.isArray(resolvedPerms) ? resolvedPerms : [],
            tenantRole: resolvedRole || "",
          },
        });
      },
      logout,
      isTokenExpired: (token) => isTokenExpired(token || state.token),
      setTenant: (tenantId) => dispatch({ type: "SET_TENANT", payload: tenantId }),
      setAllowedDimensions: (items) =>
        dispatch({ type: "SET_ALLOWED_DIMENSIONS", payload: items || [] }),
      setCreateTenants: (items) =>
        dispatch({ type: "SET_CREATE_TENANTS", payload: items || [] }),
    }),
    [
      state.token,
      state.tenantId,
      state.allowedDimensions,
      state.createTenantIds,
      state.isTenantChild,
      state.uiPermissions,
      state.tenantRole,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
