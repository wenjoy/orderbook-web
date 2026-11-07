import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { Balances } from "../hooks/useBalances";
import type { VaultData } from "../hooks/useVaultStatus";
import type { MarketPair } from "../markets";
import { formatUnits, parseUnits } from "../lib/amount";
import { getAssociatedTokenAddress } from "../lib/chainStatus";
import {
  buildDeposit,
  buildWithdraw,
  deriveMarket,
  programId,
} from "../lib/settlementIx";
import { signAndSendInstruction } from "../lib/walletSend";

type Props = {
  balances: Balances & { refresh: () => void };
  market: MarketPair;
  wallet: string;
  vault: VaultData;
  showToast: (m: string) => void;
  /** 充值/提现成功后刷新钱包余额与金库余额 */
  onDone: () => void;
};

/**
 * Holding overview：钱包余额 + 交易账户（vault）余额 + 充值/提现。
 * user token account / vault token account 均由 owner + mint 推导，无需手填。
 */
export function HoldingOverview({
  balances,
  market,
  wallet,
  vault,
  showToast,
  onDone,
}: Props) {
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState<"base" | "quote">("quote");
  const [busy, setBusy] = useState<"deposit" | "withdraw" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isBase = asset === "base";
  const symbol = isBase ? market.baseSymbol : market.quoteSymbol;
  const mint = isBase ? market.baseMint : market.quoteMint;
  const decimals = isBase ? vault.baseDecimals : vault.quoteDecimals;
  const walletToken = balances.tokens.find((t) => t.mint === mint);
  const available =
    walletToken?.uiAmount != null ? String(walletToken.uiAmount) : "0";

  const label = (m: string) => {
    if (market.baseMint === m) return market.baseSymbol;
    if (market.quoteMint === m) return market.quoteSymbol;
    return m.slice(0, 4) + "…" + m.slice(-4);
  };

  const submit = async (kind: "deposit" | "withdraw") => {
    setError(null);
    if (decimals == null) {
      setError(`Unknown decimals for ${symbol}`);
      return;
    }
    const raw = parseUnits(amount, decimals);
    if (raw == null) {
      setError(
        decimals === 0
          ? "Amount must be an integer"
          : `Amount must be a number with at most ${decimals} decimals`
      );
      return;
    }
    if (raw <= 0n) {
      setError("Amount must be greater than 0");
      return;
    }

    setBusy(kind);
    try {
      const [marketPda] = deriveMarket(
        programId(),
        new PublicKey(market.baseMint),
        new PublicKey(market.quoteMint)
      );
      const mintPk = new PublicKey(mint);
      const userToken = getAssociatedTokenAddress(new PublicKey(wallet), mintPk);
      // 托管 token 账户：owner = Market PDA
      const vaultToken = getAssociatedTokenAddress(marketPda, mintPk);

      const params = {
        owner: new PublicKey(wallet),
        market: marketPda,
        userToken,
        vaultToken,
        amount: raw,
        isBase,
      };
      const built =
        kind === "deposit" ? buildDeposit(params) : buildWithdraw(params);

      const { signature } = await signAndSendInstruction(built.ix);
      const verb = kind === "deposit" ? "Deposit" : "Withdraw";
      showToast(`${verb} ${formatUnits(raw, decimals)} ${symbol} · ${signature.slice(0, 12)}…`);
      setAmount("");
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      showToast(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel">
      <div className="panel-title flex items-center justify-between">
        <span>Holding overview</span>
        <button
          type="button"
          className="btn-ghost text-[10px]"
          onClick={() => balances.refresh()}
        >
          Refresh
        </button>
      </div>

      {/* 钱包余额 */}
      <div className="space-y-1.5 p-3 text-xs">
        <p className="text-[10px] uppercase tracking-wider text-gray-500">
          Wallet
        </p>
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
            {/* 代币可能很多，限制高度避免撑爆面板 */}
            <div className="max-h-40 space-y-1.5 overflow-auto pr-1">
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
            </div>
          </>
        )}
      </div>

      {/* 交易账户（vault）余额 */}
      <div className="space-y-1.5 border-t border-surface-3 p-3 text-xs">
        <p className="text-[10px] uppercase tracking-wider text-gray-500">
          Trading account
        </p>
        <div className="flex justify-between">
          <span className="text-gray-400">Base</span>
          <span className="font-mono">
            {formatUnits(vault.baseBalance, vault.baseDecimals)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Quote</span>
          <span className="font-mono">
            {formatUnits(vault.quoteBalance, vault.quoteDecimals)}
          </span>
        </div>
        {vault.address && (
          <p className="font-mono text-[10px] text-gray-600 break-all">
            {vault.address}
          </p>
        )}
      </div>

      {/* 充值 / 提现 */}
      <div className="space-y-2 border-t border-surface-3 p-3">
        <div className="flex gap-2">
          <input
            className="input flex-1 text-xs"
            placeholder="Amount"
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
          />
          <select
            className="input w-28 shrink-0 text-xs"
            aria-label="Asset"
            value={asset}
            onChange={(e) => setAsset(e.target.value === "base" ? "base" : "quote")}
          >
            <option value="base">{market.baseSymbol}</option>
            <option value="quote">{market.quoteSymbol}</option>
          </select>
        </div>
        <p className="text-[10px] text-gray-500">
          Available in wallet: {available} {symbol}
        </p>
        {error && <p className="text-[10px] text-ask break-all">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn-bid text-xs"
            disabled={busy !== null || !amount.trim()}
            onClick={() => void submit("deposit")}
          >
            {busy === "deposit" ? "Depositing…" : "Deposit"}
          </button>
          <button
            type="button"
            className="btn-ask text-xs"
            disabled={busy !== null || !amount.trim()}
            onClick={() => void submit("withdraw")}
          >
            {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
          </button>
        </div>
      </div>
    </div>
  );
}
