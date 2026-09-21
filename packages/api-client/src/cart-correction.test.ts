import { afterEach, expect, it, vi } from "vitest";
import { MarketplaceApiClient } from "./index.js";
afterEach(() => vi.unstubAllGlobals());
it("sends explicit version and quantity with bearer for PATCH/DELETE and reprice", async () => {
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>Response.json({id:"cart",version:3}));vi.stubGlobal("fetch",fetcher);
  const api=new MarketplaceApiClient("http://localhost/api",{accessToken:"synthetic"});
  await api.updateCartItem("cart","item",{quantity:2,expectedVersion:2});
  await api.removeCartItem("cart","item",{expectedVersion:3});
  await api.repriceCart("cart",{expectedVersion:4});
  expect(fetcher.mock.calls.map(([url,init])=>({url,method:init?.method,body:JSON.parse(String(init?.body))}))).toEqual([
    {url:"http://localhost/api/carts/cart/items/item",method:"PATCH",body:{quantity:2,expectedVersion:2}},
    {url:"http://localhost/api/carts/cart/items/item",method:"DELETE",body:{expectedVersion:3}},
    {url:"http://localhost/api/carts/cart/reprice",method:"POST",body:{expectedVersion:4}},
  ]);
  expect(fetcher.mock.calls[0][1]?.headers).toEqual({"content-type":"application/json",authorization:"Bearer synthetic"});
});
