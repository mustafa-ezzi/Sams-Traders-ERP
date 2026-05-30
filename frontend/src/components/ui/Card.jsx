const Card = ({ className = "", children }) => (
  <div className={`theme-surface p-5 ${className}`}>{children}</div>
);

export default Card;
