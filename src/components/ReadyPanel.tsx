import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { type MarketPair } from "../markets";
import {
  buildInitializeMarket,
  buildInitializeVault,
} from "../lib/settlementIx";
import { signAndSendInstruction } from "../lib/walletSend";
import {
  createAssociatedTokenAccountIdempotentIx,
  fetchReadyReport,
  type ReadyReport,
} from "../lib/chainStatus";
import { formatUnits } from "../lib/amount";

type Props = {
  wallet: string | null;
  showToast: (m: string) => void;
  market: MarketPair | null;
};

/** 最小单位 → 带千分位的人类可读字符串 */
function fmt(
  raw: bigint | null | undefined,
  decimals: number | null,
  symbol?: string
): string {
  if (raw == null) return "—";
  const s = formatUnits(raw, decimals);
  const [whole, frac] = s.split(".");
  const grouped = BigInt(whole || "0").toLocaleString("en-US");
  const value = frac ? `${grouped}.${frac}` : grouped;
  return symbol ? `${value} ${symbol}` : value;
}

function Ok({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? "text-bid" : "text-ask"}>{ok ? "✓" : "✗"}</span>
  );
}

function Row({
  label,
  ok,
  children,
}: {
  label: string;
  ok?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-surface-3 py-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <span className="text-gray-400">{label}</span>
        {ok !== undefined && <Ok ok={ok} />}
      </div>
      {children && (
        <div className="mt-1 font-mono text-[10px] text-gray-500 break-all">
          {children}
        </div>
      )}
    </div>
  );
}

