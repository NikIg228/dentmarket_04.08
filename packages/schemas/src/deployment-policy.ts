export type DeploymentProfile = "pilot" | "go_live";

export const OUT_OF_PILOT_ROUTE_PREFIXES = [
  "/promotions",
  "/billing",
  "/ai",
  "/trust",
  "/recommendations",
] as const;

export function deploymentFeatures(profile: DeploymentProfile) {
  const enabled = profile === "go_live";
  return Object.freeze({
    ai: enabled,
    trust: enabled,
    promotions: enabled,
    billing: enabled,
    recommendations: enabled,
  });
}

export function isDeploymentApiPathEnabled(
  profile: DeploymentProfile,
  url: string,
) {
  if (profile === "go_live") return true;
  try {
    const pathname = decodeURIComponent(
      new URL(url, "http://profile.invalid").pathname,
    );
    const path = pathname.replace(/^\/api(?=\/|$)/, "");
    return !OUT_OF_PILOT_ROUTE_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
  } catch {
    return false;
  }
}
