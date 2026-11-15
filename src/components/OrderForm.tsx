import { useState } from "react";
import type { Side } from "../types";
import { formatUnits, parsePrice, parseQty } from "../lib/amount";

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** 最小单位 → 带千分位的人类可读字符串 */
function fmtAmount(raw: bigint, decimals: number | null): string {
  const s = formatUnits(raw, decimals);
  const [whole, frac] = s.split(".");
  const grouped = BigInt(whole || "0").toLocaleString("en-US");
  return frac ? `${grouped}.${frac}` : grouped;
}

/** 按方向校验余额：内部用最小单位比较，和链上结算完全一致 */
function checkBalance(
  side: Side,
  priceRaw: bigint,
  qtyRaw: bigint,
  maxBaseRaw: bigint,
  maxQuoteRaw: bigint,
  baseDecimals: number | null,
  quoteDecimals: number | null
): string | null {
  if (side === "Bid") {
    // 买单花的是 quote：price × quantity
    const cost = priceRaw * qtyRaw;
    if (cost > maxQuoteRaw) {
      return `Insufficient quote balance: need ${fmtAmount(
        cost,
        quoteDecimals
      )}, available ${fmtAmount(maxQuoteRaw, quoteDecimals)}`;
    }
    return null;
  }
  // 卖单花的是 base：quantity
  if (qtyRaw > maxBaseRaw) {
    return `Insufficient base balance: need ${fmtAmount(
      qtyRaw,
      baseDecimals
    )}, available ${fmtAmount(maxBaseRaw, baseDecimals)}`;
  }
  return null;
}

/**
 * 下单表单：用户只看到人类单位（1、10、0.5 …）。
 * 提交前在内部换算成链上 u64：
 *   quantity_raw = qty × 10^baseDecimals
 *   price_raw    = price × 10^(quoteDecimals − baseDecimals)
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

  const priceRaw = decimalsKnown
    ? parsePrice(price, baseDecimals, quoteDecimals)
    : null;
  const qtyRaw = baseDecimals != null ? parseQty(qty, baseDecimals) : null;

  const withinSafe =
    priceRaw != null &&
    qtyRaw != null &&
    priceRaw > 0n &&
    qtyRaw > 0n &&
    priceRaw <= MAX_SAFE &&
    qtyRaw <= MAX_SAFE;

  // 实时提示输入/余额问题（其它校验留到提交时）
  const inputError = (() => {
    if (!decimalsKnown) return "Loading market data…";
    if (price.trim()) {
      if (priceRaw == null) return "Invalid price";
      if (priceRaw <= 0n) return "Price must be greater than 0";
    }
    if (qty.trim()) {
      if (qtyRaw == null) return "Invalid quantity";
      if (qtyRaw <= 0n) return "Quantity must be greater than 0";
    }
    return null;
  })();

  const balanceError =
    withinSafe && priceRaw != null && qtyRaw != null
      ? checkBalance(
          side,
          priceRaw,
          qtyRaw,
          maxBaseRaw,
          maxQuoteRaw,
          baseDecimals,
          quoteDecimals
        )
      : null;

  const submit = async () => {
    setError(null);
    if (!user.trim()) {
      setError("Set a user / pubkey first");
      return;
    }
    if (!decimalsKnown) {
      setError("Market data is still loading");
      return;
    }
    if (!priceRaw || !qtyRaw || priceRaw <= 0n || qtyRaw <= 0n) {
      setError(inputError ?? "Enter a valid price and quantity");
      return;
    }
    if (priceRaw > MAX_SAFE || qtyRaw > MAX_SAFE) {
      setError("Order size is too large");
      return;
    }
    const limited = checkBalance(
      side,
      priceRaw,
      qtyRaw,
      maxBaseRaw,
      maxQuoteRaw,
      baseDecimals,
      quoteDecimals
    );
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
    side === "Bid"
      ? fmtAmount(maxQuoteRaw, quoteDecimals)
      : fmtAmount(maxBaseRaw, baseDecimals);
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
          <label className="label">Price</label>
          <input
            className="input"
            value={price}
            type="text"
            inputMode="decimal"
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Quantity</label>
          <input
            className="input"
            value={qty}
            type="text"
            inputMode="decimal"
            onChange={(e) => setQty(e.target.value)}
          />
        </div>

        <p className="text-[10px] text-gray-500">
          Available {side === "Bid" ? "quote" : "base"}:{" "}
          <span className="font-mono">{available}</span>
          {side === "Bid" && cost != null && cost > 0n && (
            <>
              {" "}· cost{" "}
              <span className="font-mono">
                {fmtAmount(cost, quoteDecimals)}
              </span>
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
