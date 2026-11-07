import { useCallback, useEffect, useState } from "react";

// window.solana 的全局声明只在 lib/walletSend.ts 里维护一份（含 signAndSendTransaction），
// 这里直接复用，避免重复声明导致 TS2717。

export function useWallet() {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPhantom =
    typeof window !== "undefined" && Boolean(window.solana?.isPhantom);

  const connect = useCallback(async () => {
    setError(null);
    const provider = window.solana;
    if (!provider?.isPhantom) {
      setError("请安装 Phantom 钱包后刷新页面");
      return;
    }
    setConnecting(true);
    try {
      const res = await provider.connect();
      setPubkey(res.publicKey.toString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "连接失败");
      setPubkey(null);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await window.solana?.disconnect?.();
    } catch {
      /* ignore */
    }
    setPubkey(null);
  }, []);

  useEffect(() => {
    const provider = window.solana;
    if (!provider?.isPhantom) return;
    // silent reconnect
    provider
      .connect({ onlyIfTrusted: true })
      .then((r) => setPubkey(r.publicKey.toString()))
      .catch(() => {});

    const onDisconnect = () => setPubkey(null);
    provider.on?.("disconnect", onDisconnect);
    return () => provider.off?.("disconnect", onDisconnect);
  }, []);

  return {
    pubkey,
    connected: Boolean(pubkey),
    connecting,
    hasPhantom,
    error,
    connect,
    disconnect,
  };
}
