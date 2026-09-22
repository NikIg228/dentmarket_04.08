import { describe, expect, it, vi } from "vitest";
import { listenForPopupDismiss } from "./use-popup-dismiss";

function setup(isOpen?: () => boolean) {
  const document = new EventTarget();
  const root = { ownerDocument: document } as unknown as HTMLElement;
  const dismiss = vi.fn();
  const cleanup = listenForPopupDismiss(root, dismiss, isOpen);
  const fire = (type: string, inside = false, key?: string, prevented = false) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "composedPath", { value: () => inside ? [root, document] : [document] });
    Object.defineProperty(event, "key", { value: key });
    if (prevented) event.preventDefault();
    document.dispatchEvent(event);
    return event;
  };
  return { fire, dismiss, cleanup };
}

describe("floating panel dismissal", () => {
  it("reads native open state at event time, including rapid reopen before toggle", () => {
    let open = false;
    const { fire, dismiss, cleanup } = setup(() => open);
    fire("pointerdown");
    fire("focusin");
    expect(fire("keydown", true, "Escape").defaultPrevented).toBe(false);
    expect(dismiss).not.toHaveBeenCalled();
    open = true;
    expect(fire("keydown", true, "Escape").defaultPrevented).toBe(true);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith("escape");
    open = false;
    fire("focusin");
    open = true;
    fire("pointerdown");
    expect(dismiss).toHaveBeenLastCalledWith("outside");
    cleanup();
    fire("keydown", true, "Escape");
    expect(dismiss).toHaveBeenCalledTimes(2);
  });

  it.each(["pointerdown", "focusin"])("closes on outside %s without stealing focus", (type) => {
    const { fire, dismiss, cleanup } = setup();
    expect(fire(type).defaultPrevented).toBe(false);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith("outside");
    cleanup();
  });

  it("does not close on interaction inside the panel", () => {
    const { fire, dismiss, cleanup } = setup();
    fire("pointerdown", true);
    fire("focusin", true);
    expect(dismiss).not.toHaveBeenCalled();
    cleanup();
  });

  it("closes on Escape within the panel and handles the key", () => {
    const { fire, dismiss, cleanup } = setup();
    expect(fire("keydown", true, "Escape").defaultPrevented).toBe(true);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith("escape");
    cleanup();
  });

  it("does not hijack other keys, outside Escape or a nested control's handled Escape", () => {
    const { fire, dismiss, cleanup } = setup();
    fire("keydown", true, "Enter");
    fire("keydown", false, "Escape");
    fire("keydown", true, "Escape", true);
    expect(dismiss).not.toHaveBeenCalled();
    cleanup();
  });

  it("removes listeners when closed or unmounted", () => {
    const { fire, dismiss, cleanup } = setup();
    cleanup();
    fire("pointerdown");
    fire("focusin");
    fire("keydown", true, "Escape");
    expect(dismiss).not.toHaveBeenCalled();
  });
});
