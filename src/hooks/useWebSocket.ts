import { useEffect, useRef, useState } from "react";
import { wsUrl } from "../api";
import type { WsEvent } from "../types";

export function useWebSocket(onEvent: (ev: WsEvent) => void) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let timer: number | undefined;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        schedule();
        return;
      }

      ws.onopen = () => {
        retry = 0;
        setConnected(true);
      };
      ws.onclose = () => {
        setConnected(false);
        schedule();
      };
      ws.onerror = () => {
        ws?.close();
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data as string) as WsEvent;
          handler.current(data);
        } catch {
          /* ignore bad frames */
        }
      };
    };

    const schedule = () => {
      if (closed) return;
      const delay = Math.min(1000 * 2 ** retry, 8000);
      retry += 1;
      timer = window.setTimeout(connect, delay);
    };

    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return connected;
}
