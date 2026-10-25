interface Props {
  user: string;
  onUserChange: (u: string) => void;
  connected: boolean;
  apiOk: boolean | null;
  onConnectPhantom: () => void;
  phantomConnected: boolean;
}

export function Header({
  user,
  onUserChange,
  connected,
  apiOk,
  onConnectPhantom,
  phantomConnected,
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
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <StatusDot ok={apiOk} label="API" />
        <StatusDot ok={connected} label="WS" />

        <div className="flex items-center gap-2">
          <input
            className="input w-44 py-1.5 text-xs"
            placeholder="user / pubkey"
            value={user}
            onChange={(e) => onUserChange(e.target.value)}
          />
          <button type="button" className="btn-ghost text-xs" onClick={onConnectPhantom}>
            {phantomConnected ? "Phantom ✓" : "Connect Phantom"}
          </button>
        </div>
      </div>
    </header>
  );
}

function StatusDot({ ok, label }: { ok: boolean | null; label: string }) {
  const color =
    ok === null ? "bg-gray-500" : ok ? "bg-bid" : "bg-ask";
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-400">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
