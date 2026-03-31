const Card = ({ className = "", children }) => (
  <div
    className={`rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl ${className}`}
  >
    {children}
  </div>
);

export default Card;
