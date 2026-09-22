import { describe, expect, it, vi } from "vitest";
import { MetricsController } from "./metrics.controller";
const token = "synthetic-metrics-token-never-use-outside-tests";
vi.mock("../config/environment", () => ({ environment: () => ({ METRICS_BEARER_TOKEN: "synthetic-metrics-token-never-use-outside-tests" }) }));

describe("dedicated scraper authorization", () => {
  it.each([undefined, "Bearer incorrect-token", "Bearer " + "x".repeat(token.length), "Basic " + token])("rejects missing or incorrect credentials before rendering", async authorization => {
    const metrics = { render: vi.fn(), contentType: vi.fn() };
    await expect(new MetricsController(metrics as never).scrape(authorization, {} as never)).rejects.toMatchObject({ status: 401 });
    expect(metrics.render).not.toHaveBeenCalled();
  });
  it("renders metrics only for the configured scraper token", async () => {
    const metrics = { render: vi.fn().mockResolvedValue("synthetic_metric 1"), contentType: () => "text/plain" };
    const response = { type: vi.fn(), send: vi.fn() };
    await new MetricsController(metrics as never).scrape("Bearer " + token, response as never);
    expect(response.type).toHaveBeenCalledWith("text/plain");
    expect(response.send).toHaveBeenCalledWith("synthetic_metric 1");
  });
});
