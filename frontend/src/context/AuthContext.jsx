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
const storedTenantId = localStorage.getItem("tenantId") || "SAMS_TRADERS";

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
      localStorage.removeItem("refreshToken");
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
        dispatch({
          type: "LOGIN",
          payload: {
            token,
            tenantId: tenantId || "SAMS_TRADERS",
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
