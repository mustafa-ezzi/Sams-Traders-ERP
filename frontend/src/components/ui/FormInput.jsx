const FormInput = ({
  label,
  required = false,
  error,
  as = "input",
  className = "",
  ...props
}) => {
  const Component = as;

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <Component className={`theme-input ${className}`} {...props} />
      {error && (
        <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
};

export default FormInput;
