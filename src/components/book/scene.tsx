"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function useBookFlags() {
  const [portrait, setPortrait] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 900px)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setPortrait(!wide.matches);
      setReduced(motion.matches);
    };
    queueMicrotask(apply);
    wide.addEventListener("change", apply);
    motion.addEventListener("change", apply);
    return () => {
      wide.removeEventListener("change", apply);
      motion.removeEventListener("change", apply);
    };
  }, []);
  return { portrait, reduced };
}

export function BookScene({
  children,
  tabs = [],
  pageIndex,
  pageCount,
  turning,
  leafFront,
  leafBack,
  onNext,
  onPrev,
  canNext,
  canPrev,
  portrait,
  reduced,
  live,
  onTurnEnd,
}: {
  children: ReactNode;
  tabs?: { href: string; label: string }[];
  pageIndex: number;
  pageCount: number;
  turning: "next" | "prev" | null;
  leafFront?: ReactNode;
  leafBack?: ReactNode;
  onNext: () => void;
  onPrev: () => void;
  canNext: boolean;
  canPrev: boolean;
  portrait: boolean;
  reduced: boolean;
  live: string;
  onTurnEnd: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const curlRef = useRef<HTMLDivElement>(null);
  const endRef = useRef(onTurnEnd);
  useEffect(() => {
    endRef.current = onTurnEnd;
  }, [onTurnEnd]);

  useEffect(() => {
    if (!turning || reduced) return;
    const node = curlRef.current;
    if (!node) return;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 1200);
      node.style.setProperty("--turn", progress.toFixed(4));
      node.setAttribute("data-turn", progress.toFixed(4));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else endRef.current();
    };
    node.style.setProperty("--turn", "0");
    node.setAttribute("data-turn", "0");
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [turning, reduced]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select, label")) return;
    start.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    if (dx > 0) onNext();
    else onPrev();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select")) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onNext();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onPrev();
    }
  }

  return (
    <div className="desk">
      <div
        className={`volume${portrait ? " is-portrait" : ""}${reduced ? " is-still" : ""}${turning ? ` is-turning is-turning-${turning}` : ""}`}
        data-book
        data-layout={portrait ? "portrait" : "spread"}
        data-page-index={pageIndex}
        data-page-count={pageCount}
        data-motion={reduced ? "reduce" : "full"}
        data-turning={turning ?? "idle"}
        tabIndex={0}
        role="region"
        aria-label="ספר פתוח"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className="board-edge" aria-hidden="true" />
        <div className="sheet-stack" aria-hidden="true" />
        {tabs.length > 0 ? (
          <nav className="chapter-tabs" aria-label="פרקים">
            {tabs.map((tab) => (
              <a key={tab.href + tab.label} className="chapter-tab" href={tab.href}>
                {tab.label}
              </a>
            ))}
          </nav>
        ) : null}
        <div className="spread" data-spread>
          {children}
          <div className="gutter" aria-hidden="true" />
          {turning && !reduced ? (
            <div ref={curlRef} className={`curl curl-${turning}`} data-curl data-turn="0" data-leaf>
              <div className="cast" />
              <div className="hinge" data-hinge>
                <div className="wing" data-wing>
                  <div className="clip">
                    <div className="shift shift-outer">{leafFront}</div>
                  </div>
                </div>
                <div className="clip">
                  <div className="shift shift-inner">{leafFront}</div>
                </div>
                <div className="hinge-back">{leafBack}</div>
              </div>
            </div>
          ) : null}
        </div>
        <button type="button" className="corner corner-next" aria-label="העמוד הבא" disabled={!canNext} onClick={onNext} />
        <button type="button" className="corner corner-prev" aria-label="העמוד הקודם" disabled={!canPrev} onClick={onPrev} />
      </div>
      <div className="page-controls">
        <button type="button" className="turn-word" onClick={onNext} disabled={!canNext}>
          העמוד הבא
        </button>
        <p className="page-count" aria-live="polite">
          {live}
        </p>
        <button type="button" className="turn-word" onClick={onPrev} disabled={!canPrev}>
          העמוד הקודם
        </button>
      </div>
      <p className="gesture-hint">חץ שמאלה או החלקה ימינה: העמוד הבא. חץ ימינה או החלקה שמאלה: העמוד הקודם.</p>
    </div>
  );
}
