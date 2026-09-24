import { describe, expect, it, vi } from "vitest";
import { OrganizationProfileService, organizationProfileFields } from "./organization-profile.service";
import { CommerceService } from "../commerce/commerce.service";
const id = "00000000-0000-4000-8000-000000000001";
const cityId = "00000000-0000-4000-8000-000000000002";
const context = { organizationId: id, actorId: "actor" };
const address = { cityId, line1: "Test street 1", postalCode: null };
const input = { contactName: "Test Person", phone: "+77000000000", email: "fixture@example.invalid", legalAddress: address, deliveryAddress: { ...address, line1: "Test delivery 2" }, expectedVersion: 1, idempotencyKey: "test-profile-save" };
function setup() {
  const organization = { id, version: 1, legalName: "Test clinic", displayName: "Test", bin: "999999999999", capabilities: [{ capability: "BUYER" }] };
  let stored: any = null;
  const addresses = new Map<string, any>(); const records = new Map<string, any>();
  const db: any = {
    organizationMembership: { findFirst: vi.fn(async () => ({ organization })) },
    organizationProfile: { findUnique: vi.fn(async () => stored ? { ...stored, legalAddress: addresses.get(stored.legalAddressId), deliveryAddress: addresses.get(stored.deliveryAddressId) } : null), upsert: vi.fn(async ({ create, update }: any) => stored = stored ? { ...stored, ...update } : create) },
    city: { findMany: vi.fn(async () => [{ id: cityId, regionId: "region", region: { countryId: "country" } }]) },
    address: { create: vi.fn(async ({ data }: any) => { const key = `address-${addresses.size}`; addresses.set(key, { id: key, ...data }); return addresses.get(key); }), updateMany: vi.fn(async ({ where, data }: any) => { const previous = addresses.get(where.id); if (previous?.organizationId !== where.organizationId) return { count: 0 }; addresses.set(where.id, { ...previous, ...data }); return { count: 1 }; }) },
    organization: { findUnique: vi.fn(async () => organization), updateMany: vi.fn(async ({ where }: any) => { if (organization.version !== where.version) return { count: 0 }; organization.version++; return { count: 1 }; }) },
    organizationCapability: { findUnique: vi.fn(async () => null) },
    idempotencyRecord: { findUnique: vi.fn(async ({ where }: any) => records.get(where.scope_key.key) ?? null), create: vi.fn(async ({ data }: any) => records.set(data.key, data)) },
    cart: { create: vi.fn() }, auditLog: { create: vi.fn() }, outboxEvent: { create: vi.fn() },
  };
  db.$transaction = vi.fn(async (run: any) => run(db));
  return { db, organization, addresses, service: new OrganizationProfileService(db) };
}
describe("organization profile ownership and atomic save", () => {
  it("checks active tenant membership and edit permission before reading or writing the profile", async () => {
    const t = setup(); t.db.organizationMembership.findFirst.mockResolvedValue(null);
    await expect(t.service.current(context)).rejects.toMatchObject({ status: 403 });
    await expect(t.service.save(input, context)).rejects.toMatchObject({ status: 403 });
    expect(t.db.organizationProfile.findUnique).not.toHaveBeenCalled(); expect(t.db.$transaction).not.toHaveBeenCalled();
    expect(t.db.organizationMembership.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: context.actorId, organizationId: id, status: "ACTIVE", user: { status: "ACTIVE" } }) }));
  });
  it("writes separate owned addresses and replays once without duplicate version/audit/outbox", async () => {
    const t = setup(); const saved = await t.service.save(input, context);
    expect(saved).toMatchObject({ complete: true, version: 2, profile: { legalAddress: address, deliveryAddress: input.deliveryAddress } });
    expect(await t.service.save(input, context)).toEqual(saved);
    expect(t.db.address.create).toHaveBeenCalledTimes(2);
    expect([...t.addresses.values()].every(value => value.organizationId === id)).toBe(true);
    expect(t.db.auditLog.create).toHaveBeenCalledTimes(1); expect(t.db.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(t.db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
  });
  it("rejects stale versions and changed payload under a reused key before mutation", async () => {
    const t = setup(); await t.service.save(input, context);
    await expect(t.service.save({ ...input, phone: "+77000000001" }, context)).rejects.toMatchObject({ status: 409 });
    await expect(t.service.save({ ...input, idempotencyKey: "another-key" }, context)).rejects.toMatchObject({ status: 409 });
    expect(t.db.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it("splits a shared legacy address when legal and delivery details diverge", async () => {
    const t = setup(); await t.service.save(input, context);
    await t.db.organizationProfile.upsert({ update: { deliveryAddressId: "address-0" } });
    const saved = await t.service.save({ ...input, expectedVersion: 2, idempotencyKey: "split-shared-address" }, context);
    expect(saved.profile?.legalAddress).toEqual(address);
    expect(saved.profile?.deliveryAddress).toEqual(input.deliveryAddress);
    const stored = await t.db.organizationProfile.findUnique({});
    expect(stored.deliveryAddressId).not.toBe(stored.legalAddressId);
  });
  it("does not invalidate admission for a no-op save, and fails closed on foreign addresses", async () => {
    const t = setup(); await t.service.save(input, context);
    expect((await t.service.save({ ...input, expectedVersion: 2, idempotencyKey: "another-key" }, context)).version).toBe(2);
    expect(t.db.auditLog.create).toHaveBeenCalledTimes(1);
    t.addresses.get("address-0").organizationId = "foreign";
    expect(await organizationProfileFields(t.db, id)).toBeNull();
  });
  it("denies cart creation without a profile and denies foreign tenant before profile lookup", async () => {
    const t = setup(); const commerce = new CommerceService(t.db, {} as never, {} as never, {} as never, {} as never, {} as never);
    await expect(commerce.createCart(id, { currency: "KZT" }, context)).rejects.toMatchObject({ status: 409 });
    t.db.organizationProfile.findUnique.mockClear();
    await expect(commerce.createCart(id, { currency: "KZT" }, { ...context, organizationId: "foreign" })).rejects.toMatchObject({ status: 403 });
    expect(t.db.organizationProfile.findUnique).not.toHaveBeenCalled(); expect(t.db.cart.create).not.toHaveBeenCalled();
  });
});
