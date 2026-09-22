import net from "node:net";

export async function assertPortsAvailable(ports, host = "127.0.0.1") {
  for (const port of ports) await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(new Error(`Port ${host}:${port} is occupied. Stop the known local instance or choose a consistent port profile; no existing process was stopped.`)));
    probe.listen(port, host, () => probe.close(resolve));
  });
}
export async function waitForSurface(url, isExited = () => false, timeout = 300_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (isExited()) throw new Error(`Process stopped before readiness: ${url}`);
    try { const response = await fetch(url, { signal: AbortSignal.timeout(15_000) }); if (response.ok) return; } catch { /* Compilation may still be in progress. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Readiness timed out: ${url}`);
}
