export function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(" ");
}

/**
 * Splits an array into chunks of at most `size` elements.
 * Returns an empty array when given an empty input.
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
