export function summarizePilotSettings(input: {
  channels: {
    total: number;
    ready: number;
    externalDependency: number;
    liveVerified: number;
  };
  paymentProviderCount: number;
  activeComplianceRules: number;
}) {
  return {
    channelsConfigured: input.channels.total,
    channelsReadyInside: input.channels.ready,
    channelsLiveVerified: input.channels.liveVerified,
    externalDependencies: input.channels.externalDependency,
    paymentProviderRegistered: input.paymentProviderCount > 0,
    paymentProviderCount: input.paymentProviderCount,
    activeComplianceRules: input.activeComplianceRules,
  };
}
