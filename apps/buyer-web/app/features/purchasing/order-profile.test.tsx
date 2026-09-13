import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupplierOrder } from "./types";

// This test exercises the feature composition, not Fluent's browser focus engine.
// The real controls and keyboard interaction are covered by Playwright.
vi.mock("@fluentui/react-components", () => ({
  MessageBar: "div",
  MessageBarBody: "div",
}));
vi.mock("@marketplace/ui", () => ({
  DmButton: "button",
  DmInput: "input",
  DmSelect: "select",
  DmTable: ({ children }: { children: React.ReactNode }) =>
    createElement("table", null, createElement("tbody", null, children)),
  EmptyState: () => null,
  Metric: () => null,
  PageHeader: () => null,
  Section: ({ children }: { children: React.ReactNode }) =>
    createElement("section", null, children),
  StatusTag: ({ children }: { children: React.ReactNode }) =>
    createElement("span", null, children),
  formatDate: (value: string) => value,
  formatMoney: (value: string) => value,
  formatStatus: (value: string) => value,
}));

const delivered: SupplierOrder = {
  id: "profile-order",
  buyerOrganizationId: "profile-buyer",
  orderNumber: "PROFILE-001",
  status: "DELIVERED",
  subtotalAmountMinor: "120000",
  currency: "KZT",
  createdAt: "2026-09-13T00:00:00.000Z",
  supplier: { displayName: "Profile Supplier" },
  items: [],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("delivered order profile UI", () => {
  it.each(["pilot", "go_live"])(
    "keeps order details and gates the review form in %s",
    async (profile) => {
      vi.stubEnv("NEXT_PUBLIC_DEPLOYMENT_PROFILE", profile);
      vi.resetModules();
      const { MarketplaceApiClient } = await import("@marketplace/api-client");
      const { BuyerOrders } = await import("./buyer-orders");
      const html = renderToStaticMarkup(
        createElement(BuyerOrders, {
          orders: [delivered],
          api: new MarketplaceApiClient("http://localhost/api", {}),
          busy: null,
          submittedReviews: [],
          reviewDraft: () => ({ rating: 5, comment: "" }),
          onReviewDraftChange: () => undefined,
          onSubmitReview: () => undefined,
        }),
      );
      expect(html).toContain("PROFILE-001");
      expect(html).toContain("Profile Supplier");
      expect(html.includes("Оставить отзыв")).toBe(profile === "go_live");
    },
  );
});
