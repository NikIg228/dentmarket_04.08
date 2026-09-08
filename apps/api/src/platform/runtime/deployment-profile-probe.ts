import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "../../app.module";
import { environment } from "../config/environment";

async function probe() {
  const config = environment();
  const imports = Reflect.getMetadata("imports", AppModule) as Array<{
    module?: { name?: string };
    name?: string;
  }>;
  const moduleNames = imports
    .map((entry) => (entry.module ?? entry).name)
    .filter((name): name is string => Boolean(name));
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Deployment profile probe")
        .setVersion("1")
        .build(),
    );
    process.stdout.write(
      `${JSON.stringify({
        profile: config.DEPLOYMENT_PROFILE,
        moduleNames,
        paths: Object.keys(document.paths).sort(),
      })}\n`,
    );
  } finally {
    await app.close();
  }
}

void probe().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
