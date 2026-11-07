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
