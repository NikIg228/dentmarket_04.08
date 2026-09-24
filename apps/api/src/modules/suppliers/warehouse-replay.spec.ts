import { expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { SuppliersService } from "./suppliers.service";
const input = { code: "MAIN", name: "Test warehouse", cityId: "city", addressLine: "Test street 1", timezone: "Asia/Almaty" };
const warehouse = { id: "warehouse", supplierOrganizationId: "supplier", status: "ACTIVE", ...input };
function setup() {
  let stored: typeof warehouse | null = null;
  const db: any = { warehouse: { findUnique: vi.fn(async () => stored), create: vi.fn(async () => stored = warehouse) }, auditLog: { create: vi.fn() }, outboxEvent: { create: vi.fn() } };
  db.$transaction = vi.fn(async (run: any) => run(db));
  const access = { assertCanManage: vi.fn(), requireProfile: vi.fn() };
  return { db, access, service: new SuppliersService(db, access as never, {} as never), set: () => { stored = warehouse; } };
}
it("retries warehouse creation without duplicate warehouse, audit or outbox", async () => {
  const t = setup();
  expect(await t.service.createWarehouse("supplier", input, { actorId: "actor", organizationId: "supplier" })).toEqual(warehouse);
  expect(await t.service.createWarehouse("supplier", input, { actorId: "actor", organizationId: "supplier" })).toEqual(warehouse);
  expect(t.db.warehouse.create).toHaveBeenCalledTimes(1); expect(t.db.auditLog.create).toHaveBeenCalledTimes(1); expect(t.db.outboxEvent.create).toHaveBeenCalledTimes(1);
  await expect(t.service.createWarehouse("supplier", { ...input, addressLine: "Changed street 2" }, { actorId: "actor", organizationId: "supplier" })).rejects.toMatchObject({ status: 409 });
});
it("returns the matching race winner and rechecks authority before any data lookup", async () => {
  const t = setup(); t.set();
  t.db.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique code", { code: "P2002", clientVersion: "test" }));
  expect(await t.service.createWarehouse("supplier", input, { actorId: "actor", organizationId: "supplier" })).toEqual(warehouse);
  t.db.warehouse.findUnique.mockClear(); t.access.assertCanManage.mockRejectedValue(new Error("foreign tenant"));
  await expect(t.service.createWarehouse("supplier", input, { actorId: "actor", organizationId: "foreign" })).rejects.toThrow("foreign tenant");
  expect(t.db.warehouse.findUnique).not.toHaveBeenCalled();
});
