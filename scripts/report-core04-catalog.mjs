import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Read-only report of the checked-in demo artifact; never queries or changes live data.
const source = await readFile("apps/buyer-web/app/data/public-catalog-fallback.json", "utf8");
const catalog = JSON.parse(source);
const media = JSON.parse(await readFile("apps/buyer-web/app/data/public-catalog-media.json", "utf8"));
const cards = catalog.products;
const offers = cards.flatMap(card => card.offers);
const duplicateNames = Object.entries(cards.reduce((groups, card) => {
  const key = card.name.toLocaleLowerCase("ru").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  (groups[key] ??= []).push(card.id);
  return groups;
}, {})).filter(([, ids]) => ids.length > 1).map(([name, ids]) => ({ name, ids }));
console.log(JSON.stringify({
  artifact: "checked-in demo; not live supplier data",
  sourceGeneratedAt: catalog.generatedAt,
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  cards: cards.length,
  variants: cards.reduce((count, card) => count + card.variants.length, 0),
  offers: offers.length,
  demoOffers: offers.filter(offer => offer.demo).length,
  cardsWithOffers: cards.filter(card => card.offers.length).length,
  cardsWithoutOffers: cards.filter(card => !card.offers.length).length,
  declaredAvailable: cards.filter(card => card.isAvailable).length,
  duplicateNormalizedNames: duplicateNames,
  invalidPrices: offers.filter(offer => !/^\d+$/.test(offer.priceMinor) || BigInt(offer.priceMinor) <= 0n || offer.currency !== "KZT").length,
  offersWithoutPackaging: offers.filter(offer => !offer.packaging?.unit || !(Number(offer.packaging.quantityInBaseUnit) > 0)).length,
  unavailableOffers: offers.filter(offer => !offer.available).length,
  mediaEntries: Object.keys(media.entries).length,
  mediaWithSourceUrl: Object.values(media.entries).filter(entry => entry.sourceUrl).length,
  cardsWithSourceUrl: cards.filter(card => card.sourceUrl).length,
  cardsWithSupplierTimestamp: cards.filter(card => card.sourceUpdatedAt).length,
  limitations: ["Offer availability is a demo flag, not a physical stock count", "Media source URLs do not prove publication rights", "Live freshness and buyability are enforced by the API, not this artifact"],
}, null, 2));
