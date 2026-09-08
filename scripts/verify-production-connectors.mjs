import {
  evaluateHealthProbeConfiguration,
  evaluateProductionConfiguration,
} from "./lib/production-readiness.mjs";

const configuration = evaluateProductionConfiguration(process.env);
const probeConfiguration = evaluateHealthProbeConfiguration(process.env);
const shouldProbe = process.env.CHECK_EXTERNAL_CONNECTORS === "1";
const checks = [];

if (shouldProbe && configuration.configured) {
  for (const probe of probeConfiguration) {
    if (!probe.configured) {
      checks.push({ id: probe.id, reachable: false, issues: probe.issues });
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(process.env[probe.urlKey], {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${process.env[probe.tokenKey]}`,
        },
      });
      checks.push({
        id: probe.id,
        status: response.status,
        reachable: response.ok,
      });
    } catch (error) {
      checks.push({
        id: probe.id,
        reachable: false,
        error: error instanceof Error ? error.name : "unknown",
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

const reachabilityVerified =
  shouldProbe &&
  checks.length === probeConfiguration.length &&
  checks.every((check) => check.reachable);
const result = {
  profile: process.env.DEPLOYMENT_PROFILE ?? "pilot",
  configured: configuration.configured,
  configurationChecks: configuration.checks,
  reachabilityRequested: shouldProbe,
  reachabilityVerified,
  checks,
  liveVerified: false,
  liveEvidenceRequired: true,
  note: "Endpoint reachability is not PSP capture/refund/webhook, EDS signing, supplier sync, notification delivery or infrastructure evidence.",
};

console.log(JSON.stringify(result, null, 2));
if (!configuration.configured || (shouldProbe && !reachabilityVerified))
  process.exitCode = 1;
