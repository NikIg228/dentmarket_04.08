// Repeated pilot seeding must keep the variant already used by its offers.
// createdAt alone does not define an order when imported variants share a timestamp.
export function selectPilotVariant(variants, existingOffers, saleUnitId) {
  if (!variants.length) throw new Error("Pilot product has no variants");
  if (existingOffers.some((offer) => offer.saleUnitId !== saleUnitId)) {
    throw new Error("Existing pilot offer has a different sale unit; review required");
  }
  const assigned = new Set(existingOffers.map((offer) => offer.productVariantId));
  if (assigned.size > 1) {
    throw new Error("Pilot offers disagree on their product variant; review required");
  }
  if (assigned.size === 1) {
    const variant = variants.find(({ id }) => assigned.has(id));
    if (!variant) throw new Error("Existing pilot offer belongs to another product");
    return variant;
  }
  return [...variants].sort((left, right) => {
    const byDate = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return byDate || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  })[0];
}
