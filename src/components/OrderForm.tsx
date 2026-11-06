import { useState } from "react";
import type { Side } from "../types";
import { MarketPair } from "../markets";

interface Props {
  user: string;
  defaultPrice?: number;
  defaultSide?: Side;
  busy: boolean;
  onSubmit: (p: {
    side: Side;
    price: number;
    quantity: number;
  }) => Promise<void>;
}

export function OrderForm({
  user,
  defaultPrice,
  defaultSide = "Bid",
  busy,
  onSubmit,
}: Props) {
  const [side, setSide] = useState<Side>(defaultSide);
  const [price, setPrice] = useState(String(defaultPrice ?? 100));
  const [qty, setQty] = useState("10");
  const [error, setError] = useState<string | null>(null);

  // sync when parent sets price from orderbook click
  if (defaultPrice !== undefined && price !== String(defaultPrice)) {
    // only update when defaultPrice changes intentionally via key from parent
  }

  const submit = async (s: Side) => {
    setError(null);
    if (!user.trim()) {
      setError("Set a user / pubkey first");
      return;
    }
    const p = Number(price);
    const q = Number(qty);
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q <= 0) {
      setError("Price and quantity must be positive numbers");
      return;
    }
    try {
      await onSubmit({ side: s, price: p, quantity: q });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="panel">
      <div className="panel-title">Place Order</div>
      <div className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={side === "Bid" ? "btn-bid" : "btn-ghost"}
            onClick={() => setSide("Bid")}
          >
            Buy
          </button>
          <button
            type="button"
            className={side === "Ask" ? "btn-ask" : "btn-ghost"}
            onClick={() => setSide("Ask")}
          >
            Sell
          </button>
        </div>

        <div>
          <label className="label">Price</label>
          <input
            className="input"
            value={price}
            type="number"
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div>
          <label className="label">Quantity</label>
          <input
            className="input"
            value={qty}
            type="number"
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
          />
        </div>

        {error && <p className="text-xs text-ask">{error}</p>}

        <button
          type="button"
          disabled={busy}
          className={side === "Bid" ? "btn-bid w-full" : "btn-ask w-full"}
          onClick={() => submit(side)}
        >
          {busy ? "Sending…" : side === "Bid" ? "Buy limit" : "Sell limit"}
        </button>

        <p className="text-[10px] text-gray-500">
          Trading as <span className="font-mono text-gray-400">{user || "—"}</span>
        </p>
      </div>
    </div>
  );
}

/** Controlled form that accepts external price fills from orderbook clicks */
export function OrderFormControlled({
  user,
  price,
  setPrice,
  side,
  setSide,
  busy,
  onSubmit,
}: {
  user: string;
  price: string;
  setPrice: (v: string) => void;
  side: Side;
  setSide: (s: Side) => void;
  busy: boolean;
  onSubmit: (p: { side: Side; price: number; quantity: number, pair: MarketPair }) => Promise<void>;
}) {
  const [qty, setQty] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const pair = [];

  const submit = async () => {
    setError(null);
    if (!user.trim()) {
      setError("Set a user / pubkey first");
      return;
    }
    const p = Number(price);
    const q = Number(qty);
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q <= 0) {
      setError("Price and quantity must be positive numbers");
      return;
    }
    try {
      await onSubmit({ side, price: p, quantity: q, pair });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="panel">
      <div className="panel-title">Place Order</div>
      <div className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={side === "Bid" ? "btn-bid" : "btn-ghost"}
            onClick={() => setSide("Bid")}
          >
            Buy
          </button>
          <button
            type="button"
            className={side === "Ask" ? "btn-ask" : "btn-ghost"}
            onClick={() => setSide("Ask")}
          >
            Sell
          </button>
        </div>
        <div>
          <label className="label">Price</label>
          <input
            className="input"
            value={price}
            type="number"
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Quantity</label>
          <input
            className="input"
            value={qty}
            type="number"
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        {error && <p className="text-xs text-ask">{error}</p>}
        <button
          type="button"
          disabled={busy}
          className={side === "Bid" ? "btn-bid w-full" : "btn-ask w-full"}
          onClick={submit}
        >
          {busy ? "Sending…" : side === "Bid" ? "Buy limit" : "Sell limit"}
        </button>
        <p className="text-[10px] text-gray-500">
          Click orderbook rows to fill price · user{" "}
          <span className="font-mono text-gray-400">{user || "—"}</span>
        </p>
      </div>
    </div>
  );
}
