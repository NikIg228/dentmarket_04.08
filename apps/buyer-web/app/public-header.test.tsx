import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@marketplace/ui", () => ({ DmButton: "button", DmInput: "input" }));
vi.mock("./city-location", () => ({ CityLocation: () => null }));

import { PublicHeader } from "./public-header";

describe("public search initial state", () => {
  it.each(["", "пер"])("does not expose suggestions before interaction for query '%s'", (query) => {
    const html = renderToStaticMarkup(createElement(PublicHeader, {
      active: "catalog",
      query,
      recentSearches: ["расходные материалы", "инструменты"],
      onSearch: () => undefined,
    }));
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain("<datalist");
  });
});
