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

export type VaultState = "idle" | "checking" | "missing" | "ready" | "error";

export type VaultData = {
  address: string;
  baseBalance: bigint;
  quoteBalance: bigint;
  baseDecimals: number | null;
  quoteDecimals: number | null;
};

const EMPTY_VAULT: VaultData = {
  address: "",
  baseBalance: 0n,
  quoteBalance: 0n,
  baseDecimals: null,
  quoteDecimals: null,
};

/**
 * 检测当前钱包在当前交易对下的 User Vault 是否已开户，
 * 并提供开户（InitializeVault）动作与金库余额。
 */
export function useVaultStatus(
  wallet: string | null,
  market: MarketPair | null
) {
  const [state, setState] = useState<VaultState>("idle");
  const [vault, setVault] = useState<VaultData>(EMPTY_VAULT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * silent = true 时不切到 checking，用于充值/提现后的静默刷新，
   * 避免交易界面被整页 loading 顶掉。
   */
  const check = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!wallet || !market) {
        setState("idle");
        return;
      }
      if (!opts?.silent) setState("checking");
      setError(null);
      try {
        const res = await fetchVaultStatus({ wallet, market });
        setVault({
          address: res.address,
          baseBalance: res.baseBalance,
          quoteBalance: res.quoteBalance,
          baseDecimals: res.baseDecimals,
          quoteDecimals: res.quoteDecimals,
        });
        setState(res.initialized ? "ready" : "missing");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        if (!opts?.silent) setState("error");
      }
    },
    [wallet, market]
  );

  useEffect(() => {
    void check();
  }, [check]);

  /** 开户；成功返回签名，失败抛错（页面停留在开户页） */
  const open = useCallback(async (): Promise<string | null> => {
    if (!wallet || !market) return null;
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
      // 以链上状态为准：确认已初始化后才放行交易界面
      await check();
      return signature;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e instanceof Error ? e : new Error(msg);
    } finally {
      setBusy(false);
    }
  }, [wallet, market, check]);

  return { state, vault, error, busy, open, check };
}
