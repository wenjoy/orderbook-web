import type { MarketPair } from "../markets";

type Tab = "trade" | "admin";

interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
  connected: boolean;
  apiOk: boolean | null;
  wallet: string | null;
  walletConnecting: boolean;
  hasPhantom: boolean;
  markets: MarketPair[];
  marketId: string | null;
  onMarketChange: (id: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function Header({
  tab,
  onTab,
  connected,
  apiOk,
  wallet,
  walletConnecting,
  hasPhantom,
  markets,
  marketId,
  onMarketChange,
  onConnect,
  onDisconnect,
}: Props) {
  return (
    <header className="border-b border-surface-3 bg-surface-1">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/20 font-mono text-sm font-bold text-accent">
            OB
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">CLOB Demo</h1>
            <p className="text-xs text-gray-500">
              Matching off-chain · Settlement on-chain
            </p>
          </div>
        </div>
        <nav className="flex gap-3 rounded-lg bg-surface-2 p-0.5">
          <TabBtn active={tab === "trade"} onClick={() => onTab("trade")}>
            Trade
          </TabBtn>
          <TabBtn active={tab === "admin"} onClick={() => onTab("admin")}>
            Admin
          </TabBtn>
          <MarketSelect
            markets={markets}
            marketId={marketId}
            onChange={onMarketChange}
          />
        </nav>

        <div className="flex flex-wrap items-center gap-3">

          <span className="hidden h-5 w-px bg-surface-3 sm:block" aria-hidden />

          <StatusDot ok={apiOk} label="API" />
          <StatusDot ok={connected} label="WS" />

          {wallet ? (
            <div className="flex items-center gap-2">
              <span className="rounded bg-surface-2 px-2 py-1 font-mono text-xs text-accent">
                {wallet.slice(0, 4)}…{wallet.slice(-4)}
              </span>
              <button type="button" className="btn-ghost text-xs" onClick={onDisconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={walletConnecting || !hasPhantom}
              onClick={onConnect}
              title={!hasPhantom ? "Install Phantom" : undefined}
            >
              {walletConnecting
                ? "Connecting…"
                : hasPhantom
                  ? "Connect Wallet"
                  : "Install Phantom"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function MarketSelect({
  markets,
  marketId,
  onChange,
}: {
  markets: MarketPair[];
  marketId: string | null;
  onChange: (id: string) => void;
}) {
  const current = markets.find((m) => m.id === marketId) ?? markets[0];

  if (!current) {
    return (
      <span className="rounded-lg border border-dashed border-surface-3 px-2.5 py-1.5 text-xs text-gray-500">
        No markets
      </span>
    );
  }

  return (
    <div className="group relative flex items-center">
      <select
        aria-label="Trading pair"
        className="cursor-pointer appearance-none rounded-lg border border-surface-3 bg-surface-2 py-1.5 pl-3 pr-8 text-xs font-medium text-gray-200 outline-none transition hover:border-gray-500 hover:bg-surface-3 focus:border-accent focus:ring-1 focus:ring-accent/30"
        value={current.id}
        onChange={(e) => onChange(e.target.value)}
      >
        {markets.map((m) => (
          <option
            key={m.id}
            value={m.id}
            className="bg-surface-1 text-gray-200"
          >
            {m.baseSymbol} / {m.quoteSymbol}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500 transition group-hover:text-gray-300"
      >
        <path d="M6 8l4 4 4-4" />
      </svg>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1 text-xs font-medium ${active ? "bg-surface-3 text-white" : "text-gray-400 hover:text-gray-200"
        }`}
    >
      {children}
    </button>
  );
}

function StatusDot({ ok, label }: { ok: boolean | null; label: string }) {
  const color = ok === null ? "bg-gray-500" : ok ? "bg-bid" : "bg-ask";
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-400">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
