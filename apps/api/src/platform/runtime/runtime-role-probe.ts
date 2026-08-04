import "reflect-metadata";
import { AppModule } from "../../app.module";
import { environment } from "../config/environment";
import { runtimeCapabilities } from "./process-role";

const config = environment();
const imports = Reflect.getMetadata("imports", AppModule) as Array<{ module?: { name?: string }; name?: string }>;
const scheduleModule = imports.some((entry) => (entry.module ?? entry).name === "ScheduleModule");
process.stdout.write(`${JSON.stringify({ role: config.PROCESS_ROLE, capabilities: runtimeCapabilities(config.PROCESS_ROLE), scheduleModule })}\n`);
