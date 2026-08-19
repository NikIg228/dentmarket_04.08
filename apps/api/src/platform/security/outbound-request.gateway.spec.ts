import { describe, expect, it } from "vitest";
import {
  isPublicOutboundAddress,
  normalizeOutboundRequestHeaders,
  OutboundHttpResponse,
  OutboundRequestGateway,
  OutboundRequestPolicyError,
  OutboundRequestTimeoutError,
  type OutboundRequestOptions,
} from "./outbound-request.gateway";

class TestGateway extends OutboundRequestGateway {
  addresses: Array<{ address: string; family: 4 | 6 }> = [
    { address: "93.184.216.34", family: 4 },
  ];
  responses: OutboundHttpResponse[] = [
    new OutboundHttpResponse(200, new Headers(), '{"ok":true}'),
  ];
  dispatched: URL[] = [];
  resolver?: () => Promise<Array<{ address: string; family: 4 | 6 }>>;

  protected override async resolveHost() {
    return this.resolver ? this.resolver() : this.addresses;
  }

  protected override async dispatch(
    url: URL,
    _target: {
      hostname: string;
      address: { address: string; family: 4 | 6 };
    },
    _options: OutboundRequestOptions,
  ) {
    this.dispatched.push(new URL(url));
    const response = this.responses.shift();
    if (!response) throw new Error("Missing test response");
    return response;
  }
}

describe("OutboundRequestGateway", () => {
  it("rejects private, loopback, link-local, reserved and non-global addresses", () => {
    for (const address of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "198.51.100.10",
      "224.0.0.1",
      "240.0.0.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "2001:db8::1",
      "2002:7f00:1::",
      "ff02::1",
    ]) {
      expect(isPublicOutboundAddress(address), address).toBe(false);
    }
    expect(isPublicOutboundAddress("93.184.216.34")).toBe(true);
    expect(isPublicOutboundAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("rejects unsafe schemes, credentials and ports before dispatch", async () => {
    const gateway = new TestGateway();
    for (const url of [
      "http://example.com",
      "https://user:password@example.com",
      "https://example.com:8443",
    ]) {
      await expect(gateway.request(url)).rejects.toBeInstanceOf(
        OutboundRequestPolicyError,
      );
    }
    expect(gateway.dispatched).toHaveLength(0);
  });

  it("rejects unsafe transport headers and forces identity encoding", () => {
    for (const name of [
      "Host",
      "Connection",
      "Content-Length",
      "Transfer-Encoding",
      "Proxy-Authorization",
    ]) {
      expect(() =>
        normalizeOutboundRequestHeaders({ [name]: "unsafe" }),
      ).toThrow(OutboundRequestPolicyError);
    }
    expect(
      normalizeOutboundRequestHeaders({
        Accept: "application/problem+json",
        "Accept-Encoding": "gzip",
      }),
    ).toMatchObject({
      accept: "application/problem+json",
      "accept-encoding": "identity",
    });
  });

  it("rejects a private IP literal with the production resolver", async () => {
    const gateway = new OutboundRequestGateway();
    for (const url of [
      "https://127.0.0.1/internal",
      "https://127.1/internal",
      "https://2130706433/internal",
      "https://0x7f000001/internal",
      "https://[::1]/internal",
    ]) {
      await expect(gateway.request(url)).rejects.toBeInstanceOf(
        OutboundRequestPolicyError,
      );
    }
  });

  it("rejects a hostname when any A or AAAA answer is non-public", async () => {
    const gateway = new TestGateway();
    gateway.addresses = [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];
    await expect(
      gateway.request("https://supplier.example.kz/api"),
    ).rejects.toBeInstanceOf(OutboundRequestPolicyError);
    expect(gateway.dispatched).toHaveLength(0);
  });

  it("bounds DNS resolution by the total request deadline", async () => {
    const gateway = new TestGateway();
    gateway.resolver = () => new Promise(() => undefined);
    await expect(
      gateway.request("https://supplier.example.kz/api", { timeoutMs: 5 }),
    ).rejects.toBeInstanceOf(OutboundRequestTimeoutError);
    expect(gateway.dispatched).toHaveLength(0);
  });

  it("pins provider hosts and rejects cross-origin redirects", async () => {
    const gateway = new TestGateway();
    await expect(
      gateway.request("https://supplier.example.kz/api", {
        allowedHosts: ["api.moysklad.ru"],
      }),
    ).rejects.toBeInstanceOf(OutboundRequestPolicyError);

    const redirectHeaders = new Headers({
      location: "https://other.example.kz/internal",
    });
    gateway.responses = [new OutboundHttpResponse(302, redirectHeaders, "")];
    await expect(
      gateway.request("https://supplier.example.kz/api"),
    ).rejects.toBeInstanceOf(OutboundRequestPolicyError);
  });

  it("revalidates DNS on every same-origin redirect hop", async () => {
    const gateway = new TestGateway();
    gateway.responses = [
      new OutboundHttpResponse(302, new Headers({ location: "/next" }), ""),
      new OutboundHttpResponse(200, new Headers(), "{}"),
    ];
    let resolution = 0;
    gateway.addresses = [{ address: "93.184.216.34", family: 4 }];
    gateway.resolver = async () => {
      resolution += 1;
      return resolution === 1
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "10.0.0.1", family: 4 }];
    };

    await expect(
      gateway.request("https://supplier.example.kz/api"),
    ).rejects.toBeInstanceOf(OutboundRequestPolicyError);
    expect(gateway.dispatched).toHaveLength(1);
  });

  it("rejects redirects for outbound write operations", async () => {
    const gateway = new TestGateway();
    gateway.responses = [
      new OutboundHttpResponse(302, new Headers({ location: "/next" }), ""),
    ];
    await expect(
      gateway.request("https://supplier.example.kz/orders", {
        method: "POST",
        body: "{}",
      }),
    ).rejects.toBeInstanceOf(OutboundRequestPolicyError);
    expect(gateway.dispatched).toHaveLength(1);
  });

  it("allows an approved public destination", async () => {
    const gateway = new TestGateway();
    const response = await gateway.request(
      "https://api.moysklad.ru/api/remap/1.2/context/employee/",
      { allowedHosts: ["api.moysklad.ru"] },
    );
    expect(response.ok).toBe(true);
    await expect(response.text()).resolves.toBe('{"ok":true}');
    expect(gateway.dispatched).toHaveLength(1);
  });
});
