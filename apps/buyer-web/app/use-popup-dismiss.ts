"use client";

import { useEffect, type RefObject } from "react";

type DismissReason = "outside" | "escape";

/** Only floating panels opt in; ordinary details/FAQ disclosures stay open. */
export function listenForPopupDismiss(
  root: HTMLElement,
  dismiss: (reason: DismissReason) => void,
  isOpen: () => boolean = () => true,
) {
  const document = root.ownerDocument;
  const outside = (event: Event) => {
    if (isOpen() && !event.composedPath().includes(root)) dismiss("outside");
  };
  const escape = (event: KeyboardEvent) => {
    if (
      event.key === "Escape" &&
      isOpen() &&
      !event.defaultPrevented &&
      event.composedPath().includes(root)
    ) {
      event.preventDefault();
      dismiss("escape");
    }
  };

  document.addEventListener("pointerdown", outside, { capture: true });
  document.addEventListener("focusin", outside);
  document.addEventListener("keydown", escape);
  return () => {
    document.removeEventListener("pointerdown", outside, { capture: true });
    document.removeEventListener("focusin", outside);
    document.removeEventListener("keydown", escape);
  };
}

/** Native details opens before its asynchronous toggle event reaches React. */
export function useDetailsPopupDismiss(
  root: RefObject<HTMLDetailsElement | null>,
  dismiss: (reason: DismissReason) => void,
) {
  useEffect(() => {
    const details = root.current;
    if (!details) return;
    return listenForPopupDismiss(details, dismiss, () => details.open);
  }, [root, dismiss]);
}

export function usePopupDismiss(
  root: RefObject<HTMLElement | null>,
  open: boolean,
  dismiss: (reason: DismissReason) => void,
) {
  useEffect(() => {
    if (!open || !root.current) return;
    return listenForPopupDismiss(root.current, dismiss);
  }, [root, open, dismiss]);
}
