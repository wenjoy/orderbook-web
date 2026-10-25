import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Header } from "./components/Header";
import { Orderbook } from "./components/Orderbook";
import { OrderFormControlled } from "./components/OrderForm";
import { Trades } from "./components/Trades";
import { OpenOrders } from "./components/OpenOrders";
import { Settlements } from "./components/Settlements";
import { DepthChart } from "./components/DepthChart";
import { useWebSocket } from "./hooks/useWebSocket";
import type {
  DepthLevel,
  LocalOrder,
  SettlementJob,
  Side,
  Trade,
  WsEvent,
} from "./types";

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
      publicKey?: { toString: () => string };
    };
  }
}

export default function App() {
  const [user, setUser] = useState("alice");
  const [phantom, setPhantom] = useState(false);
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
    const t = window.setInterval(() => void refresh(), 15000);
    return () => clearInterval(t);
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
          // will appear after refresh / place response
          return prev;
        });
        void api.settlements(30).then(setSettlements).catch(() => {});
        break;
    }
  }, []);

  const wsConnected = useWebSocket(onWs);

  const connectPhantom = async () => {
    const provider = window.solana;
    if (!provider?.isPhantom) {
      showToast("Phantom not found — paste pubkey manually");
      return;
    }
    try {
      const res = await provider.connect();
      const pk = res.publicKey.toString();
      setUser(pk);
      setPhantom(true);
      showToast(`Connected ${pk.slice(0, 4)}…${pk.slice(-4)}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Phantom connect failed");
    }
  };

  const placeOrder = async (p: {
    side: Side;
    price: number;
    quantity: number;
  }) => {
    setBusy(true);
    try {
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
          const merged = [...res.settlements.filter((j) => !ids.has(j.id)), ...prev];
          return merged.slice(0, 50);
        });
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (id: number) => {
    try {
      await api.cancelOrder(id);
      setOrders((prev) => prev.filter((o) => o.id !== id));
      showToast(`Cancelled #${id}`);
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Cancel failed");
    }
  };

  const onPriceClick = (p: number, s: Side) => {
    setPrice(String(p));
    // click ask to buy at that price, click bid to sell
    setSide(s === "Ask" ? "Bid" : "Ask");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        user={user}
        onUserChange={setUser}
        connected={wsConnected}
        apiOk={apiOk}
        onConnectPhantom={connectPhantom}
        phantomConnected={phantom}
      />

      <main className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-12">
        {/* Left: orderbook + depth */}
        <section className="flex flex-col gap-3 lg:col-span-4">
          <div className="min-h-[420px] flex-1">
            <Orderbook bids={bids} asks={asks} onPriceClick={onPriceClick} />
          </div>
          <DepthChart bids={bids} asks={asks} />
        </section>

        {/* Center: form + open orders */}
        <section className="flex flex-col gap-3 lg:col-span-4">
          <OrderFormControlled
            user={user}
            price={price}
            setPrice={setPrice}
            side={side}
            setSide={setSide}
            busy={busy}
            onSubmit={placeOrder}
          />
          <div className="min-h-[200px] flex-1">
            <OpenOrders orders={orders} user={user} onCancel={cancelOrder} />
          </div>
        </section>

        {/* Right: trades + settlements */}
        <section className="flex flex-col gap-3 lg:col-span-4">
          <div className="min-h-[280px] flex-1">
            <Trades trades={trades} />
          </div>
          <div className="min-h-[240px] flex-1">
            <Settlements jobs={settlements} />
          </div>
        </section>
      </main>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md border border-surface-3 bg-surface-2 px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
