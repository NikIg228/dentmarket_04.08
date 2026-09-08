import { describe, expect, it } from "vitest";
import {
  deploymentProfileModules,
  OUT_OF_PILOT_MODULE_NAMES,
} from "./deployment-profile.modules";

describe("deployment profile module composition", () => {
  it("excludes every out-of-scope product module from pilot", () => {
    expect(deploymentProfileModules("pilot")).toEqual([]);
  });

  it("includes every out-of-pilot module in go_live", () => {
    expect(
      deploymentProfileModules("go_live").map((module) => module.name),
    ).toEqual(OUT_OF_PILOT_MODULE_NAMES);
  });
});
