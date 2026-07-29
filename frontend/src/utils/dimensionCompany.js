/**
 * Resolve company letterhead fields from a dimension record.
 * Logos: Sams / SAM → sam logo; AM → am logo (files in /public).
 */
export const dimensionLogoSrc = (dimension) => {
  const code = String(dimension?.code || "").trim().toUpperCase();
  const name = String(dimension?.name || "").trim().toUpperCase();
  const sku = String(dimension?.sku_code || "").trim().toUpperCase();
  const blob = `${code} ${name} ${sku}`;

  if (
    code === "SAMS" ||
    code === "SAM" ||
    /\bSAMS\b/.test(blob) ||
    /\bSAM\b/.test(blob)
  ) {
    return encodeURI("/sam logo.jpg");
  }
  if (code === "AM" || /(^|\s)AM(\s|$)/.test(blob)) {
    return encodeURI("/am logo.jpg");
  }
  return "/logo.png";
};

export const dimensionToCompanyConfig = (dimension) => ({
  name: dimension?.name?.trim() || "",
  address: dimension?.address?.trim() || "",
  phone: dimension?.phone_number?.trim() || "",
  email: dimension?.email?.trim() || "",
  ntn: dimension?.ntn_number?.trim() || "",
  code: dimension?.code || "",
  logo: dimensionLogoSrc(dimension),
  logoUrl: dimensionLogoSrc(dimension),
});

export const dimensionPrintInitials = (dimension) => {
  const name = dimension?.name?.trim() || dimension?.code || "?";
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};
