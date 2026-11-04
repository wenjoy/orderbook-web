import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { DEFAULT_MARKET, MARKET_PAIRS, type MarketPair } from "../markets";
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

type Props = {
  wallet: string | null;
  showToast: (m: string) => void;
};

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

export function ReadyPanel({ wallet, showToast }: Props) {
  const [pair, setPair] = useState<MarketPair>(DEFAULT_MARKET);
  const [report, setReport] = useState<ReadyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchReadyReport({ pair, wallet });
      setReport(r);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [pair, wallet, showToast]);

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
          <div>
            <label className="label">Trading pair</label>
            <select
              className="input"
              value={pair.id}
              onChange={(e) => {
                const n = MARKET_PAIRS.find((m) => m.id === e.target.value);
                if (n) setPair(n);
              }}
            >
              {MARKET_PAIRS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.symbol}
                </option>
              ))}
            </select>
          </div>
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
          {report && (
            <p className="font-mono text-[10px] text-gray-500">RPC {report.rpc}</p>
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
            <div className="panel-title">1–3 · Program / Market / Vault</div>
            <div className="px-3 pb-3">
              <Row label="Program" ok={report.program.exists && !!report.program.executable}>
                {report.program.programId}
                {report.program.exists &&
                  ` · executable=${String(report.program.executable)} · owner=${report.program.owner}`}
              </Row>
              <Row label="Market PDA" ok={!!report.marketPda.decoded?.is_initialized}>
                {report.marketPda.address}
                {report.marketPda.decoded && (
                  <pre className="mt-1 whitespace-pre-wrap">
                    {JSON.stringify(
                      {
                        ...report.marketPda.decoded,
                        total_base_deposited:
                          report.marketPda.decoded.total_base_deposited.toString(),
                        total_quote_deposited:
                          report.marketPda.decoded.total_quote_deposited.toString(),
                      },
                      null,
                      2
                    )}
                  </pre>
                )}
              </Row>
              <Row
                label="UserVault PDA"
                ok={!!report.userVault.decoded?.is_initialized}
              >
                {report.userVault.address}
                {report.userVault.decoded && (
                  <pre className="mt-1 whitespace-pre-wrap">
                    {JSON.stringify(
                      {
                        ...report.userVault.decoded,
                        base_balance: report.userVault.decoded.base_balance.toString(),
                        quote_balance: report.userVault.decoded.quote_balance.toString(),
                      },
                      null,
                      2
                    )}
                  </pre>
                )}
              </Row>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">4 · Token pair (mints)</div>
            <div className="px-3 pb-3">
              <Row label={`Base ${pair.baseSymbol}`} ok={!!report.baseMint.isInitialized}>
                {report.baseMint.address}
                <br />
                supply={report.baseMint.supply?.toString() ?? "—"} decimals=
                {report.baseMint.decimals ?? "—"}
              </Row>
              <Row label={`Quote ${pair.quoteSymbol}`} ok={!!report.quoteMint.isInitialized}>
                {report.quoteMint.address}
                <br />
                supply={report.quoteMint.supply?.toString() ?? "—"} decimals=
                {report.quoteMint.decimals ?? "—"}
              </Row>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">5–6 · Token accounts</div>
            <div className="px-3 pb-3">
              <Row label="Wallet Base ATA" ok={report.walletBaseAta.exists}>
                {report.walletBaseAta.address}
                <br />
                balance={report.walletBaseAta.uiAmount ?? "—"}
              </Row>
              <Row label="Wallet Quote ATA" ok={report.walletQuoteAta.exists}>
                {report.walletQuoteAta.address}
                <br />
                balance={report.walletQuoteAta.uiAmount ?? "—"}
              </Row>
              <Row label="Vault Base ATA (owner=Market)" ok={report.vaultBaseAta.exists}>
                {report.vaultBaseAta.address}
                <br />
                balance={report.vaultBaseAta.uiAmount ?? "—"}
              </Row>
              <Row label="Vault Quote ATA (owner=Market)" ok={report.vaultQuoteAta.exists}>
                {report.vaultQuoteAta.address}
                <br />
                balance={report.vaultQuoteAta.uiAmount ?? "—"}
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
