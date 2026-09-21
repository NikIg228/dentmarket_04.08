import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { environment, resetEnvironmentForTests } from "./environment";
beforeEach(() => {
  resetEnvironmentForTests();
  for (const [key, value] of Object.entries({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@127.0.0.1/test", API_HOST: "127.0.0.1", AUTH_MODE: "jwt", JWT_SECRET: "synthetic-test-key-at-least-thirty-two-characters", JWT_REQUIRE_MFA: "true", AUTH_LOCAL_MAIL_ENABLED: "false", LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED: "false" })) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllEnvs(); resetEnvironmentForTests(); });
it("defaults capabilities off", () => { expect(environment()).toMatchObject({ AUTH_LOCAL_MAIL_ENABLED: false, LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED: false }); });
it("accepts explicit isolated JWT/MFA tools", () => {
  vi.stubEnv("AUTH_LOCAL_MAIL_ENABLED", "true"); vi.stubEnv("LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED", "true");
  expect(environment()).toMatchObject({ AUTH_LOCAL_MAIL_ENABLED: true, LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED: true });
});
it.each(["AUTH_LOCAL_MAIL_ENABLED", "LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED"])("rejects production %s", key => {
  vi.stubEnv(key, "true"); vi.stubEnv("NODE_ENV", "production");
  expect(() => environment()).toThrow("Local auth tools require non-production loopback API");
});
it.each(["AUTH_LOCAL_MAIL_ENABLED", "LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED"])("rejects network bind %s", key => {
  vi.stubEnv(key, "true"); vi.stubEnv("API_HOST", "0.0.0.0");
  expect(() => environment()).toThrow("non-production loopback");
});
it.each([{ AUTH_MODE: "development" }, { JWT_REQUIRE_MFA: "false" }])("requires real JWT and MFA %j", override => {
  vi.stubEnv("LOCAL_OPERATOR_PASSWORD_LOGIN_ENABLED", "true");
  for (const [key, value] of Object.entries(override)) vi.stubEnv(key, value!);
  expect(() => environment()).toThrow("requires JWT and mandatory MFA");
});
