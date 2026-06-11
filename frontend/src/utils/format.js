export const formatDecimal = (value) => {
  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return "0.00";
  }

  return numberValue.toFixed(2);
};

/** Default PDF / browser save-as filename for a sales invoice print. */
export const salesInvoicePdfTitle = (invoiceNumber) => {
  const code = String(invoiceNumber ?? "").trim() || "Draft";
  return `Sams Enterprise - INV# ${code}`;
};

/** e.g. 30000 -> "30,000.00", 300000 -> "300,000.00" */
export const formatMoney = (value) => {
  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return "0.00";
  }

  return numberValue.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const BELOW_TWENTY = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

const chunkToWords = (n) => {
  if (n === 0) return "";
  if (n < 20) return BELOW_TWENTY[n];
  if (n < 100) {
    const remainder = n % 10;
    return remainder
      ? `${TENS[Math.floor(n / 10)]} ${BELOW_TWENTY[remainder]}`
      : TENS[Math.floor(n / 10)];
  }
  const remainder = n % 100;
  const head = `${BELOW_TWENTY[Math.floor(n / 100)]} Hundred`;
  return remainder ? `${head} ${chunkToWords(remainder)}` : head;
};

const integerToWords = (n) => {
  if (n === 0) return "Zero";

  const scales = [
    { value: 1_000_000_000, label: "Billion" },
    { value: 1_000_000, label: "Million" },
    { value: 1_000, label: "Thousand" },
  ];

  let remaining = n;
  const parts = [];

  for (const scale of scales) {
    if (remaining >= scale.value) {
      const count = Math.floor(remaining / scale.value);
      remaining %= scale.value;
      parts.push(`${chunkToWords(count)} ${scale.label}`);
    }
  }

  if (remaining > 0) {
    parts.push(chunkToWords(remaining));
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
};

/** e.g. 30000 -> "Rupees Thirty Thousand Only" */
export const amountInWords = (value, currencyLabel = "Rupees") => {
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) {
    return `${currencyLabel} Zero Only`;
  }

  const rounded = Math.round(numberValue * 100) / 100;
  const whole = Math.floor(Math.abs(rounded));
  const fraction = Math.round((Math.abs(rounded) - whole) * 100);

  let words = integerToWords(whole);

  if (fraction > 0) {
    words = `${words} and ${integerToWords(fraction)} Paisa`;
  }

  return `${currencyLabel} ${words} Only`;
};

