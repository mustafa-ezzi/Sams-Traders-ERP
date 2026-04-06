import { createContext, useContext, useMemo, useReducer } from "react";

const AuthContext = createContext(null);

const decodeTenantFromToken = (token) => {
  if (!token) return "";

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.tenant_id || payload?.tenantId || "";
  } catch {
    return "";
  }
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

  const value = useMemo(
    () => ({
      token: state.token,
      tenantId: state.tenantId,
      login: (token, tenantId) =>
        dispatch({
          type: "LOGIN",
          payload: {
            token,
            tenantId: decodeTenantFromToken(token) || tenantId,
          },
        }),
      logout: () => dispatch({ type: "LOGOUT" }),
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
