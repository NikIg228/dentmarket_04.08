import { describe, expect, it } from "vitest";
import { summarizePilotSettings } from "./platform-settings-view-model";

describe("pilot settings summary", () => {
  it("keeps configured and live-verified integration evidence separate", () => {
    expect(
      summarizePilotSettings({
        channels: {
          total: 4,
          ready: 2,
          externalDependency: 2,
          liveVerified: 0,
        },
        paymentProviderCount: 1,
        activeComplianceRules: 3,
      }),
    ).toEqual({
      channelsConfigured: 4,
      channelsReadyInside: 2,
      channelsLiveVerified: 0,
      externalDependencies: 2,
      paymentProviderRegistered: true,
      paymentProviderCount: 1,
      activeComplianceRules: 3,
    });
  });

  it("does not claim that a payment process exists without a provider", () => {
    expect(
      summarizePilotSettings({
        channels: {
          total: 0,
          ready: 0,
          externalDependency: 0,
          liveVerified: 0,
        },
        paymentProviderCount: 0,
        activeComplianceRules: 0,
      }).paymentProviderRegistered,
    ).toBe(false);
  });
});
