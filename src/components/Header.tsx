
type Tab = "trade" | "admin";

interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
  connected: boolean;
  apiOk: boolean | null;
  wallet: string | null;
  walletConnecting: boolean;
  hasPhantom: boolean;
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
  onConnect,
  onDisconnect,
}: Props) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-3 bg-surface-1 px-4 py-3">
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
        <nav className="ml-4 flex gap-1 rounded-lg bg-surface-2 p-0.5">
          <TabBtn active={tab === "trade"} onClick={() => onTab("trade")}>
            Trade
          </TabBtn>
          <TabBtn active={tab === "admin"} onClick={() => onTab("admin")}>
            Admin
          </TabBtn>
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
    </header>
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

