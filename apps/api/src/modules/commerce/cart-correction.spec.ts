import { expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { CommerceService } from "./commerce.service";
import { CommerceController } from "./commerce.controller";
const context={actorId:"actor",organizationId:"buyer"};
function setup({claimed=1,version=2,status="ACTIVE",checked=false}={}) {
  const cart={id:"cart",version,status,checkout:checked?{id:"checkout"}:null,buyerOrganizationId:"buyer",items:[{id:"item",quantity:new Prisma.Decimal(4),unitPriceMinor:new Prisma.Decimal("9007199254740993"),pricingSnapshot:{accepted:"unchanged"}}]};
  const tx={cart:{updateMany:vi.fn().mockResolvedValue({count:claimed}),findUniqueOrThrow:vi.fn().mockResolvedValue(cart)},cartItem:{update:vi.fn(),delete:vi.fn()},auditLog:{create:vi.fn()}};
  const service=new CommerceService({$transaction:(run:(client:typeof tx)=>unknown)=>run(tx)} as never,{} as never,{} as never,{} as never,{} as never,{} as never);
  vi.spyOn(service as unknown as {requireCart:()=>Promise<typeof cart>},"requireCart").mockResolvedValue(cart);
  return {service,tx,cart};
}
it("updates quantity only, using exact old price and a parent CAS before any item write", async()=>{
  const {service,tx}=setup();await service.changeItem("cart","item",{quantity:2.5,expectedVersion:2},context);
  expect(tx.cart.updateMany).toHaveBeenCalledWith({where:{id:"cart",version:2,status:"ACTIVE",checkout:{is:null}},data:{version:{increment:1}}});
  const write=tx.cartItem.update.mock.calls[0][0];expect(write.data.totalPriceMinor.toString()).toBe("22517998136852483");
  expect(write.data).not.toHaveProperty("pricingSnapshot");expect(write.data).not.toHaveProperty("unitPriceMinor");
  expect(tx.cart.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.cartItem.update.mock.invocationCallOrder[0]);
  expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
});
it("removes without resolving the offer, and current-version retries do not mutate",async()=>{
  const {service,tx,cart}=setup();await service.changeItem("cart","item",{expectedVersion:2},context);
  expect(tx.cartItem.delete).toHaveBeenCalledWith({where:{id:"item"}});
  cart.items=[];await service.changeItem("cart","item",{expectedVersion:2},context);
  expect(tx.cartItem.delete).toHaveBeenCalledTimes(1);expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
});
it.each([{version:3},{status:"CHECKED_OUT"},{checked:true},{claimed:0}])("rejects stale or racing state without any item write %s",async(options)=>{
  const {service,tx}=setup(options);await expect(service.changeItem("cart","item",{quantity:2,expectedVersion:2},context)).rejects.toMatchObject({status:409});
  expect(tx.cartItem.update).not.toHaveBeenCalled();expect(tx.auditLog.create).not.toHaveBeenCalled();
});
it("no-op quantity does not increment version and foreign item update is not an upsert",async()=>{
  const {service,tx}=setup();await service.changeItem("cart","item",{quantity:4,expectedVersion:2},context);
  expect(tx.cart.updateMany).not.toHaveBeenCalled();
  await expect(service.changeItem("cart","foreign-item",{quantity:2,expectedVersion:2},context)).rejects.toMatchObject({status:404});
});
it("HTTP controller rejects missing version, zero quantity and extra authority before service",()=>{
  const service={changeItem:vi.fn()},controller=new CommerceController(service as never);
  expect(()=>controller.updateItem("cart","item",{quantity:2},"actor","buyer")).toThrow();
  expect(()=>controller.updateItem("cart","item",{quantity:0,expectedVersion:2},"actor","buyer")).toThrow();
  expect(()=>controller.removeItem("cart","item",{expectedVersion:2,organizationId:"foreign"},"actor","buyer")).toThrow();
  expect(service.changeItem).not.toHaveBeenCalled();
});
