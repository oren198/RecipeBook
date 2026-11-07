const FRACTIONS: [number, string][] = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.375, "⅜"],
  [0.5, "½"],
  [0.625, "⅝"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
  [0.875, "⅞"],
];

export function prettyNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  const negative = value < 0;
  const absolute = Math.abs(value);
  const rounded = Math.round(absolute * 1000) / 1000;
  const whole = Math.floor(rounded + 1e-9);
  const fraction = rounded - whole;
  let text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  for (const [amount, symbol] of FRACTIONS) {
    if (Math.abs(fraction - amount) < 0.02) {
      text = whole > 0 ? `${whole} ${symbol}` : symbol;
      break;
    }
  }
  return negative ? `-${text}` : text;
}

export function formatAmount(amount: number | null, amountMax: number | null): string | null {
  if (amount == null) return null;
  const start = prettyNumber(amount);
  if (amountMax != null && Math.abs(amountMax - amount) > 0.001) {
    return `${start}–${prettyNumber(amountMax)}`;
  }
  return start;
}

export function formatMinutes(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (minutes < 60) return `${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} שע׳`;
  return `${hours} שע׳ ${rest} דק׳`;
}

export function scaleAmount(amount: number | null, factor: number): number | null {
  if (amount == null || !Number.isFinite(factor)) return amount;
  return Math.round(amount * factor * 1000) / 1000;
}
