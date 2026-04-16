import { useEffect, useMemo, useState } from "react";
import PartyCrudPage from "../../components/PartyCrudPage";
import supplierService from "../../api/services/supplierService";
import accountService from "../../api/services/accountService";
import { flattenAccountTree } from "../../utils/accounts";
import { useToast } from "../../context/ToastContext";

const SuppliersPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const loadAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const response = await accountService.list();
        setAccounts(response || []);
      } catch {
        toast.error("Failed to load payable account options");
      } finally {
        setLoadingAccounts(false);
      }
    };

    loadAccounts();
  }, []);

  const accountOptions = useMemo(
    () =>
      flattenAccountTree(accounts).filter(
        (account) => account.account_group === "LIABILITY" && account.is_postable
      ),
    [accounts]
  );

  return (
    <PartyCrudPage
      title="Suppliers"
      service={supplierService}
      accountLabel="Payable Account"
      accountOptions={accountOptions}
      loadingAccounts={loadingAccounts}
    />
  );
};

export default SuppliersPage;
