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

const initialState = {
  token: storedToken,
  tenantId: storedTenantId,
  allowedDimensions: storedAllowedDimensions,
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
      return { ...state, ...action.payload };
    case "LOGOUT":
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("tenantId");
      localStorage.removeItem("allowedDimensions");
      return { ...state, token: "", tenantId: "", allowedDimensions: [] };
    case "SET_TENANT":
      localStorage.setItem("tenantId", action.payload);
      return { ...state, tenantId: action.payload };
    case "SET_ALLOWED_DIMENSIONS":
      localStorage.setItem("allowedDimensions", JSON.stringify(action.payload || []));
      return { ...state, allowedDimensions: action.payload || [] };
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
      isAuthenticated: !!state.token && !isTokenExpired(state.token),
      login: (token, tenantId, allowedDimensions = []) => {
        dispatch({
          type: "LOGIN",
          payload: {
            token,
            tenantId: tenantId || "",
            allowedDimensions,
          },
        });
      },
      logout,
      isTokenExpired: (token) => isTokenExpired(token || state.token),
      setTenant: (tenantId) => dispatch({ type: "SET_TENANT", payload: tenantId }),
      setAllowedDimensions: (items) =>
        dispatch({ type: "SET_ALLOWED_DIMENSIONS", payload: items || [] }),
    }),
    [state.token, state.tenantId, state.allowedDimensions]
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
