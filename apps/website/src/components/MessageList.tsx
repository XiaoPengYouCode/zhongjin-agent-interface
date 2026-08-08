import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble.tsx";
import type { UiMessage } from "../lib/types.ts";

export function MessageList({
  messages,
  onRetract,
  onEditResend,
}: {
  messages: UiMessage[];
  onRetract: (entryId: string) => void;
  onEditResend: (entryId: string, text: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // 程序化滚动会触发 scroll 事件：记录时间戳，窗口期内的事件视为程序化滚动，
  // 不参与 stick 判定（避免流式增长时以过期布局误判）。
  const lastProgScroll = useRef(0);
  const DEBUG = useRef(
    typeof localStorage !== "undefined" && localStorage.getItem("pi-web-debug") === "1",
  );

  const logScroll = (msg: string, extra?: unknown) => {
    if (DEBUG.current) console.debug(`[scroll] ${msg}`, extra ?? "");
  };

  /** 滚到最新消息：用 scrollIntoView 定位真实元素（content-visibility 下
   *  scrollHeight 是估算值，不可用；浏览器会为目标元素计算真实位置）。 */
  const scrollToBottom = () => {
    const el = scroller.current;
    if (!el) return;
    const last = el.lastElementChild as HTMLElement | null;
    if (last) {
      lastProgScroll.current = performance.now();
      last.scrollIntoView({ block: "end" });
    } else {
      lastProgScroll.current = performance.now();
      el.scrollTop = el.scrollHeight;
    }
    logScroll("programmatic -> bottom");
  };

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    if (performance.now() - lastProgScroll.current < 120) {
      logScroll("ignore (programmatic)");
      return;
    }
    // stick 判定：最后一条消息的底部距容器底部的距离（不依赖 scrollHeight，
    // 与 content-visibility 的估算高度兼容）。
    const last = el.lastElementChild as HTMLElement | null;
    if (!last) return;
    const next = el.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom < 80;
    if (next !== stick.current) {
      logScroll(`stick ${stick.current} -> ${next}`);
    }
    stick.current = next;
  };

  // 最新一条是用户刚发的消息时，强制滚到底部（用户可能之前上滑读过内容）。
  const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === "user";

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (lastIsUser) stick.current = true;
    if (stick.current) {
      // 等布局稳定后再滚，避免读到旧高度。
      requestAnimationFrame(scrollToBottom);
    }
  }, [messages, lastIsUser]);

  // thinking / tool 块展开或折叠时，无条件下拉一次（由组件广播事件驱动）。
  useEffect(() => {
    // thinking / tool 展开折叠触发的自动滚动：仅在用户贴底（stick）时生效，
    // 用户手动上滑且未回到底部时忽略，避免抢占手动滚动。
    const onAutoScroll = () => {
      if (!stick.current) return;
      requestAnimationFrame(scrollToBottom);
    };
    document.addEventListener("pi:autoscroll", onAutoScroll);
    return () => document.removeEventListener("pi:autoscroll", onAutoScroll);
  }, []);

  // 输入框增高会压缩 .messages 的视口，底部内容被遮住；
  // 视口变矮时若用户贴底则跟随滚到底部（手动上滑未回底时不抢占）。
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let prevH = 0;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (prevH !== 0 && h < prevH && stick.current) requestAnimationFrame(scrollToBottom);
      prevH = h;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (messages.length === 0) {
    return (
      <div className="messages" ref={scroller} onScroll={onScroll}>
        <div className="empty">
          <div className="empty-mark">π</div>
          <p className="empty-title">Pi Web</p>
          <p className="empty-hint">输入一条消息，开始和 Pi 对话。</p>
          <p className="empty-sub">会话与终端里的 Pi 共享，可以随时恢复。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="messages" ref={scroller} onScroll={onScroll}>
      {messages.map((m) => (
        <MessageBubble key={m.key} message={m} onRetract={onRetract} onEditResend={onEditResend} />
      ))}
    </div>
  );
}
