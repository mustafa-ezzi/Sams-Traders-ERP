import { useAuth } from "./AuthContext";

const TenantGuard = ({ allow, children, fallback = null }) => {
  const { tenantId } = useAuth();

  if (!allow.includes(tenantId)) {
    return fallback;
  }

  return children;
};

export default TenantGuard;

