import { z } from "zod";

export const deploymentProfileSchema = z
  .enum(["pilot", "go_live"])
  .default("pilot");
export * from "./deployment-policy";

// Only these public values enter a browser bundle. Never spread server env here.
export function frontendDeploymentEnvironment(
  env: Record<string, string | undefined>,
) {
  const profile = deploymentProfileSchema.parse(env.DEPLOYMENT_PROFILE);
  if (
    env.NEXT_PUBLIC_DEPLOYMENT_PROFILE !== undefined &&
    deploymentProfileSchema.parse(env.NEXT_PUBLIC_DEPLOYMENT_PROFILE) !==
      profile
  ) {
    throw new Error(
      "NEXT_PUBLIC_DEPLOYMENT_PROFILE must match DEPLOYMENT_PROFILE; rebuild web apps with the API profile",
    );
  }
  return { NEXT_PUBLIC_DEPLOYMENT_PROFILE: profile };
}
