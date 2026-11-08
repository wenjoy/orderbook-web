import { useState } from "react";
import type { Side } from "../types";

/** 余额比较的浮点容差 */
const EPS = 1e-9;

const fmtNum = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 6 });

/** 按方向校验「所需数量」是否超过交易账户余额 */
function checkBalance(
  side: Side,
  price: number,
  quantity: number,
  maxBase: number | null,
  maxQuote: number | null
): string | null {
  if (side === "Bid" && maxQuote != null) {
    // 买单花的是 quote：price × quantity
    const cost = price * quantity;
    if (cost > maxQuote + EPS) {
      return `Insufficient quote balance: need ${fmtNum(cost)}, available ${fmtNum(maxQuote)}`;
    }
  }
  if (side === "Ask" && maxBase != null) {
    // 卖单花的是 base：quantity
    if (quantity > maxBase + EPS) {
      return `Insufficient base balance: need ${fmtNum(quantity)}, available ${fmtNum(maxBase)}`;
    }
  }
  return null;
}

export function OrderFormControlled({
  user,
  price,
  setPrice,
  side,
  setSide,
  busy,
  onSubmit,
  maxBase,
  maxQuote,
}: {
  user: string;
  price: string;
  setPrice: (v: string) => void;
  side: Side;
  setSide: (s: Side) => void;
  busy: boolean;
  onSubmit: (p: { side: Side; price: number; quantity: number }) => Promise<void>;
  /** 交易账户可用余额（人类单位）；null 表示未知，跳过校验 */
  maxBase: number | null;
  maxQuote: number | null;
}) {
  const [qty, setQty] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const p = Number(price);
  const q = Number(qty);
  const validNumbers = Number.isFinite(p) && p > 0 && Number.isFinite(q) && q > 0;
  // 实时提示余额不足（其它校验留到提交时）
  const balanceError = validNumbers
    ? checkBalance(side, p, q, maxBase, maxQuote)
    : null;

  const submit = async () => {
    setError(null);
    if (!user.trim()) {
      setError("Set a user / pubkey first");
      return;
    }
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q <= 0) {
      setError("Price and quantity must be positive numbers");
      return;
    }
    const limited = checkBalance(side, p, q, maxBase, maxQuote);
    if (limited) {
      setError(limited);
      return;
    }
    try {
      await onSubmit({ side, price: p, quantity: q });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const available =
    side === "Bid"
      ? maxQuote == null
        ? "—"
        : fmtNum(maxQuote)
      : maxBase == null
        ? "—"
        : fmtNum(maxBase);

  return (
    <div className="panel">
      <div className="panel-title">Place Order</div>
      <div className="space-y-3 p-3">
        {/* Bid / Ask 用 radio 切换 */}
        <div
          className="flex items-center gap-5 rounded-md border border-surface-3 bg-surface px-3 py-2"
          role="radiogroup"
          aria-label="Order side"
        >
          {(["Bid", "Ask"] as const).map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-1.5 text-xs font-medium"
            >
              <input
                type="radio"
                name="order-side"
                value={s}
                checked={side === s}
                onChange={() => setSide(s)}
                className={`h-3.5 w-3.5 cursor-pointer ${s === "Bid" ? "accent-[#3fb950]" : "accent-[#f85149]"
                  }`}
              />
              <span
                className={
                  side === s
                    ? s === "Bid"
                      ? "text-bid"
                      : "text-ask"
                    : "text-gray-400"
                }
              >
                {s}
              </span>
            </label>
          ))}
        </div>

        <div>
          <label className="label">Price</label>
          <input
            className="input"
            value={price}
            type="number"
            min="0.01"
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Quantity</label>
          <input
            className="input"
            value={qty}
            type="number"
            onChange={(e) => setQty(e.target.value)}
          />
        </div>

        <p className="text-[10px] text-gray-500">
          Available {side === "Bid" ? "quote" : "base"}:{" "}
          <span className="font-mono">{available}</span>
          {validNumbers && side === "Bid" && (
            <>
              {" "}· cost <span className="font-mono">{fmtNum(p * q)}</span>
            </>
          )}
        </p>

        {(balanceError ?? error) && (
          <p className="text-xs text-ask">{balanceError ?? error}</p>
        )}

        <button
          type="button"
          disabled={busy || balanceError != null}
          className={side === "Bid" ? "btn-bid w-full" : "btn-ask w-full"}
          onClick={submit}
        >
          {busy ? "Sending…" : side === "Bid" ? "Bid limit" : "Ask limit"}
        </button>
        <p className="text-[10px] text-gray-500">
          Click orderbook rows to fill price · user{" "}
          <span className="font-mono text-gray-400">{user || "—"}</span>
        </p>
      </div>
    </div>
  );
}
