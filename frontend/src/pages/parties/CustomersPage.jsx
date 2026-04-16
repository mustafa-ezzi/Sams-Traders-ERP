import { useEffect, useMemo, useState } from "react";
import PartyCrudPage from "../../components/PartyCrudPage";
import customerService from "../../api/services/customerService";
import accountService from "../../api/services/accountService";
import { flattenAccountTree } from "../../utils/accounts";
import { useToast } from "../../context/ToastContext";

const CustomersPage = () => {
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
        toast.error("Failed to load receivable account options");
      } finally {
        setLoadingAccounts(false);
      }
    };

    loadAccounts();
  }, []);

  const accountOptions = useMemo(
    () =>
      flattenAccountTree(accounts).filter(
        (account) => account.account_group === "ASSET" && account.is_postable
      ),
    [accounts]
  );

  return (
    <PartyCrudPage
      title="Customers"
      service={customerService}
      accountLabel="Receivable Account"
      accountOptions={accountOptions}
      loadingAccounts={loadingAccounts}
    />
  );
};

export default CustomersPage;
