const CompanyPrintFooter = ({ company }) => {
  const address = company?.address || "";
  const phone = company?.phone || "";
  const email = company?.email || "";
  const ntn = company?.ntn || "";

  if (!address && !phone && !email && !ntn) {
    return (
      <footer className="border-t border-slate-100 bg-slate-50 px-8 py-5 text-center">
        <p className="text-sm font-semibold text-slate-700">
          Thank you for your business!
        </p>
      </footer>
    );
  }

  return (
    <footer className="border-t border-slate-100 bg-slate-50 px-8 py-5 text-center text-sm text-slate-600">
      {address ? (
        <p className="whitespace-pre-wrap font-medium text-slate-700">{address}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {phone ? <span>Contact: {phone}</span> : null}
        {email ? <span>{email}</span> : null}
        {ntn ? <span>NTN: {ntn}</span> : null}
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">
        Thank you for your business!
      </p>
    </footer>
  );
};

export default CompanyPrintFooter;
