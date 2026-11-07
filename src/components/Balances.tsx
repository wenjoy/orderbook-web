import type { Balances } from "../hooks/useBalances";
import type { MarketPair } from "../markets";

export function BalancesPanel({
  balances,
  market,
  onRefresh,
}: {
  balances: Balances & { refresh: () => void };
  market: MarketPair | null;
  onRefresh?: () => void;
}) {
  const label = (mint: string) => {
    if (market?.baseMint === mint) return market.baseSymbol;
    if (market?.quoteMint === mint) return market.quoteSymbol;
    return mint.slice(0, 4) + "…" + mint.slice(-4);
  };

  return (
    <div className="panel">
      <div className="panel-title flex items-center justify-between">
        <span>Wallet balances</span>
        <button
          type="button"
          className="btn-ghost text-[10px]"
          onClick={() => {
            balances.refresh();
            onRefresh?.();
          }}
        >
          Refresh
        </button>
      </div>
      <div className="space-y-2 p-3 text-xs">
        {balances.loading && <p className="text-gray-500">Loading…</p>}
        {balances.error && <p className="text-ask">{balances.error}</p>}
        {!balances.loading && !balances.error && (
          <>
            <div className="flex justify-between">
              <span className="text-gray-400">SOL</span>
              <span className="font-mono">
                {balances.sol == null ? "—" : balances.sol.toFixed(4)}
              </span>
            </div>
            {balances.tokens.length === 0 && (
              <p className="text-gray-500">No SPL token accounts</p>
            )}
            {balances.tokens.map((t, i) => (
              // 同一 mint 可能有多个 token account，不能用 mint 单独做 key
              <div key={`${t.mint}-${i}`} className="flex justify-between gap-2">
                <span className="text-gray-400" title={t.mint}>
                  {label(t.mint)}
                </span>
                <span className="font-mono">
                  {t.uiAmount == null ? t.amount : t.uiAmount}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
