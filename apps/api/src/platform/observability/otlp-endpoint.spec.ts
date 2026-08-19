import { describe, expect, it } from "vitest";
import { traceExporterUrl } from "./otlp-endpoint";

describe("OTLP trace exporter URL", () => {
  it("accepts both a collector base URL and an explicit trace endpoint", () => {
    expect(traceExporterUrl("https://otel.example.kz")).toBe(
      "https://otel.example.kz/v1/traces",
    );
    expect(traceExporterUrl("https://otel.example.kz/v1/traces")).toBe(
      "https://otel.example.kz/v1/traces",
    );
  });
});
