process.env.PROCESS_ROLE ??= "worker";

void import("./worker-bootstrap").then(({ bootstrapWorker }) => bootstrapWorker());
