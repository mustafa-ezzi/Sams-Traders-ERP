import Card from "../../components/ui/Card";
import AuditLogTable from "../../components/audit/AuditLogTable";

const ActivityLogPage = () => (
  <div className="space-y-6">
    <Card className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Activity log
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Audit of logins and core create / update / delete actions across your
          organization.
        </p>
      </div>
      <AuditLogTable />
    </Card>
  </div>
);

export default ActivityLogPage;
