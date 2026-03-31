export const formatDecimal = (value) => {
  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return "0.00";
  }

  return numberValue.toFixed(2);
};

