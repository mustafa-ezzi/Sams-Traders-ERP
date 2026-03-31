const variants = {
  primary:
    "border border-blue-500 bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-[0_18px_30px_-18px_rgba(37,99,235,0.85)] hover:from-blue-500 hover:to-cyan-400",
  secondary:
    "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
  danger:
    "border border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100",
  ghost:
    "border border-transparent bg-transparent text-slate-600 hover:bg-slate-100",
};

const Button = ({
  type = "button",
  variant = "primary",
  className = "",
  ...props
}) => (
  <button
    type={type}
    className={`inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
    {...props}
  />
);

export default Button;
