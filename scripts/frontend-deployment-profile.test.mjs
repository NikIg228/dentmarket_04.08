import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const app of ["buyer", "supplier", "admin", "landing"]) {
  test(`${app} Next config defaults safely, propagates go_live, and rejects conflicts`, () => {
    for (const [profile, publicProfile, expected] of [
      [undefined, undefined, "pilot"],
      ["pilot", "pilot", "pilot"],
      ["go_live", undefined, "go_live"],
      ["go_live", "go_live", "go_live"],
      [undefined, "go_live", null],
      ["pilot", "go_live", null],
      ["go_live", "pilot", null],
      ["typo", undefined, null],
    ]) {
      const env = { ...process.env };
      delete env.DEPLOYMENT_PROFILE;
      delete env.NEXT_PUBLIC_DEPLOYMENT_PROFILE;
      if (profile !== undefined) env.DEPLOYMENT_PROFILE = profile;
      if (publicProfile !== undefined)
        env.NEXT_PUBLIC_DEPLOYMENT_PROFILE = publicProfile;
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `const {default: config} = await import('./apps/${app}-web/next.config.ts'); process.stdout.write(JSON.stringify(config.env));`,
        ],
        { cwd: root, env, encoding: "utf8", timeout: 15000 },
      );
      assert.ifError(result.error);
      if (expected === null) {
        assert.notEqual(
          result.status,
          0,
          `${app}: conflicting profile accepted`,
        );
        assert.match(
          result.stderr,
          /must match DEPLOYMENT_PROFILE|Invalid option/,
        );
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), {
          NEXT_PUBLIC_DEPLOYMENT_PROFILE: expected,
        });
      }
    }
  });
}
