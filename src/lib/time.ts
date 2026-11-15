/** 时间展示：统一用本地时间的 HH:MM:SS，完整时间放 title 里 */
export function formatClock(input: number | string | null | undefined): string {
  if (input == null) return "—";
  const ms = typeof input === "number" ? input : Date.parse(input);
  // 后端历史记录里有些 timestamp 是 0（1970），按未知处理
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 完整本地时间，用于 hover 提示 */
export function formatDateTime(input: number | string | null | undefined): string {
  if (input == null) return "";
  const ms = typeof input === "number" ? input : Date.parse(input);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return new Date(ms).toLocaleString();
}
