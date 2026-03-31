import Card from "./ui/Card";

const StateView = ({ loading, error, isEmpty, emptyMessage, children }) => {
  if (loading) {
    return (
      <Card className="flex min-h-32 items-center justify-center text-sm font-medium text-slate-500">
        Loading data...
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50/90 text-sm font-medium text-rose-700">
        {error}
      </Card>
    );
  }

  if (isEmpty) {
    return (
      <Card className="flex min-h-32 items-center justify-center text-sm font-medium text-slate-500">
        {emptyMessage}
      </Card>
    );
  }

  return children;
};

export default StateView;
