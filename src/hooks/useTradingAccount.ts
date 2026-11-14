import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { FAUCET_AMOUNTS, requestTokenAirdrop, rpcUrl } from "../api";
import { parseUnits } from "../lib/amount";
import type { MarketPair } from "../markets";
import {
  buildInitializeVault,
  deriveMarket,
  programId,
} from "../lib/settlementIx";
import {
  signAndSendInstruction,
  signAndSendInstructions,
} from "../lib/walletSend";
import {
  createAssociatedTokenAccountIdempotentIx,
  fetchAccountSetup,
  type AccountSetup,
} from "../lib/chainStatus";

/**
 * idle      — 还没连接钱包 / 没选市场
 * checking  — 正在查链上状态
 * missing   — 未开户，需要走「三步引导」
 * ready     — 已开户，可以交易
 * error     — 查询失败
 */
export type AccountState = "idle" | "checking" | "missing" | "ready" | "error";

/** 正在进行的动作，用于禁用按钮与展示 loading 文案 */
export type AccountAction = "atas" | "faucet" | "vault" | "airdrop" | null;

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
 * 交易账户状态 + 开户前置条件（SOL / ATA / 代币余额 / UserVault）。
 *
 * 分步引导的数据来源都在这里：
 *   1. setup.solOk            钱包有足够的 SOL 支付租金与手续费
 *   2. setup.atasOk           base / quote ATA 已创建（createAtas 补齐）
 *   3. setup.fundedOk         两个 ATA 余额都不为零（requestTokens 领水）
 *   4. setup.vaultInitialized 交易账户已开户（open 开户）
 */
export function useTradingAccount(
  wallet: string | null,
  market: MarketPair | null
) {
  const [state, setState] = useState<AccountState>("idle");
  const [setup, setSetup] = useState<AccountSetup | null>(null);
  const [vault, setVault] = useState<VaultData>(EMPTY_VAULT);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<AccountAction>(null);

  /**
   * silent = true 时不切到 checking，用于签名成功后的静默刷新，
   * 避免交易界面被整页 loading 顶掉。
   */
  const check = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!wallet || !market) {
        setState("idle");
        setSetup(null);
        setVault(EMPTY_VAULT);
        return;
      }
      if (!opts?.silent) setState("checking");
      setError(null);
      try {
        const next = await fetchAccountSetup({ wallet, market });
        setSetup(next);
        setVault({
          address: next.vaultAddress,
          baseBalance: next.baseBalance,
          quoteBalance: next.quoteBalance,
          baseDecimals: next.baseDecimals,
          quoteDecimals: next.quoteDecimals,
        });
        setState(next.vaultInitialized ? "ready" : "missing");
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

  /** 第 2 步：创建缺失的钱包 ATA（base / quote 可合并在一次签名里） */
  const createAtas = useCallback(async (): Promise<string | null> => {
    if (!wallet || !market) return null;
    setAction("atas");
    setError(null);
    try {
      const payer = new PublicKey(wallet);
      // 以链上最新状态为准，避免按钮状态过期导致重复创建
      const current = await fetchAccountSetup({ wallet, market });
      setSetup(current);

      const ixs = [];
      if (!current.baseAta.exists) {
        ixs.push(
          createAssociatedTokenAccountIdempotentIx({
            payer,
            owner: payer,
            mint: new PublicKey(market.baseMint),
          })
        );
      }
      if (!current.quoteAta.exists) {
        ixs.push(
          createAssociatedTokenAccountIdempotentIx({
            payer,
            owner: payer,
            mint: new PublicKey(market.quoteMint),
          })
        );
      }
      if (ixs.length === 0) {
        await check({ silent: true });
        return null;
      }

      const { signature } = await signAndSendInstructions(ixs);
      await check({ silent: true });
      return signature;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e instanceof Error ? e : new Error(msg);
    } finally {
      setAction(null);
    }
  }, [wallet, market, check]);

  /**
   * 第 3 步：向水龙头领取 base / quote 代币。
   * 后端一次只能发一个 mint，所以这里内部串行发两次请求，用户只点一次。
   */
  const requestTokens = useCallback(async (): Promise<string | null> => {
    if (!wallet || !market) return null;
    setAction("faucet");
    setError(null);
    try {
      // 以链上最新状态为准：没 ATA 就先别领，否则后端推导出的目的地账户不存在
      const current = await fetchAccountSetup({ wallet, market });
      setSetup(current);
      if (!current.baseAta.exists || !current.quoteAta.exists) {
        throw new Error("Create token accounts first");
      }
      if (current.baseDecimals == null || current.quoteDecimals == null) {
        throw new Error("Unknown mint decimals, cannot compute airdrop amount");
      }

      const baseRaw = parseUnits(String(FAUCET_AMOUNTS.base), current.baseDecimals);
      const quoteRaw = parseUnits(String(FAUCET_AMOUNTS.quote), current.quoteDecimals);
      if (baseRaw == null || quoteRaw == null) {
        throw new Error("Invalid airdrop amount for mint decimals");
      }

      const requests = [
        {
          symbol: market.baseSymbol,
          body: {
            destination: wallet,
            amount: Number(baseRaw),
            mint: market.baseMint,
          },
        },
        {
          symbol: market.quoteSymbol,
          body: {
            destination: wallet,
            amount: Number(quoteRaw),
            mint: market.quoteMint,
          },
        },
      ];

      // 两次请求彼此独立：一个失败不影响另一个已到账，最后按余额判断是否放行
      const signatures: string[] = [];
      const failures: string[] = [];
      for (const req of requests) {
        try {
          const res = await requestTokenAirdrop(req.body);
          if (res.signature) signatures.push(res.signature);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          failures.push(`${req.symbol}: ${msg}`);
        }
      }

      await check({ silent: true });

      if (failures.length) {
        throw new Error(`Airdrop failed → ${failures.join(" / ")}`);
      }
      return signatures[0] ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e instanceof Error ? e : new Error(msg);
    } finally {
      setAction(null);
    }
  }, [wallet, market, check]);

  /** 第 4 步：开户（InitializeVault）；成功后 state 变为 ready */
  const open = useCallback(async (): Promise<string | null> => {
    if (!wallet || !market) return null;
    setAction("vault");
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
      setAction(null);
    }
  }, [wallet, market, check]);

  /** 本地验证节点 / devnet 上的一键领水，仅用于开发调试 */
  const airdrop = useCallback(
    async (sol = 1) => {
      if (!wallet) return;
      setAction("airdrop");
      setError(null);
      try {
        const connection = new Connection(rpcUrl(), "confirmed");
        const signature = await connection.requestAirdrop(
          new PublicKey(wallet),
          Math.round(sol * 1e9)
        );
        await connection.confirmTransaction(signature, "confirmed");
        await check({ silent: true });
        return signature;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e instanceof Error ? e : new Error(msg);
      } finally {
        setAction(null);
      }
    },
    [wallet, check]
  );

  return {
    state,
    setup,
    vault,
    error,
    action,
    busy: action !== null,
    check,
    createAtas,
    requestTokens,
    open,
    airdrop,
  };
}
