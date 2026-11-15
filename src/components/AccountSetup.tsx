import type {
  AccountAction,
  AccountState,
  SetupRun,
} from "../hooks/useTradingAccount";
import type { AccountSetup as Setup } from "../lib/chainStatus";
import type { MarketPair } from "../markets";
import { formatUnits } from "../lib/amount";
import { FAUCET_AMOUNTS } from "../api";

type Props = {
  state: AccountState;
  setup: Setup | null;
  error: string | null;
  action: AccountAction;
  run: SetupRun;
  market: MarketPair;
  onSetupAll: () => void;
  onRefresh: () => void;
};

type StepStatus = "done" | "running" | "failed" | "active" | "locked";

const STEP_TITLES = [
  "Fund your wallet with SOL",
  "Create token accounts",
  "Fund token accounts",
  "Open trading account",
];

const short = (addr: string) =>
  addr.length <= 12 ? addr : `${addr.slice(0, 4)}…${addr.slice(-4)}`;

const sol = (lamports: number) => (lamports / 1e9).toFixed(4);

function StepMark({ index, status }: { index: number; status: StepStatus }) {
  if (status === "running") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
      </span>
    );
  }
  const cls =
    status === "done"
      ? "bg-bid/15 text-bid"
      : status === "failed"
        ? "bg-ask/15 text-ask"
        : status === "active"
          ? "bg-accent/15 text-accent"
          : "bg-surface-2 text-gray-500";
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${cls}`}
    >
      {status === "done" ? "✓" : status === "failed" ? "✗" : index}
    </span>
  );
}

function Step({
  index,
  title,
  status,
  children,
}: {
  index: number;
  title: string;
  status: StepStatus;
  children?: React.ReactNode;
}) {
  const border =
    status === "failed"
      ? "border-ask/40 bg-ask/5"
      : status === "running" || status === "active"
        ? "border-accent/40 bg-accent/5"
        : "border-surface-3 bg-surface-1";
  return (
    <div
      className={`rounded-lg border p-4 transition ${border} ${
        status === "locked" ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <StepMark index={index} status={status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-100">{title}</p>
            {status === "running" && (
              <span className="text-[10px] text-accent">in progress…</span>
            )}
          </div>
          <div className="mt-2 space-y-2 text-xs text-gray-400">{children}</div>
        </div>
      </div>
    </div>
  );
}

function AtaRow({
  label,
  address,
  exists,
  balance,
}: {
  label: string;
  address: string;
  exists: boolean;
  balance: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5">
        <span className={exists ? "text-bid" : "text-ask"}>
          {exists ? "✓" : "✗"}
        </span>
        <span className="text-gray-300">{label}</span>
        <span className="font-mono text-[10px] text-gray-500">
          {short(address)}
        </span>
      </span>
      <span className="shrink-0 text-[10px]">
        {exists ? (
          <span className="font-mono text-gray-400">{balance ?? "—"}</span>
        ) : (
          <span className="text-ask">not created</span>
        )}
      </span>
    </div>
  );
}

/**
 * Account setup guide: the 4 steps are a progress view, and one click on
 * "Set up trading account" runs every remaining step in order.
 */
