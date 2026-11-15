import type {
  AccountAction,
  AccountState,
  SetupRun,
} from "../hooks/useTradingAccount";
import type { AccountSetup as Setup } from "../lib/chainStatus";
import type { MarketPair } from "../markets";
import { formatUnits } from "../lib/amount";
import { FAUCET_AMOUNTS, rpcUrl } from "../api";

type Props = {
  state: AccountState;
  setup: Setup | null;
  error: string | null;
  action: AccountAction;
  run: SetupRun;
  market: MarketPair;
  onSetupAll: () => void;
  onAirdrop: () => void;
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
 * 开户引导：4 个步骤只作为进度展示，用户点一次「Set up trading account」
 * 就会按顺序跑完剩余步骤，进度实时反映在步骤卡片上。
 */
export function AccountSetup({
  state,
  setup,
  error,
  action,
  run,
  market,
  onSetupAll,
  onAirdrop,
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
    if (run.active) return "locked"; // 排队中
    if (n === 1) return "active";
    if (n === 2) return setup.solOk ? "active" : "locked";
    if (n === 3) return setup.solOk && setup.atasOk ? "active" : "locked";
    return setup.solOk && setup.atasOk && setup.fundedOk ? "active" : "locked";
  };

  const baseBalance = formatUnits(setup.baseAta.amount ?? 0n, setup.baseDecimals);
  const quoteBalance = formatUnits(setup.quoteAta.amount ?? 0n, setup.quoteDecimals);
  const baseZero = (setup.baseAta.amount ?? 0n) === 0n;
  const quoteZero = (setup.quoteAta.amount ?? 0n) === 0n;

  // 仅本地验证节点 / devnet 提供一键领水
  const canAirdrop = /127\.0\.0\.1|localhost|devnet/.test(rpcUrl());

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
          {market.baseSymbol} / {market.quoteSymbol} · 点一次即可完成以下 4 步。
        </p>
      </div>

      {/* 总进度 */}
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

      {/* 一键执行 */}
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
          自动按顺序执行：检查 SOL → 创建 ATA → 领取代币 → 开户；
          已完成的步骤会跳过，重复点击是安全的。
        </p>
      </div>

      {/* 1 · SOL */}
      <Step index={1} title="Fund your wallet with SOL" status={statusOf(1)}>
        <p>SOL 用于支付账户租金（ATA + 交易账户）和网络手续费。</p>
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
          <p className="text-[11px] text-ask">
            还差 ≈ {sol(setup.requiredLamports - setup.solLamports)} SOL，
            转入后可再次点击上方按钮。
          </p>
        )}
        {canAirdrop && !setup.solOk && !run.active && (
          <button
            type="button"
            className="btn-ghost text-xs"
            disabled={busy}
            onClick={onAirdrop}
          >
            {action === "airdrop" ? "Requesting…" : "Request 1 SOL"}
          </button>
        )}
        {run.error?.step === 1 && (
          <p className="text-[11px] text-ask">{run.error.message}</p>
        )}
      </Step>

      {/* 2 · ATA */}
      <Step index={2} title="Create token accounts" status={statusOf(2)}>
        {!mintsOk && (
          <p className="text-[11px] text-ask">
            该交易对的 mint 尚未在链上创建，请先在 Admin 页初始化市场。
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

      {/* 3 · 代币余额 */}
      <Step index={3} title="Fund token accounts" status={statusOf(3)}>
        <p>两个 ATA 的余额都不能为零，否则开户后也无法充值、下单。</p>
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
          每次领取 {FAUCET_AMOUNTS.base} {market.baseSymbol} +{" "}
          {FAUCET_AMOUNTS.quote} {market.quoteSymbol}，由后端水龙头发放。
        </p>
        {run.error?.step === 3 && (
          <p className="text-[11px] text-ask">{run.error.message}</p>
        )}
      </Step>

      {/* 4 · UserVault */}
      <Step index={4} title="Open trading account" status={statusOf(4)}>
        <p>
          最后一步：在你的钱包与当前交易对下创建 User Vault，之后才能充值、下单和结算。
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
