import type { DepthLevel } from "../types";

interface Props {
  bids: DepthLevel[];
  asks: DepthLevel[];
}

/** Simple horizontal depth bars (no extra chart lib) */
export function DepthChart({ bids, asks }: Props) {
  const max = Math.max(
    1,
    ...bids.map((b) => b.quantity),
    ...asks.map((a) => a.quantity)
  );
  const levels = 8;
  const topBids = bids.slice(0, levels);
  const topAsks = asks.slice(0, levels);

  return (
    <div className="panel">
      <div className="panel-title">Depth</div>
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase text-bid">Bids</p>
          {topBids.map((l) => (
            <Bar key={`b-${l.price}`} level={l} max={max} color="bg-bid" />
          ))}
          {topBids.length === 0 && (
            <p className="text-xs text-gray-600">—</p>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase text-ask">Asks</p>
          {topAsks.map((l) => (
            <Bar key={`a-${l.price}`} level={l} max={max} color="bg-ask" />
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
}: {
  level: DepthLevel;
  max: number;
  color: string;
}) {
  const w = Math.max(4, (level.quantity / max) * 100);
  return (
    <div className="flex items-center gap-2 font-mono text-[10px]">
      <span className="w-10 shrink-0 text-gray-400">{level.price}</span>
      <div className="h-2 flex-1 rounded-sm bg-surface-2">
        <div className={`h-2 rounded-sm ${color} opacity-70`} style={{ width: `${w}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-gray-500">{level.quantity}</span>
    </div>
  );
}
