import { useState } from "react";
import type { Side } from "../types";
import { parsePrice, parseQty, priceDecimals } from "../lib/amount";

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

const fmtBig = (n: bigint) => n.toLocaleString("en-US");

/** 按方向校验余额：全部用链上最小单位直接比较（与结算完全一致） */
function checkBalance(
  side: Side,
  priceRaw: bigint,
  qtyRaw: bigint,
  maxBaseRaw: bigint,
  maxQuoteRaw: bigint
): string | null {
  if (side === "Bid") {
    // 买单花的是 quote：price × quantity
    const cost = priceRaw * qtyRaw;
    if (cost > maxQuoteRaw) {
      return `Insufficient quote balance: need ${fmtBig(cost)}, available ${fmtBig(maxQuoteRaw)}`;
    }
  }
  if (side === "Ask") {
    // 卖单花的是 base：quantity
    if (qtyRaw > maxBaseRaw) {
      return `Insufficient base balance: need ${fmtBig(qtyRaw)}, available ${fmtBig(maxBaseRaw)}`;
    }
  }
  return null;
}

/**
 * 下单表单。
 *
 *   quantity —— 纯整数（u64），原样提交，不做 decimal 换算
 *   price    —— 人类价格，按 10^(quoteDecimals − baseDecimals) 换算成链上 u64
 *
 * 链上结算按 quote = price × quantity 计算，余额校验也直接用最小单位比较。
 */
export function OrderFormControlled({
  user,
  price,
  setPrice,
  side,
  setSide,
  busy,
  onSubmit,
  baseDecimals,
  quoteDecimals,
  maxBaseRaw,
  maxQuoteRaw,
}: {
  user: string;
  price: string;
  setPrice: (v: string) => void;
  side: Side;
  setSide: (s: Side) => void;
  busy: boolean;
  onSubmit: (p: { side: Side; price: number; quantity: number }) => Promise<void>;
  /** base / quote mint 精度；null 表示还未拿到，此时禁用提交 */
  baseDecimals: number | null;
  quoteDecimals: number | null;
  /** 交易账户可用余额（最小单位） */
  maxBaseRaw: bigint;
  maxQuoteRaw: bigint;
}) {
  const [qty, setQty] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const decimalsKnown = baseDecimals != null && quoteDecimals != null;
  const priceScale = priceDecimals(baseDecimals, quoteDecimals);
  const priceInDecimals = priceScale == null ? 0 : Math.max(0, priceScale);

  const priceRaw = decimalsKnown
    ? parsePrice(price, baseDecimals, quoteDecimals)
    : null;
  const qtyRaw = parseQty(qty);

  const withinSafe =
    priceRaw != null &&
    qtyRaw != null &&
    priceRaw > 0n &&
    qtyRaw > 0n &&
    priceRaw <= MAX_SAFE &&
    qtyRaw <= MAX_SAFE;

  // 实时提示输入/余额问题（其它校验留到提交时）
  const inputError = (() => {
    if (!decimalsKnown) return "Waiting for mint decimals…";
    if (price.trim()) {
      if (priceRaw == null) {
        return priceInDecimals > 0
          ? `Price must be a number with at most ${priceInDecimals} decimals`
          : "Price must be an integer for this market";
      }
      if (priceRaw <= 0n) return "Price must be greater than 0";
    }
    if (qty.trim()) {
      if (qtyRaw == null) return "Quantity must be a whole number";
      if (qtyRaw <= 0n) return "Quantity must be greater than 0";
    }
    return null;
  })();

  const balanceError =
    withinSafe && priceRaw != null && qtyRaw != null
      ? checkBalance(side, priceRaw, qtyRaw, maxBaseRaw, maxQuoteRaw)
      : null;

  const submit = async () => {
    setError(null);
    if (!user.trim()) {
      setError("Set a user / pubkey first");
      return;
    }
    if (!decimalsKnown) {
      setError("Trading account decimals not loaded yet");
      return;
    }
    if (!priceRaw || !qtyRaw || priceRaw <= 0n || qtyRaw <= 0n) {
      setError(
        inputError ??
        "Price and quantity must be positive numbers within the market precision"
      );
      return;
    }
    if (priceRaw > MAX_SAFE || qtyRaw > MAX_SAFE) {
      setError("Order size is too large");
      return;
    }
    const limited = checkBalance(side, priceRaw, qtyRaw, maxBaseRaw, maxQuoteRaw);
    if (limited) {
      setError(limited);
      return;
    }
    try {
      // 交给后端的始终是最小单位的整数
      await onSubmit({
        side,
        price: Number(priceRaw),
        quantity: Number(qtyRaw),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const available =
    side === "Bid" ? fmtBig(maxQuoteRaw) : fmtBig(maxBaseRaw);
  const cost = priceRaw != null && qtyRaw != null ? priceRaw * qtyRaw : null;

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
          <label className="label">
            Price
            <span className="ml-1 text-gray-500">
              ({priceInDecimals > 0 ? `${priceInDecimals} decimals max` : "integer"})
            </span>
          </label>
          <input
            className="input"
            value={price}
            type="number"
            min="0"
            step={priceInDecimals > 0 ? 1 / 10 ** priceInDecimals : 1}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div>
          <label className="label">
            Quantity
            <span className="ml-1 text-gray-500">
              ({baseDecimals ?? "?"} decimals max)
            </span>
          </label>          <input
            className="input"
            value={qty}
            type="number"
            min="0"
            onChange={(e) => setQty(e.target.value)}
          />
        </div>

        <p className="text-[10px] text-gray-500">
          Available {side === "Bid" ? "quote" : "base"}:{" "}
          <span className="font-mono">{available}</span>
          {side === "Bid" && cost != null && cost > 0n && (
            <>
              {" "}· cost <span className="font-mono">{fmtBig(cost)}</span>
            </>
          )}
        </p>

        {(inputError ?? balanceError ?? error) && (
          <p className="text-xs text-ask">
            {inputError ?? balanceError ?? error}
          </p>
        )}

        <button
          type="button"
          disabled={
            busy ||
            !decimalsKnown ||
            inputError != null ||
            balanceError != null ||
            !withinSafe
          }
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
