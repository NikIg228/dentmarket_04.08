import assert from "node:assert/strict";
const verified = new WeakSet();

// Synthetic fixture only. Never fill real organization data to satisfy an application gate.
export async function completeFixtureOrganization(db, organizationId) {
  if (!verified.has(db)) {
    const target = new URL(process.env.POSTGRES_TEST_DATABASE_URL ?? process.env.DATABASE_URL);
    const name = process.env.GITHUB_ACTIONS === "true" ? "marketplace" : "dentmarket_audit_20260914";
    assert(["127.0.0.1", "localhost"].includes(target.hostname) && target.pathname === `/${name}`, "Organization fixtures require the approved isolated database");
    const [identity] = await db.$queryRaw`SELECT current_database() AS name`;
    assert.equal(identity.name, name); verified.add(db);
  }
  if (await db.organizationProfile.findUnique({ where: { organizationId } })) return;
  const city = await db.city.findFirstOrThrow({ include: { region: true }, orderBy: { id: "asc" } });
  await db.$transaction(async tx => {
    const legal = await tx.address.create({ data: { organizationId, cityId: city.id, regionId: city.regionId, countryId: city.region.countryId, line1: "Synthetic fixture street 1" } });
    const delivery = await tx.address.create({ data: { organizationId, cityId: city.id, regionId: city.regionId, countryId: city.region.countryId, line1: "Synthetic fixture delivery 2" } });
    await tx.organizationProfile.create({ data: { organizationId, contactName: "Synthetic Fixture", phone: "+77000000000", email: "organization-fixture@example.invalid", legalAddressId: legal.id, deliveryAddressId: delivery.id } });
  });
}
