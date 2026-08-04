export const processRoles = ["api", "worker", "all"] as const;

export type ProcessRole = (typeof processRoles)[number];

export type RuntimeCapabilities = {
  http: boolean;
  schedules: boolean;
  queueProducer: boolean;
  queueConsumer: boolean;
};

export function runtimeCapabilities(role: ProcessRole): RuntimeCapabilities {
  return {
    http: role !== "worker",
    schedules: role !== "api",
    queueProducer: true,
    queueConsumer: role !== "api",
  };
}
