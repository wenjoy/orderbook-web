
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Header } from "./components/Header";
import { Orderbook } from "./components/Orderbook";
import { OrderFormControlled } from "./components/OrderForm";
import { Trades } from "./components/Trades";
import { OpenOrders } from "./components/OpenOrders";
import { Settlements } from "./components/Settlements";
import { DepthChart } from "./components/DepthChart";
import { AdminPanel } from "./components/AdminPanel";
import { BalancesPanel } from "./components/Balances";
import { useWebSocket } from "./hooks/useWebSocket";
import { useWallet } from "./hooks/useWallet";
import { useBalances } from "./hooks/useBalances";
import type {
  DepthLevel,
  LocalOrder,
  SettlementJob,
  Side,
  Trade,
  WsEvent,
} from "./types";

type Tab = "trade" | "admin";

export default function App() {
  const wallet = useWallet();
  const balances = useBalances(wallet.pubkey);
  const [tab, setTab] = useState<Tab>("trade");
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  const [bids, setBids] = useState<DepthLevel[]>([]);
  const [asks, setAsks] = useState<DepthLevel[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [settlements, setSettlements] = useState<SettlementJob[]>([]);

  const [side, setSide] = useState<Side>("Bid");
  const [price, setPrice] = useState("100");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  const refresh = useCallback(async () => {
    try {
      const [ob, tr, st] = await Promise.all([
        api.orderbook(),
        api.trades(),
        api.settlements(30),
      ]);
      setBids(ob.bids);
      setAsks(ob.asks);
      setTrades(tr);
      setSettlements(st);
      setApiOk(true);
    } catch {
      setApiOk(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onWs = useCallback((ev: WsEvent) => {
    switch (ev.type) {
      case "OrderbookUpdate":
        setBids(ev.data.bids);
        setAsks(ev.data.asks);
        break;
      case "Trade":
        setTrades((prev) => [...prev, ev.data].slice(-200));
        break;
      case "OrderPlaced":
        setOrders((prev) => {
          const next = prev.filter((o) => o.id !== ev.data.order_id);
          next.push({
            id: ev.data.order_id,
            side: ev.data.side,
            price: ev.data.price,
            remaining: ev.data.remaining,
            user: ev.data.user,
          });
          return next;
        });
        break;
      case "OrderCancelled":
        setOrders((prev) => prev.filter((o) => o.id !== ev.data.order_id));
        break;
      case "SettlementUpdate":
        setSettlements((prev) => {
          const idx = prev.findIndex((j) => j.id === ev.data.settlement_id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = {
              ...copy[idx],
              status: ev.data.status,
              signature: ev.data.signature,
            };
            return copy;
          }
          return prev;
        });
        void api.settlements(30).then(setSettlements).catch(() => { });
        break;
    }
  }, []);

  const wsConnected = useWebSocket(onWs);

  const placeOrder = async (p: {
    side: Side;
    price: number;
    quantity: number;
  }) => {
    if (!wallet.pubkey) {
      showToast("Connect wallet to trade");
      throw new Error("Connect wallet to trade");
    }
    setBusy(true);
    try {
      const user = wallet.pubkey;
      const res = await api.placeOrder({ ...p, user });
      if (res.order_id != null && res.remaining != null && res.remaining > 0) {
        setOrders((prev) => [
          ...prev.filter((o) => o.id !== res.order_id),
          {
            id: res.order_id!,
            side: p.side,
            price: p.price,
            remaining: res.remaining!,
            user,
          },
        ]);
      }
      if (res.trades.length) {
        setTrades((prev) => [...prev, ...res.trades].slice(-200));
        showToast(`Matched ${res.trades.length} trade(s)`);
      }
      if (res.settlements?.length) {
        setSettlements((prev) => {
          const ids = new Set(prev.map((j) => j.id));
          const merged = [
            ...res.settlements.filter((j) => !ids.has(j.id)),
            ...prev,
          ];
          return merged.slice(0, 50);
        });
      }
      await refresh();
      void balances.refresh();
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (id: number) => {
    await api.cancelOrder(id);
    setOrders((prev) => prev.filter((o) => o.id !== id));
    await refresh();
  };

  return (
    <div className="min-h-screen bg-surface-0 text-gray-100">
      <Header
        tab={tab}
        onTab={setTab}
        connected={wsConnected}
        apiOk={apiOk}
        wallet={wallet.pubkey}
        walletConnecting={wallet.connecting}
        hasPhantom={wallet.hasPhantom}
        onConnect={() => void wallet.connect()}
        onDisconnect={() => void wallet.disconnect()}
      />

      {wallet.error && (
        <div className="bg-ask/20 px-4 py-2 text-center text-xs text-ask">
          {wallet.error}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-surface-3 bg-surface-1 px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}

      <main className="mx-auto max-w-7xl p-4">
        {tab === "admin" ? (
          <AdminPanel wallet={wallet.pubkey} showToast={showToast} />
        ) : !wallet.connected ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <p className="text-lg font-medium">Connect wallet to trade</p>
            <p className="max-w-md text-center text-sm text-gray-500">
              交易必须使用钱包公钥作为用户身份，不再支持 alice 等占位名。
              连接后可查看 SOL / SPL 余额并下单。
            </p>
            <button
              type="button"
              className="btn-primary"
              disabled={wallet.connecting || !wallet.hasPhantom}
              onClick={() => void wallet.connect()}
            >
              {wallet.hasPhantom ? "Connect Phantom" : "Install Phantom first"}
            </button>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setTab("admin")}
            >
              或先打开 Admin 做链上准备
            </button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-3">
              <BalancesPanel balances={balances} />
              <OrderFormControlled
                user={wallet.pubkey}
                price={price}
                setPrice={setPrice}
                side={side}
                setSide={setSide}
                busy={busy}
                onSubmit={placeOrder}
              />
              <OpenOrders orders={orders} user={wallet.pubkey} onCancel={cancelOrder} />
            </div>
            <div className="space-y-4 lg:col-span-5">
              <Orderbook
                bids={bids}
                asks={asks}
                onPriceClick={(p, s) => {
                  setPrice(String(p));
                  setSide(s);
                }}
              />
              <DepthChart bids={bids} asks={asks} />
            </div>
            <div className="space-y-4 lg:col-span-4">
              <Trades trades={trades} />
              <Settlements jobs={settlements} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

