import { afterEach, expect, it, vi } from "vitest";
import { MarketplaceApiClient } from "./index.js";
afterEach(() => vi.unstubAllGlobals());
it.each(["0","125","9007199254740993","99999999999999999999"])("transports exact string amount %s without coercion", async amountMinor => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({id:"synthetic-document"}));vi.stubGlobal("fetch",fetcher);
  const api = new MarketplaceApiClient("http://localhost/api",{accessToken:"synthetic-token"});
  await api.uploadDocument({ownerOrganizationId:"00000000-0000-4000-8000-000000000030",kind:"OTHER",format:"PDF",title:"Тест",documentNumber:"AUD07",fileName:"test.pdf",contentBase64:"JVBERi0xLjQ=",amountMinor,currency:"KZT",requiredSignatureCount:0});
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("http://localhost/api/documents/upload");
  expect(JSON.parse(fetcher.mock.calls[0][1].body).amountMinor).toBe(amountMinor);
});
