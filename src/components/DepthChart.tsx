import type { DepthLevel } from "../types";
import { formatPrice, formatQty } from "../lib/amount";

interface Props {
  bids: DepthLevel[];
  asks: DepthLevel[];
  baseDecimals: number | null;
  quoteDecimals: number | null;
}

/** Simple horizontal depth bars (no extra chart lib) */
export function DepthChart({ bids, asks, baseDecimals, quoteDecimals }: Props) {
  const max = Math.max(
    1,
    ...bids.map((b) => b.quantity),
    ...asks.map((a) => a.quantity)
  );
  const levels = 8;
  const topBids = bids.slice(0, levels);
  const topAsks = asks.slice(0, levels);

  return (
    <div className="panel flex h-fit flex-col overflow-hidden">
      <div className="panel-title">Depth</div>
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase text-bid">Bids</p>
          {topBids.map((l) => (
            <Bar
              key={`b-${l.price}`}
              level={l}
              max={max}
              color="bg-bid"
              baseDecimals={baseDecimals}
              quoteDecimals={quoteDecimals}
            />
          ))}
          {topBids.length === 0 && (
            <p className="text-xs text-gray-600">—</p>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase text-ask">Asks</p>
          {topAsks.map((l) => (
            <Bar
              key={`a-${l.price}`}
              level={l}
              max={max}
              color="bg-ask"
              baseDecimals={baseDecimals}
              quoteDecimals={quoteDecimals}
            />
          ))}
          {topAsks.length === 0 && (
            <p className="text-xs text-gray-600">—</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Bar({
  level,
  max,
  color,
  baseDecimals,
  quoteDecimals,
}: {
  level: DepthLevel;
  max: number;
  color: string;
  baseDecimals: number | null;
  quoteDecimals: number | null;
}) {
  const w = Math.max(4, (level.quantity / max) * 100);
  return (
    <div className="flex items-center gap-2 font-mono text-[10px]">
      <span className="w-16 shrink-0 truncate text-gray-400">
        {formatPrice(level.price, baseDecimals, quoteDecimals)}
      </span>
      <div className="h-2 flex-1 rounded-sm bg-surface-2">
        <div className={`h-2 rounded-sm ${color} opacity-70`} style={{ width: `${w}%` }} />
      </div>
      <span className="w-10 shrink-0 truncate text-right text-gray-500">
        {formatQty(level.quantity, baseDecimals)}
      </span>
    </div>
  );
}