export function ReadyPanel({ wallet, showToast, market }: Props) {
  const [report, setReport] = useState<ReadyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!market) {
      setReport(null);
      return;
    }
    setLoading(true);
    try {
      const r = await fetchReadyReport({ pair: market, wallet });
      setReport(r);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [market, wallet, showToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIx = async (
    label: string,
    build: () => { ix: import("@solana/web3.js").TransactionInstruction }
  ) => {
    if (!wallet) {
      showToast("先连接钱包");
      return;
    }
    setBusy(true);
    try {
      const built = build();
      const { signature } = await signAndSendInstruction(built.ix);
      showToast(`${label}: ${signature.slice(0, 12)}…`);
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const createAta = async (
    label: string,
    owner: PublicKey,
    mint: PublicKey
  ) => {
    if (!wallet) {
      showToast("先连接钱包");
      return;
    }
    setBusy(true);
    try {
      const payer = new PublicKey(wallet);
      const ix = createAssociatedTokenAccountIdempotentIx({
        payer,
        owner,
        mint,
      });
      const { signature } = await signAndSendInstruction(ix);
      showToast(`${label}: ${signature.slice(0, 12)}…`);
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const baseSymbol = market?.baseSymbol ?? "base";
  const quoteSymbol = market?.quoteSymbol ?? "quote";

  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="panel-title flex items-center justify-between">
          <span>链上就绪检查</span>
          <button
            type="button"
            className="btn-ghost text-[10px]"
            disabled={loading}
            onClick={() => void refresh()}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        <div className="space-y-2 p-3">
          {report && (
            <p
              className={`text-sm font-medium ${report.tradeReady ? "text-bid" : "text-ask"
                }`}
            >
              {report.tradeReady
                ? "Trade 基础就绪（program + mints + market + vault）"
                : "尚未就绪 — 见下方缺失项"}
            </p>
          )}
        </div>
      </div>

      {report && (
        <>
          <div className="panel">
            <div className="panel-title">检查清单</div>
            <div className="p-3 space-y-1">
              {report.checks.map((c) => (
                <div key={c.id} className="flex gap-2 text-xs">
                  <Ok ok={c.ok} />
                  <div>
                    <div className={c.ok ? "text-gray-300" : "text-gray-400"}>
                      {c.label}
                    </div>
                    {!c.ok && c.fix && (
                      <div className="text-[10px] text-ask">{c.fix}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Program / Market / Vault</div>
            <div className="px-3 pb-3">
              <Row label="Program" ok={report.program.exists && !!report.program.executable}>
                {report.program.programId}
              </Row>
              <Row label="Market PDA" ok={!!report.marketPda.decoded?.is_initialized}>
                {report.marketPda.address}
              </Row>
              {report.marketPda.decoded && (
                <>
                  <Row label="Authority">
                    {report.marketPda.decoded.authority}
                  </Row>
                  <Row label="Total deposited">
                    {fmt(
                      report.marketPda.decoded.total_base_deposited,
                      report.baseMint.decimals,
                      baseSymbol
                    )}
                    {" · "}
                    {fmt(
                      report.marketPda.decoded.total_quote_deposited,
                      report.quoteMint.decimals,
                      quoteSymbol
                    )}
                  </Row>
                </>
              )}
              <Row
                label="UserVault PDA"
                ok={!!report.userVault.decoded?.is_initialized}
              >
                {report.userVault.address}
              </Row>
              {report.userVault.decoded && (
                <>
                  <Row label="Owner">{report.userVault.decoded.owner}</Row>
                  <Row label="Base balance">
                    {fmt(
                      report.userVault.decoded.base_balance,
                      report.baseMint.decimals,
                      baseSymbol
                    )}
                  </Row>
                  <Row label="Quote balance">
                    {fmt(
                      report.userVault.decoded.quote_balance,
                      report.quoteMint.decimals,
                      quoteSymbol
                    )}
                  </Row>
                </>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Mints</div>
            <div className="px-3 pb-3">
              <Row label={`Base ${baseSymbol}`} ok={!!report.baseMint.isInitialized}>
                {report.baseMint.address}
                <br />
                supply {fmt(report.baseMint.supply, report.baseMint.decimals, baseSymbol)}
              </Row>
              <Row label={`Quote ${quoteSymbol}`} ok={!!report.quoteMint.isInitialized}>
                {report.quoteMint.address}
                <br />
                supply {fmt(report.quoteMint.supply, report.quoteMint.decimals, quoteSymbol)}
              </Row>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Token accounts</div>
            <div className="px-3 pb-3">
              <Row label="Wallet Base ATA" ok={report.walletBaseAta.exists}>
                {report.walletBaseAta.address}
                <br />
                balance {fmt(report.walletBaseAta.amount, report.baseMint.decimals, baseSymbol)}
              </Row>
              <Row label="Wallet Quote ATA" ok={report.walletQuoteAta.exists}>
                {report.walletQuoteAta.address}
                <br />
                balance {fmt(report.walletQuoteAta.amount, report.quoteMint.decimals, quoteSymbol)}
              </Row>
              <Row label="Vault Base ATA (owner=Market)" ok={report.vaultBaseAta.exists}>
                {report.vaultBaseAta.address}
                <br />
                balance {fmt(report.vaultBaseAta.amount, report.baseMint.decimals, baseSymbol)}
              </Row>
              <Row label="Vault Quote ATA (owner=Market)" ok={report.vaultQuoteAta.exists}>
                {report.vaultQuoteAta.address}
                <br />
                balance {fmt(report.vaultQuoteAta.amount, report.quoteMint.decimals, quoteSymbol)}
              </Row>
            </div>
          </div>

          {/* TODO: keep this in case need to init at client side */}
          {/* <div className="panel"> */}
          {/*   <div className="panel-title">补齐操作</div> */}
          {/*   <div className="grid gap-2 p-3 sm:grid-cols-2"> */}
          {/*     <button */}
          {/*       type="button" */}
          {/*       className="btn-primary text-xs" */}
          {/*       disabled={busy || !wallet || !!report.marketPda.decoded?.is_initialized} */}
          {/*       onClick={() => */}
          {/*         void signIx("InitMarket", () => */}
          {/*           buildInitializeMarket({ */}
          {/*             authority: new PublicKey(wallet!), */}
          {/*             baseMint: new PublicKey(pair.baseMint), */}
          {/*             quoteMint: new PublicKey(pair.quoteMint), */}
          {/*           }) */}
          {/*         ) */}
          {/*       } */}
          {/*     > */}
          {/*       创建 Market PDA */}
          {/*     </button> */}
          {/*     <button */}
          {/*       type="button" */}
          {/*       className="btn-primary text-xs" */}
          {/*       disabled={ */}
          {/*         busy || */}
          {/*         !wallet || */}
          {/*         !report.marketPda.decoded?.is_initialized || */}
          {/*         !!report.userVault.decoded?.is_initialized */}
          {/*       } */}
          {/*       onClick={() => */}
          {/*         void signIx("InitVault", () => */}
          {/*           buildInitializeVault({ */}
          {/*             owner: new PublicKey(wallet!), */}
          {/*             market: new PublicKey(report.marketPda.address), */}
          {/*           }) */}
          {/*         ) */}
          {/*       } */}
          {/*     > */}
          {/*       创建 UserVault PDA */}
          {/*     </button> */}
          {/*     <button */}
          {/*       type="button" */}
          {/*       className="btn-ghost text-xs" */}
          {/*       disabled={busy || !wallet || !report.baseMint.isInitialized} */}
          {/*       onClick={() => */}
          {/*         void createAta( */}
          {/*           "Wallet Base ATA", */}
          {/*           new PublicKey(wallet!), */}
          {/*           new PublicKey(pair.baseMint) */}
          {/*         ) */}
          {/*       } */}
          {/*     > */}
          {/*       创建钱包 Base ATA */}
          {/*     </button> */}
          {/*     <button */}
          {/*       type="button" */}
          {/*       className="btn-ghost text-xs" */}
          {/*       disabled={busy || !wallet || !report.quoteMint.isInitialized} */}
          {/*       onClick={() => */}
          {/*         void createAta( */}
          {/*           "Wallet Quote ATA", */}
          {/*           new PublicKey(wallet!), */}
          {/*           new PublicKey(pair.quoteMint) */}
          {/*         ) */}
          {/*       } */}
          {/*     > */}
          {/*       创建钱包 Quote ATA */}
          {/*     </button> */}
          {/*     <button */}
          {/*       type="button" */}
          {/*       className="btn-ghost text-xs" */}
          {/*       disabled={ */}
          {/*         busy || */}
          {/*         !wallet || */}
          {/*         !report.baseMint.isInitialized || */}
          {/*         !report.marketPda.decoded?.is_initialized */}
          {/*       } */}
          {/*       onClick={() => */}
          {/*         void createAta( */}
          {/*           "Vault Base ATA", */}
          {/*           new PublicKey(report.marketPda.address), */}
          {/*           new PublicKey(pair.baseMint) */}
          {/*         ) */}
          {/*       } */}
          {/*     > */}
          {/*       创建托管 Base ATA */}
          {/*     </button> */}
          {/*     <button */}
          {/*       type="button" */}
          {/*       className="btn-ghost text-xs" */}
          {/*       disabled={ */}
          {/*         busy || */}
          {/*         !wallet || */}
          {/*         !report.quoteMint.isInitialized || */}
          {/*         !report.marketPda.decoded?.is_initialized */}
          {/*       } */}
          {/*       onClick={() => */}
          {/*         void createAta( */}
          {/*           "Vault Quote ATA", */}
          {/*           new PublicKey(report.marketPda.address), */}
          {/*           new PublicKey(pair.quoteMint) */}
          {/*         ) */}
          {/*       } */}
          {/*     > */}
          {/*       创建托管 Quote ATA */}
          {/*     </button> */}
          {/*   </div> */}
          {/* </div> */}
        </>
      )}
    </div>
  );
}
