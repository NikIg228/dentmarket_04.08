import { frontendDeploymentEnvironment } from "@marketplace/schemas";

// The owner-approved full feature set applies only to the local launcher.
// Shared schema / production / CI defaults remain fail-safe pilot.
export function localDevelopmentProfile(env) {
  if (env.NODE_ENV === "production") {
    throw new Error("The local development launcher cannot run in production");
  }
  const profile = env.DEPLOYMENT_PROFILE ?? "go_live";
  const publicEnvironment = frontendDeploymentEnvironment({
    ...env,
    DEPLOYMENT_PROFILE: profile,
  });
  return Object.freeze({
    DEPLOYMENT_PROFILE: profile,
    ...publicEnvironment,
  });
}
