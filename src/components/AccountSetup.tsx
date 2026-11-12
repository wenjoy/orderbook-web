import type { AccountAction, AccountState } from "../hooks/useTradingAccount";
import type { AccountSetup as Setup } from "../lib/chainStatus";
import type { MarketPair } from "../markets";
import { formatUnits } from "../lib/amount";
import { rpcUrl } from "../api";

type Props = {
  state: AccountState;
  setup: Setup | null;
  error: string | null;
  action: AccountAction;
  market: MarketPair;
  onRefresh: () => void;
  onCreateAtas: () => void;
  onOpen: () => void;
  onAirdrop: () => void;
};

type StepStatus = "done" | "active" | "locked";

const short = (addr: string) =>
  addr.length <= 12 ? addr : `${addr.slice(0, 4)}…${addr.slice(-4)}`;

const sol = (lamports: number) => (lamports / 1e9).toFixed(4);

function StepMark({ index, status }: { index: number; status: StepStatus }) {
  const cls =
    status === "done"
      ? "bg-bid/15 text-bid"
      : status === "active"
        ? "bg-accent/15 text-accent"
        : "bg-surface-2 text-gray-500";
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${cls}`}
    >
      {status === "done" ? "✓" : index}
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
  return (
    <div
      className={`rounded-lg border p-4 transition ${
        status === "active"
          ? "border-accent/40 bg-accent/5"
          : "border-surface-3 bg-surface-1"
      } ${status === "locked" ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        <StepMark index={index} status={status} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-100">{title}</p>
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
 * 开户三步引导：
 *   1. 钱包有足够的 SOL（租金 + 手续费）
 *   2. 钱包的 base / quote ATA 已创建
 *   3. 最后才开户（InitializeVault）
 * 全部完成前不进入交易界面。
 */
export function AccountSetup({
  state,
  setup,
  error,
  action,
  market,
  onRefresh,
  onCreateAtas,
  onOpen,
  onAirdrop,
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

  const busy = action !== null;
  const mintsOk = setup.baseMintInitialized && setup.quoteMintInitialized;

  const step1: StepStatus = setup.solOk ? "done" : "active";
  const step2: StepStatus = setup.atasOk
    ? "done"
    : setup.solOk
      ? "active"
      : "locked";
  const step3: StepStatus = setup.vaultInitialized
    ? "done"
    : setup.solOk && setup.atasOk
      ? "active"
      : "locked";

  const baseBalance = formatUnits(
    setup.baseAta.amount ?? 0n,
    setup.baseDecimals
  );
  const quoteBalance = formatUnits(
    setup.quoteAta.amount ?? 0n,
    setup.quoteDecimals
  );

  // 仅本地验证节点 / devnet 提供一键领水
  const canAirdrop = /127\.0\.0\.1|localhost|devnet/.test(rpcUrl());

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-100">
          Open your trading account
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-400">
          {market.baseSymbol} / {market.quoteSymbol} · 依次完成以下 3 步后即可交易。
        </p>
      </div>

      {/* 1 · SOL */}
      <Step index={1} title="Fund your wallet with SOL" status={step1}>
        <p>
          SOL 用于支付账户租金（ATA + 交易账户）和网络手续费。
        </p>
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
            请从交易所或其他钱包转入后点击刷新。
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className="btn-ghost text-xs"
            disabled={busy}
            onClick={onRefresh}
          >
            Refresh balance
          </button>
          {canAirdrop && (
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={busy}
              onClick={onAirdrop}
            >
              {action === "airdrop" ? "Requesting…" : "Request 1 SOL"}
            </button>
          )}
        </div>
      </Step>

      {/* 2 · ATA */}
      <Step index={2} title="Create token accounts" status={step2}>
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
        {step2 === "locked" && (
          <p className="text-[11px] text-gray-500">先完成第 1 步。</p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            className="btn-ghost text-xs"
            disabled={busy || step2 === "locked" || !mintsOk || setup.atasOk}
            onClick={onCreateAtas}
          >
            {action === "atas"
              ? "Creating…"
              : setup.atasOk
                ? "Token accounts ready"
                : "Create token accounts"}
          </button>
          <span className="text-[10px] text-gray-500">
            两个账户会在一次签名中创建。
          </span>
        </div>
      </Step>

      {/* 3 · UserVault */}
      <Step index={3} title="Open trading account" status={step3}>
        <p>
          最后一步：在你的钱包与当前交易对下创建 User Vault，之后才能充值、下单和结算。
        </p>
        <p className="font-mono text-[10px] text-gray-600 break-all">
          vault PDA: {setup.vaultAddress || "—"}
        </p>
        {step3 === "locked" && (
          <p className="text-[11px] text-gray-500">
            先完成第 1、2 步。
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            className="btn-primary text-xs"
            disabled={busy || step3 !== "active"}
            onClick={onOpen}
          >
            {action === "vault" ? "Opening…" : "Open trading account"}
          </button>
          <span className="text-[10px] text-gray-500">
            需要钱包签名一次交易。
          </span>
        </div>
      </Step>

      {error && (
        <p className="rounded-md bg-ask/10 px-3 py-2 text-[11px] text-ask break-all">
          {error}
        </p>
      )}
    </div>
  );
}
