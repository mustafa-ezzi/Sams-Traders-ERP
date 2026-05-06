import { createContext, useContext, useMemo, useReducer } from "react";

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

const storedToken = localStorage.getItem("token") || "";
const storedTenantId = localStorage.getItem("tenantId") || "";
const storedAllowedDimensions = (() => {
  try {
    return JSON.parse(localStorage.getItem("allowedDimensions") || "[]");
  } catch {
    return [];
  }
})();
const storedCreateTenantIds = (() => {
  try {
    const parsed = JSON.parse(localStorage.getItem("createTenantIds") || "null");
    if (Array.isArray(parsed) && parsed.length) {
      return [...new Set(parsed.filter(Boolean))];
    }
  } catch {
    // ignore malformed local storage and fall back to active tenant
  }
  return storedTenantId ? [storedTenantId] : [];
})();

const initialState = {
  token: storedToken,
  tenantId: storedTenantId,
  allowedDimensions: storedAllowedDimensions,
  createTenantIds: storedCreateTenantIds,
};

const reducer = (state, action) => {
  switch (action.type) {
    case "LOGIN":
      localStorage.setItem("token", action.payload.token);
      localStorage.setItem("tenantId", action.payload.tenantId);
      localStorage.setItem(
        "allowedDimensions",
        JSON.stringify(action.payload.allowedDimensions || [])
      );
      localStorage.setItem(
        "createTenantIds",
        JSON.stringify(
          action.payload.createTenantIds?.length
            ? [...new Set(action.payload.createTenantIds.filter(Boolean))]
            : action.payload.tenantId
              ? [action.payload.tenantId]
              : []
        )
      );
      return { ...state, ...action.payload };
    case "LOGOUT":
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("tenantId");
      localStorage.removeItem("allowedDimensions");
      localStorage.removeItem("createTenantIds");
      return { ...state, token: "", tenantId: "", allowedDimensions: [], createTenantIds: [] };
    case "SET_TENANT":
      localStorage.setItem("tenantId", action.payload);
      {
        const nextCreateTenantIds = [
          ...new Set([action.payload, ...state.createTenantIds].filter(Boolean)),
        ];
        localStorage.setItem("createTenantIds", JSON.stringify(nextCreateTenantIds));
        return {
          ...state,
          tenantId: action.payload,
          createTenantIds: nextCreateTenantIds,
        };
      }
    case "SET_ALLOWED_DIMENSIONS":
      localStorage.setItem("allowedDimensions", JSON.stringify(action.payload || []));
      return { ...state, allowedDimensions: action.payload || [] };
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
    dispatch({ type: "LOGOUT" });
    window.location.href = "/login";
  };

  const value = useMemo(
    () => ({
      token: state.token,
      tenantId: state.tenantId,
      allowedDimensions: state.allowedDimensions,
      createTenantIds: state.createTenantIds,
      isAuthenticated: !!state.token && !isTokenExpired(state.token),
      login: (token, tenantId, allowedDimensions = [], createTenantIds = []) => {
        dispatch({
          type: "LOGIN",
          payload: {
            token,
            tenantId: tenantId || "",
            allowedDimensions,
            createTenantIds:
              createTenantIds.length
                ? [...new Set(createTenantIds.filter(Boolean))]
                : tenantId
                  ? [tenantId]
                  : [],
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
    [state.token, state.tenantId, state.allowedDimensions, state.createTenantIds]
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
