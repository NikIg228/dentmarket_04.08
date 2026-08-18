import { Global, Module } from "@nestjs/common";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { OutboxHandlerRegistry } from "./outbox-handler.registry";
import { OutboxWorkerService } from "./outbox-worker.service";

@Global()
@Module({
  providers: [
    OutboxHandlerRegistry,
    OutboxDispatcherService,
    OutboxWorkerService,
  ],
  exports: [OutboxHandlerRegistry, OutboxDispatcherService],
})
export class OutboxModule {}
