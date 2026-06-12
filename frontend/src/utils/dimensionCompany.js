export const dimensionToCompanyConfig = (dimension) => ({
  name: dimension?.name?.trim() || "",
  address: dimension?.address?.trim() || "",
  phone: dimension?.phone_number?.trim() || "",
  email: dimension?.email?.trim() || "",
  ntn: dimension?.ntn_number?.trim() || "",
  code: dimension?.code || "",
});

export const dimensionPrintInitials = (dimension) => {
  const name = dimension?.name?.trim() || dimension?.code || "?";
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};
