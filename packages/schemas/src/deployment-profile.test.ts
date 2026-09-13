import { describe, expect, it } from "vitest";
import {
  deploymentFeatures,
  deploymentProfileSchema,
  frontendDeploymentEnvironment,
  isDeploymentApiPathEnabled,
  OUT_OF_PILOT_ROUTE_PREFIXES,
} from "./deployment-profile";

describe("shared deployment profile", () => {
  it("defaults server and web to pilot and exposes no server configuration", () => {
    expect(deploymentProfileSchema.parse(undefined)).toBe("pilot");
    expect(frontendDeploymentEnvironment({ SECRET: "not-public" })).toEqual({
      NEXT_PUBLIC_DEPLOYMENT_PROFILE: "pilot",
    });
  });

  it.each(["pilot", "go_live"] as const)(
    "propagates explicit %s consistently",
    (profile) => {
      expect(
        frontendDeploymentEnvironment({
          DEPLOYMENT_PROFILE: profile,
          NEXT_PUBLIC_DEPLOYMENT_PROFILE: profile,
        }),
      ).toEqual({ NEXT_PUBLIC_DEPLOYMENT_PROFILE: profile });
      expect(Object.values(deploymentFeatures(profile))).toEqual(
        Array(5).fill(profile === "go_live"),
      );
    },
  );

  it.each([
    { NEXT_PUBLIC_DEPLOYMENT_PROFILE: "go_live" },
    { DEPLOYMENT_PROFILE: "pilot", NEXT_PUBLIC_DEPLOYMENT_PROFILE: "go_live" },
    { DEPLOYMENT_PROFILE: "go_live", NEXT_PUBLIC_DEPLOYMENT_PROFILE: "pilot" },
    { DEPLOYMENT_PROFILE: "staging" },
    { DEPLOYMENT_PROFILE: "" },
    { NEXT_PUBLIC_DEPLOYMENT_PROFILE: "invalid" },
  ])("rejects ambiguous or conflicting config %j", (env) => {
    expect(() => frontendDeploymentEnvironment(env)).toThrow();
  });

  it.each(OUT_OF_PILOT_ROUTE_PREFIXES)("blocks %s only in pilot", (prefix) => {
    for (const path of [
      prefix,
      `${prefix}/resource?enabled=true`,
      `/api${prefix}/resource`,
      `https://api.example.test/api${prefix}/resource`,
    ]) {
      expect(isDeploymentApiPathEnabled("pilot", path)).toBe(false);
      expect(isDeploymentApiPathEnabled("go_live", path)).toBe(true);
    }
  });

  it("handles URL-normalized and encoded paths without blocking core or prefix lookalikes", () => {
    for (const path of [
      "/api/catalog/../trust/reviews",
      "/api/%74rust/reviews",
      "/api/trust%2freviews",
    ]) {
      expect(isDeploymentApiPathEnabled("pilot", path)).toBe(false);
    }
    for (const path of [
      "/api/geo/cities",
      "/owner/budgets",
      "/documents/archive",
      "/carts/id/checkout",
      "/catalog/search?q=/trust/reviews",
      "/trustworthy",
      "/supplier-orders",
    ]) {
      expect(isDeploymentApiPathEnabled("pilot", path)).toBe(true);
    }
  });
});
