import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { MarketPair } from "../markets";
import {
  buildInitializeVault,
  deriveMarket,
  programId,
} from "../lib/settlementIx";
import { signAndSendInstruction } from "../lib/walletSend";
import { fetchVaultStatus } from "../lib/chainStatus";

type Props = {
  wallet: string;
  market: MarketPair;
  showToast: (m: string) => void;
};

type Status = "checking" | "missing" | "ready" | "error";

/**
 * Trade 页开户引导：
 * 检测当前钱包在当前交易对下是否已初始化 User Vault，
 * 没有就提示用户点击「开户」，已开户则什么都不渲染。
 */
export function VaultOnboarding({ wallet, market, showToast }: Props) {
  const [status, setStatus] = useState<Status>("checking");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      const res = await fetchVaultStatus({ wallet, market });
      setAddress(res.address);
      setStatus(res.initialized ? "ready" : "missing");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [wallet, market]);

  useEffect(() => {
    void check();
  }, [check]);

  const openVault = async () => {
    setBusy(true);
    setError(null);
    try {
      const [marketPk] = deriveMarket(
        programId(),
        new PublicKey(market.baseMint),
        new PublicKey(market.quoteMint)
      );
      const built = buildInitializeVault({
        owner: new PublicKey(wallet),
        market: marketPk,
      });
      const { signature } = await signAndSendInstruction(built.ix);
      showToast(`开户成功：${signature.slice(0, 12)}…`);
      await check();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  if (status === "checking" || status === "ready") return null;

  if (status === "error") {
    return (
      <div className="panel mb-4 border-ask/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ask">
            Vault 状态检查失败：{error ?? "未知错误"}
          </p>
          <button
            type="button"
            className="btn-ghost text-[10px]"
            onClick={() => void check()}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel mb-4 border-accent/40 bg-accent/5">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-100">
            还没有开户 — 需要先初始化你的交易账户
          </p>
          <p className="mt-1 text-xs text-gray-400">
            当前钱包在 {market.baseSymbol} / {market.quoteSymbol} 下还没有
            User Vault。开户会在链上为你创建一个专属金库，之后才能充值、下单和结算。
          </p>
          <p className="mt-1.5 font-mono text-[10px] text-gray-500 break-all">
            vault PDA: {address || "—"}
          </p>
          {error && <p className="mt-1 text-[10px] text-ask">{error}</p>}
        </div>
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={busy}
          onClick={() => void openVault()}
        >
          {busy ? "开户中…" : "开户"}
        </button>
      </div>
    </div>
  );
}
