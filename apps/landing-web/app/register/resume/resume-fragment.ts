type FragmentSource = Pick<Window, "location" | "addEventListener" | "removeEventListener">;

/** Observe same-document email-link navigation as well as the initial page load. */
export function observeResumeToken(source: FragmentSource, onToken: (token: string) => void) {
  let previous: string | undefined;
  const read = () => {
    const token = new URLSearchParams(source.location.hash.slice(1)).get("token") ?? "";
    if (token !== previous) { previous = token; onToken(token); }
  };
  source.addEventListener("hashchange", read);
  read();
  return () => source.removeEventListener("hashchange", read);
}