export function AccountSetup({
  state,
  setup,
  error,
  action,
  run,
  market,
  onSetupAll,
  onRefresh,
}: Props) {
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
          <p className="mt-1 font-mono text-[10px] text-gray-500 break-all">
            {error ?? "Unknown error"}
          </p>
          <button type="button" className="btn-ghost mt-4 text-xs" onClick={onRefresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!setup) return null;

  const busy = run.active || action !== null;
  const mintsOk = setup.baseMintInitialized && setup.quoteMintInitialized;

  const isDone = (n: number): boolean =>
    n === 1
      ? setup.solOk
      : n === 2
        ? setup.atasOk
        : n === 3
          ? setup.fundedOk
          : setup.vaultInitialized;

  const statusOf = (n: number): StepStatus => {
    if (run.error?.step === n) return "failed";
    if (run.active && run.step === n) return "running";
    if (isDone(n)) return "done";
    if (run.active) return "locked"; // queued
    if (n === 1) return "active";
    if (n === 2) return setup.solOk ? "active" : "locked";
    if (n === 3) return setup.solOk && setup.atasOk ? "active" : "locked";
    return setup.solOk && setup.atasOk && setup.fundedOk ? "active" : "locked";
  };

  const baseBalance = formatUnits(setup.baseAta.amount ?? 0n, setup.baseDecimals);
  const quoteBalance = formatUnits(setup.quoteAta.amount ?? 0n, setup.quoteDecimals);
  const baseZero = (setup.baseAta.amount ?? 0n) === 0n;
  const quoteZero = (setup.quoteAta.amount ?? 0n) === 0n;

  const doneCount = [1, 2, 3, 4].filter(isDone).length;
  const ctaLabel = run.active
    ? `Step ${run.step ?? 1}/4 · ${STEP_TITLES[(run.step ?? 1) - 1]}…`
    : run.error
      ? `Retry from step ${run.error.step}`
      : "Set up trading account";

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-100">
          Open your trading account
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-400">
          {market.baseSymbol} / {market.quoteSymbol} · One click runs all 4 steps below.
        </p>
      </div>

      {/* Overall progress */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[1, 2, 3, 4].map((n) => {
            const s = statusOf(n);
            return (
              <span
                key={n}
                className={`h-1 flex-1 rounded-full ${
                  s === "done"
                    ? "bg-bid"
                    : s === "failed"
                      ? "bg-ask"
                      : s === "running"
                        ? "bg-accent"
                        : "bg-surface-3"
                }`}
              />
            );
          })}
        </div>
        <span className="text-[10px] text-gray-500">{doneCount}/4 done</span>
      </div>

      {/* One-click action */}
      <div className="space-y-2">
        <button
          type="button"
          className="btn-primary w-full"
          disabled={busy}
          onClick={onSetupAll}
        >
          {ctaLabel}
        </button>
        <p className="text-center text-[10px] text-gray-500">
          Runs in order: check SOL → create ATAs → fund tokens → open account.
          Completed steps are skipped, so retrying is safe.
        </p>
      </div>

      {/* 1 · SOL */}
      <Step index={1} title="Fund your wallet with SOL" status={statusOf(1)}>
        <p>SOL pays for account rent (token accounts + trading account) and network fees.</p>
        <div className="space-y-1 rounded-md bg-surface-2/60 px-3 py-2 font-mono text-[11px]">
          <div className="flex justify-between">
            <span className="text-gray-500">Wallet SOL</span>
            <span className={setup.solOk ? "text-bid" : "text-ask"}>
              {sol(setup.solLamports)} SOL
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Required</span>
            <span className="text-gray-300">
              ≈ {sol(setup.requiredLamports)} SOL
            </span>
          </div>
        </div>
        {!setup.solOk && (
          <p className="text-[11px] text-gray-500">
            Short by ≈ {sol(setup.requiredLamports - setup.solLamports)} SOL.
            It will be topped up automatically when you continue.
          </p>
        )}
        <p className="text-[10px] text-gray-600">
          The required minimum is topped up automatically (local validator / devnet).
        </p>
        {run.error?.step === 1 && (
          <p className="text-[11px] text-ask">{run.error.message}</p>
        )}
      </Step>

      {/* 2 · ATA */}
      <Step index={2} title="Create token accounts" status={statusOf(2)}>
        {!mintsOk && (
          <p className="text-[11px] text-ask">
            This pair's mints are not on chain yet. Initialize the market first.
          </p>
        )}
        <div className="space-y-1.5">
          <AtaRow
            label={`${market.baseSymbol} ATA`}
            address={setup.baseAta.address}
            exists={setup.baseAta.exists}
            balance={baseBalance}
          />
          <AtaRow
            label={`${market.quoteSymbol} ATA`}
            address={setup.quoteAta.address}
            exists={setup.quoteAta.exists}
            balance={quoteBalance}
          />
        </div>
        {run.error?.step === 2 && (
          <p className="text-[11px] text-ask">{run.error.message}</p>
        )}
      </Step>

      {/* 3 · Token balances */}
      <Step index={3} title="Fund token accounts" status={statusOf(3)}>
        <p>
          Both ATAs must have a non-zero balance, otherwise you cannot deposit or trade.
        </p>
        <div className="space-y-1 rounded-md bg-surface-2/60 px-3 py-2 font-mono text-[11px]">
          <div className="flex justify-between">
            <span className="text-gray-500">{market.baseSymbol}</span>
            <span className={baseZero ? "text-ask" : "text-bid"}>
              {baseBalance} {baseZero && "(zero)"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{market.quoteSymbol}</span>
            <span className={quoteZero ? "text-ask" : "text-bid"}>
              {quoteBalance} {quoteZero && "(zero)"}
            </span>
          </div>
        </div>
        <p className="text-[10px] text-gray-500">
          Each request mints {FAUCET_AMOUNTS.base} {market.baseSymbol} +{" "}
          {FAUCET_AMOUNTS.quote} {market.quoteSymbol} from the backend faucet.
        </p>
        {run.error?.step === 3 && (
          <p className="text-[11px] text-ask">{run.error.message}</p>
        )}
      </Step>

      {/* 4 · UserVault */}
      <Step index={4} title="Open trading account" status={statusOf(4)}>
        <p>
          The final step creates your User Vault for this pair. You need it to deposit,
          trade and settle.
        </p>
        <p className="font-mono text-[10px] text-gray-600 break-all">
          vault PDA: {setup.vaultAddress || "—"}
        </p>
        {run.error?.step === 4 && (
          <p className="text-[11px] text-ask">{run.error.message}</p>
        )}
      </Step>

      {error && !run.error && (
        <p className="rounded-md bg-ask/10 px-3 py-2 text-[11px] text-ask break-all">
          {error}
        </p>
      )}
    </div>
  );
}
