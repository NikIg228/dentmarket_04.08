"use client";

import { useEffect, useRef } from "react";
import type { SupplierLegalDocument } from "@marketplace/schemas";
import { addViewedRange, viewedEntireDocument, type ViewedRange } from "./supplier-terms-reading";
import styles from "./supplier-terms.module.css";

export function SupplierTermsReader({ document: legalDocument, onViewed }: { document: SupplierLegalDocument; onViewed: (hash: string) => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const ranges = useRef<ViewedRange[]>([]);
  const measuredHeight = useRef(0);
  const completed = useRef(false);
  useEffect(() => {
    const element = viewport.current;
    if (!element || legalDocument.status !== "PUBLISHED" || !legalDocument.content.trim()) return;
    const measure = () => {
      if (document.visibilityState !== "visible") return;
      const bounds = element.getBoundingClientRect();
      const visibleTop = Math.max(0, -bounds.top);
      const visibleBottom = Math.min(element.clientHeight, window.innerHeight - bounds.top);
      if (visibleBottom <= visibleTop) return;
      if (measuredHeight.current !== element.scrollHeight) {
        ranges.current = []; measuredHeight.current = element.scrollHeight; completed.current = false;
      }
      ranges.current = addViewedRange(ranges.current, element.scrollTop + visibleTop, element.scrollTop + visibleBottom);
      if (!completed.current && viewedEntireDocument(ranges.current, element.scrollHeight)) {
        completed.current = true; onViewed(legalDocument.hash);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener("scroll", measure);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", measure);
    measure();
    return () => { observer.disconnect(); element.removeEventListener("scroll", measure); window.removeEventListener("scroll", measure, true); window.removeEventListener("resize", measure); document.removeEventListener("visibilitychange", measure); };
  }, [legalDocument, onViewed]);
  return <div ref={viewport} className={styles.reader} tabIndex={0} role="region" aria-label={`Текст: ${legalDocument.title}`}>
    {legalDocument.content ? <div className={styles.text}>{legalDocument.content}</div> : <p>Текст документа пока не опубликован.</p>}
  </div>;
}
