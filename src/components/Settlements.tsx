import type { SettlementJob, SettlementStatus } from "../types";
import { formatPrice, formatQty } from "../lib/amount";

interface Props {
  jobs: SettlementJob[];
  baseDecimals: number | null;
  quoteDecimals: number | null;
}

const statusColor: Record<SettlementStatus, string> = {
  pending: "text-yellow-400",
  simulated: "text-accent",
  submitted: "text-purple-400",
  confirmed: "text-bid",
  failed: "text-ask",
};

export function Settlements({ jobs, baseDecimals, quoteDecimals }: Props) {
  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="panel-title">Settlements</div>
      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {jobs.length === 0 && (
          <p className="px-3 py-4 text-center text-gray-600">
            No settlements yet — match an order to create one
          </p>
        )}
        {jobs.map((j) => (
          <div
            key={j.id}
            className="border-b border-surface-3 px-3 py-2 hover:bg-surface-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-gray-400">#{j.id}</span>
              <span className={statusColor[j.status] ?? "text-gray-400"}>
                {j.status}
              </span>
            </div>
            <div className="mt-0.5 text-gray-300">
              {formatQty(j.trade.quantity)} @{" "}
              {formatPrice(j.trade.price, baseDecimals, quoteDecimals)}{" "}
              <span className="text-gray-600">
                {j.trade.taker_user} ← {j.trade.maker_user}
              </span>
            </div>
            {j.signature && (
              <div className="mt-0.5 truncate text-[10px] text-gray-600">
                sig {j.signature}
              </div>
            )}
            <div>
              {j.error && (
                <div className="mt-0.5 truncate text-[10px] text-orange-400 overflow-auto flex-wrap text-wrap">
                  error: {j.error}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
