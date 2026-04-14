import { createContext, useContext, useMemo, useReducer } from "react";

const AuthContext = createContext(null);

const decodeTenantFromToken = (token) => {
  if (!token) return "";

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // Backend injects tenant_id into JWT payload at login
    return payload?.tenant_id || payload?.tenantId || "";
  } catch (error) {
    console.warn("Failed to decode tenant from token:", error);
    return "";
  }
};

const getTokenExpiration = (token) => {
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // JWT exp is in seconds, convert to milliseconds
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
const storedTenantId =
  decodeTenantFromToken(storedToken) ||
  localStorage.getItem("tenantId") ||
  "SAMS_TRADERS";

const initialState = {
  token: storedToken,
  tenantId: storedTenantId,
};

const reducer = (state, action) => {
  switch (action.type) {
    case "LOGIN":
      localStorage.setItem("token", action.payload.token);
      localStorage.setItem("tenantId", action.payload.tenantId);
      return { ...state, ...action.payload };
    case "LOGOUT":
      localStorage.removeItem("token");
      localStorage.removeItem("tenantId");
      return { ...state, token: "", tenantId: "SAMS_TRADERS" };
    case "SET_TENANT":
      localStorage.setItem("tenantId", action.payload);
      return { ...state, tenantId: action.payload };
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
      isAuthenticated: !!state.token && !isTokenExpired(state.token),
      login: (token, tenantId) => {
        // Prefer tenant_id decoded from JWT (backend injects it), fall back to provided tenantId
        const decodedTenant = decodeTenantFromToken(token);
        dispatch({
          type: "LOGIN",
          payload: {
            token,
            tenantId: decodedTenant || tenantId,
          },
        });
      },
      logout,
      isTokenExpired: (token) => isTokenExpired(token || state.token),
      setTenant: (tenantId) => dispatch({ type: "SET_TENANT", payload: tenantId }),
    }),
    [state.token, state.tenantId]
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
