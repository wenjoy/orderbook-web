import type { LocalOrder } from "../types";
import { formatPrice, formatQty } from "../lib/amount";

interface Props {
  orders: LocalOrder[];
  user: string;
  baseDecimals: number | null;
  quoteDecimals: number | null;
  onCancel: (id: number) => Promise<void>;
}

export function OpenOrders({
  orders,
  user,
  baseDecimals,
  quoteDecimals,
  onCancel,
}: Props) {
  const mine = orders.filter((o) => o.user === user && o.remaining > 0);

  return (
    <div className="panel flex h-fit flex-col overflow-hidden">
      <div className="panel-title">Open Orders · {user || "—"}</div>
      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {mine.length === 0 && (
          <p className="px-3 py-4 text-center text-gray-600">No open orders</p>
        )}
        {mine.map((o) => (
          <div
            key={o.id}
            className="flex items-center justify-between gap-2 border-b border-surface-3 px-3 py-1.5"
          >
            <div>
              <span
                className={
                  o.side === "Bid" ? "text-bid" : "text-ask"
                }
              >
                {o.side === "Bid" ? "BUY" : "SELL"}
              </span>{" "}
              <span className="text-gray-300">
                {formatQty(o.remaining, baseDecimals)} @{" "}
                {formatPrice(o.price, baseDecimals, quoteDecimals)}
              </span>
              <span className="ml-2 text-gray-600">#{o.id}</span>
            </div>
            <button
              type="button"
              className="btn-ghost py-0.5 text-[10px]"
              onClick={() => onCancel(o.id)}
            >
              Cancel
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
