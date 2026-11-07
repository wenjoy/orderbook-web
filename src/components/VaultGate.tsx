import type { ReactNode } from "react";
import type { MarketPair } from "../markets";
import { useVaultStatus } from "../hooks/useVaultStatus";

type Props = {
  wallet: string;
  market: MarketPair;
  showToast: (m: string) => void;
  children: ReactNode;
};

/**
 * Trade 页开户闸门：
 * 未开户时只渲染开户页，不渲染任何交易界面；
 * 链上确认已开户后才渲染 children（交易界面）。
 */
export function VaultGate({ wallet, market, showToast, children }: Props) {
  const { state, address, error, busy, open, check } = useVaultStatus(
    wallet,
    market
  );

  const handleOpen = async () => {
    try {
      const signature = await open();
      if (signature) showToast(`Account opened: ${signature.slice(0, 12)}…`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  };

  if (state === "ready") return <>{children}</>;

  if (state === "idle" || state === "checking") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
        <p className="text-sm text-gray-400">Checking your trading account…</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="mx-auto max-w-lg">
        <div className="panel border-ask/40 p-6 text-center">
          <p className="text-sm font-medium text-ask">
            Could not check your trading account
          </p>
          <p className="mt-1 text-xs text-gray-500 break-all">
            {error ?? "Unknown error"}
          </p>
          <button
            type="button"
            className="btn-ghost mt-4 text-xs"
            onClick={() => void check()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="panel p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>

        <h2 className="mt-4 text-lg font-semibold text-gray-100">
          Open your trading account
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-400">
          Your wallet has no User Vault for {market.baseSymbol} /{" "}
          {market.quoteSymbol} yet. Opening an account creates your on-chain
          vault — required before you can deposit, trade and settle.
        </p>

        <p className="mt-4 font-mono text-[10px] text-gray-500 break-all">
          vault PDA: {address || "—"}
        </p>

        <button
          type="button"
          className="btn-primary mt-6 w-full sm:w-auto sm:px-10"
          disabled={busy}
          onClick={() => void handleOpen()}
        >
          {busy ? "Opening…" : "Open Account"}
        </button>

        {error && <p className="mt-3 text-xs text-ask break-all">{error}</p>}

        <p className="mt-4 text-[10px] text-gray-600">
          You will be asked to sign one transaction with your wallet.
        </p>
      </div>
    </div>
  );
}
