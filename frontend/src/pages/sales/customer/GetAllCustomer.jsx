import { useEffect, useMemo, useState } from "react";
import PartyCrudPage from "../../../components/PartyCrudPage";
import customerService from "../../../api/services/customerService";
import accountService from "../../../api/services/accountService";
import { flattenAccountTree } from "../../../utils/accounts";
import { useToast } from "../../../context/ToastContext";
const GetAllCustomer = () => {
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
  }, [toast]);
  const accountOptions = useMemo(
    () =>
      flattenAccountTree(accounts).filter(
        (account) => account.account_group === "ASSET" && account.is_postable,
      ),
    [accounts],
  );
  return (
    <PartyCrudPage
      view="list"
      basePath="/customers"
      title="Customers"
      partyType="customer"
      service={customerService}
      accountLabel="Receivable Account"
      accountOptions={accountOptions}
      loadingAccounts={loadingAccounts}
    />
  );
};
export default GetAllCustomer;
