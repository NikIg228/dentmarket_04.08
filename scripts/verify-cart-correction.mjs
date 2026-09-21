// AUD-FIX-04 private browser fixture. Only the explicitly approved audit DB.
import assert from 'node:assert/strict';
import { startLocalAuthFixture } from './lib/local-auth-fixture.mjs';
const fixture = await startLocalAuthFixture({ web: true, operator: false, webApps: ['buyer'] });
const { db, runId, apiUrl } = fixture;
const cases = new Map();
async function createCase(index) {
  assert.ok(Number.isInteger(index) && index > 0 && index < 10 && !cases.has(index));
  const user = await fixture.account(index, 'BUYER');
  const role = await db.role.findFirstOrThrow({ where: { organizationId: user.organizationId } });
  for (const code of ['order.create','document.view','notification.view','catalog.product.view']) {
    const permission = await db.permission.findUniqueOrThrow({ where: { code } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  const agreement = await db.marketplaceAgreement.findFirstOrThrow({ where: { status: 'ACTIVE', startsAt: { lte: new Date() }, endsAt: { gt: new Date() } } });
  const supplierOrganizationId = agreement.supplierOrganizationId;
  const warehouse = await db.warehouse.findFirstOrThrow({ where: { supplierOrganizationId } });
  const reference = await db.supplierOffer.findFirstOrThrow({ where: { supplierOrganizationId, saleUnitId: { not: null } } });
  const name = `AUD04 Материал ${index}`, key = `${runId}-cart-${index}`;
  const product = await db.product.create({ data: { canonicalName: name, slug: key, baseUnitId: reference.saleUnitId, productType: 'MATERIAL', status: 'ACTIVE' } });
  const variant = await db.productVariant.create({ data: { productId: product.id, sku: key, saleUnitId: reference.saleUnitId, packageQuantity: 1, status: 'ACTIVE' } });
  const packaging = await db.productPackaging.create({ data: { productVariantId: variant.id, unitId: reference.saleUnitId, code: key, name: 'Единица', level: 'BASE', quantityInBaseUnit: 1 } });
  const offer = await db.supplierOffer.create({ data: { supplierOrganizationId, productVariantId: variant.id, saleUnitId: reference.saleUnitId, packagingId: packaging.id, supplierSku: key, confirmationMode: 'MANUAL', sourceType: 'MANUAL', status: 'ACTIVE' } });
  cases.set(index, { user, offerId: offer.id });
  await db.offerPublication.create({ data: { offerId: offer.id, status: 'PUBLISHED', marketplaceVisible: true, publishedAt: new Date() } });
  const freshnessExpiresAt = new Date(Date.now() + 3600000);
  await db.offerPrice.create({ data: { offerId: offer.id, amountMinor: 100000, currency: 'KZT', status: 'ACTIVE', validFrom: new Date(Date.now() - 60000), lastConfirmedAt: new Date(), freshnessExpiresAt } });
  const balance = await db.inventoryBalance.create({ data: { supplierOrganizationId, warehouseId: warehouse.id, productVariantId: variant.id, offerId: offer.id, quantityOnHand: 10, quantityReserved: 0, safetyStock: 0, quantityAvailable: 10, availabilityStatus: 'IN_STOCK', freshnessStatus: 'FRESH', source: 'MANUAL', externalUpdatedAt: new Date(), lastSuccessfulSyncAt: new Date(), freshnessExpiresAt } });
  await db.inventoryLot.create({ data: { inventoryBalanceId: balance.id, supplierOrganizationId, warehouseId: warehouse.id, productVariantId: variant.id, offerId: offer.id, lotNumber: key, quantityOnHand: 10, quantityReserved: 0, quantityAvailable: 10, status: 'ACTIVE', expirationDate: new Date('2035-12-31') } });
  const session = await fixture.request('/auth/login', { email: user.email, password: user.password });
  const cart = await fixture.request(`/buyers/${user.organizationId}/carts`, { currency: 'KZT' }, 201, session.accessToken);
  const item = await fixture.request(`/carts/${cart.id}/items`, { offerId: offer.id, quantity: 4 }, 201, session.accessToken);
  const handoff = await fixture.request('/auth/handoff', { capability: 'BUYER' }, 201, session.accessToken);
  cases.set(index, { user, offerId: offer.id, cartId: cart.id, itemId: item.id, accessToken: session.accessToken });
  return { name, cartId: cart.id, itemId: item.id, handoff: { capability: 'BUYER', organizationId: user.organizationId, handoffCode: handoff.handoffCode } };
}
async function readback(entry) {
  const cart = await db.cart.findUniqueOrThrow({ where: { id: entry.cartId }, include: { items: true } });
  return { version: cart.version, status: cart.status, items: cart.items.map(item => ({ quantity: item.quantity.toString(), price: item.unitPriceMinor.toString(), total: item.totalPriceMinor.toString() })), edits: await db.auditLog.count({ where: { entityId: cart.id, action: 'cart.item.quantity_changed' } }), removals: await db.auditLog.count({ where: { entityId: cart.id, action: 'cart.item.removed' } }) };
}
process.on('message', async message => {
  try {
    let value;
    if (message.type === 'create') value = await createCase(message.index);
    else {
      const entry = cases.get(message.index); assert.ok(entry?.cartId, 'Owned initialized case only');
      if (message.type === 'readback') value = await readback(entry);
      else if (message.type === 'order-readback') {
        const rows = await db.supplierOrderItem.findMany({ where: { cartItemId: entry.itemId } });
        value = rows.map(row => ({ quantity: row.quantity.toString(), price: row.unitPriceMinor.toString() }));
      }
      else if (message.type === 'concurrent-checkout') {
        const before = await readback(entry);
        await fixture.request(`/carts/${entry.cartId}/checkout`, { idempotencyKey: `${runId}-${message.index}-checkout`, expectedVersion: before.version }, 201, entry.accessToken);
        value = await readback(entry);
      }
      else if (message.type === 'price-stock') {
        await db.offerPrice.updateMany({ where: { offerId: entry.offerId }, data: { amountMinor: 150000 } });
        await db.inventoryBalance.updateMany({ where: { offerId: entry.offerId }, data: { quantityOnHand: 2, quantityAvailable: 2 } });
        await db.inventoryLot.updateMany({ where: { offerId: entry.offerId }, data: { quantityOnHand: 2, quantityAvailable: 2 } }); value = true;
      } else if (message.type === 'unavailable') { await db.supplierOffer.update({ where: { id: entry.offerId }, data: { status: 'INACTIVE' } }); value = true; }
      else if (message.type === 'concurrent-edit') {
        const before = await readback(entry);
        const response = await fetch(`${apiUrl}/carts/${entry.cartId}/items/${entry.itemId}`, { method: 'PATCH', headers: { authorization: `Bearer ${entry.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ quantity: 3, expectedVersion: before.version }) });
        assert.equal(response.status, 200); value = await readback(entry);
      } else throw Error('Unsupported fixture action');
    }
    process.send?.({ id: message.id, value });
  } catch { process.send?.({ id: message.id, error: 'Owned cart fixture failed; response and credentials omitted' }); }
});
process.once('disconnect', async () => {
  // Keep synthetic cart/audit rows for readback; retire only our own offers.
  try { for (const entry of cases.values()) {
    await db.supplierOffer.update({ where: { id: entry.offerId }, data: { status: 'INACTIVE' } });
    await db.offerPublication.updateMany({ where: { offerId: entry.offerId }, data: { marketplaceVisible: false } });
  } } finally { await fixture.stop(); process.exit(0); }
});
process.send?.({ type: 'ready' });
