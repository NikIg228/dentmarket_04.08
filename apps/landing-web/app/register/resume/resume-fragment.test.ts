import { describe, expect, it, vi } from "vitest";
import { observeResumeToken } from "./resume-fragment";

function setup(hash = "") {
  const events = new EventTarget();
  const source = { location: { hash }, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) } as unknown as Parameters<typeof observeResumeToken>[0];
  const changed = vi.fn();
  const cleanup = observeResumeToken(source, changed);
  const navigate = (next: string) => { source.location.hash = next; events.dispatchEvent(new Event("hashchange")); };
  return { changed, cleanup, navigate };
}

describe("registration resume fragment lifecycle", () => {
  it("reads a direct email link on initial mount", () => {
    const { changed, cleanup } = setup("#token=initial-proof");
    expect(changed).toHaveBeenCalledExactlyOnceWith("initial-proof"); cleanup();
  });
  it("observes a same-page link and a different proof without requiring reload", () => {
    const { changed, navigate, cleanup } = setup();
    navigate("#token=first"); navigate("#token=second"); navigate("");
    expect(changed.mock.calls).toEqual([[""], ["first"], ["second"], [""]]); cleanup();
  });
  it("does not reset form state for an unchanged token or unrelated fragment", () => {
    const { changed, navigate, cleanup } = setup("#token=same");
    navigate("#token=same&unrelated=value");
    expect(changed).toHaveBeenCalledTimes(1); cleanup();
  });
  it("cleans up the listener on unmount", () => {
    const { changed, navigate, cleanup } = setup(); cleanup();
    navigate("#token=late"); expect(changed).toHaveBeenCalledExactlyOnceWith("");
  });
});
