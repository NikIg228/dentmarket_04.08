import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deploymentFeatures,
  deploymentProfileSchema,
  isDeploymentApiPathEnabled,
  OUT_OF_PILOT_ROUTE_PREFIXES,
} from "@marketplace/schemas";
import { localDevelopmentProfile } from "./lib/local-development-profile.mjs";

test("local launch enables the same five feature groups for API and web", () => {
  const profile = localDevelopmentProfile({});
  assert.deepEqual(profile, {
    DEPLOYMENT_PROFILE: "go_live",
    NEXT_PUBLIC_DEPLOYMENT_PROFILE: "go_live",
  });
  assert.deepEqual(deploymentFeatures(profile.DEPLOYMENT_PROFILE), {
    ai: true,
    trust: true,
    promotions: true,
    billing: true,
    recommendations: true,
  });
  for (const prefix of OUT_OF_PILOT_ROUTE_PREFIXES) {
    assert.equal(
      isDeploymentApiPathEnabled(profile.DEPLOYMENT_PROFILE, `/api${prefix}`),
      true,
    );
  }
});

test("explicit pilot remains available without changing the shared default", () => {
  assert.equal(deploymentProfileSchema.parse(undefined), "pilot");
  const profile = localDevelopmentProfile({ DEPLOYMENT_PROFILE: "pilot" });
  assert.deepEqual(profile, {
    DEPLOYMENT_PROFILE: "pilot",
    NEXT_PUBLIC_DEPLOYMENT_PROFILE: "pilot",
  });
  for (const enabled of Object.values(
    deploymentFeatures(profile.DEPLOYMENT_PROFILE),
  ))
    assert.equal(enabled, false);
});

test("invalid and mismatched profiles fail before spawning any service", () => {
  assert.throws(() => localDevelopmentProfile({ DEPLOYMENT_PROFILE: "typo" }));
  assert.throws(
    () => localDevelopmentProfile({ NEXT_PUBLIC_DEPLOYMENT_PROFILE: "pilot" }),
    /must match/,
  );
  assert.throws(
    () =>
      localDevelopmentProfile({
        DEPLOYMENT_PROFILE: "pilot",
        NEXT_PUBLIC_DEPLOYMENT_PROFILE: "go_live",
      }),
    /must match/,
  );
});

test("local launcher cannot downgrade production security", () => {
  assert.throws(
    () => localDevelopmentProfile({ NODE_ENV: "production" }),
    /cannot run in production/,
  );
});

test("profile projection never exposes server secrets or mutates caller env", () => {
  const env = Object.freeze({
    DATABASE_URL: "test-secret",
    OPENAI_API_KEY: "test-secret",
  });
  assert.deepEqual(Object.keys(localDevelopmentProfile(env)).sort(), [
    "DEPLOYMENT_PROFILE",
    "NEXT_PUBLIC_DEPLOYMENT_PROFILE",
  ]);
  assert.deepEqual(env, {
    DATABASE_URL: "test-secret",
    OPENAI_API_KEY: "test-secret",
  });
});
