/** 金额换算：人类可读字符串 ↔ 链上最小单位 */

/** 十进制输入 → 最小单位；非法或精度超限返回 null */
export function parseUnits(input: string, decimals: number): bigint | null {
  const s = input.trim();
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return null;
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) return null;
  try {
    return BigInt((whole || "0") + frac.padEnd(decimals, "0"));
  } catch {
    return null;
  }
}

/** 最小单位 → 可读字符串（去掉尾部多余的 0） */
export function formatUnits(amount: bigint, decimals: number | null): string {
  if (decimals == null) return amount.toString();
  const d = 10n ** BigInt(decimals);
  const whole = amount / d;
  const frac = amount % d;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

/* ---------- 交易价格 / 数量 ----------
 *
 * 链上 settlement 的 `quote_amount = price * quantity`，
 * 所以 price / quantity 都是最小单位（u64）：
 *   quantity = base 最小单位
 *   price    = quote 最小单位 / base 最小单位
 * 人类价格与链上 price 相差 10^(quoteDecimals - baseDecimals)。
 */

function toBigInt(value: number | bigint): bigint {
  return typeof value === "bigint" ? value : BigInt(Math.round(value));
}

/** 价格的小数位数：可能为负（base 精度高于 quote 时） */
export function priceDecimals(
  baseDecimals: number | null,
  quoteDecimals: number | null
): number | null {
  if (baseDecimals == null || quoteDecimals == null) return null;
  return quoteDecimals - baseDecimals;
}

/** 链上 u64 price → 人类可读字符串 */
export function formatPrice(
  raw: number | bigint,
  baseDecimals: number | null,
  quoteDecimals: number | null
): string {
  const n = toBigInt(raw);
  const d = priceDecimals(baseDecimals, quoteDecimals);
  if (d == null) return n.toString();
  if (d >= 0) return formatUnits(n, d);
  return (n * 10n ** BigInt(-d)).toString();
}

/** 链上 u64 quantity（base 最小单位）→ 人类可读字符串 */
export function formatQty(
  raw: number | bigint,
  baseDecimals: number | null
): string {
  return formatUnits(toBigInt(raw), baseDecimals);
}

/** 人类价格输入 → 链上 u64 price；无法用整数表示时返回 null */
export function parsePrice(
  input: string,
  baseDecimals: number,
  quoteDecimals: number
): bigint | null {
  const d = quoteDecimals - baseDecimals;
  // raw = human × 10^d
  if (d >= 0) return parseUnits(input, d);
  // d < 0：raw = human / 10^(-d)，人类价格必须是整数且能被 10^(-d) 整除
  const whole = parseUnits(input, 0);
  if (whole == null) return null;
  const unit = 10n ** BigInt(-d);
  return whole % unit === 0n ? whole / unit : null;
}

/** 人类数量输入（base）→ 链上 u64 quantity */
export function parseQty(input: string, baseDecimals: number): bigint | null {
  return parseUnits(input, baseDecimals);
}
