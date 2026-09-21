import assert from "node:assert/strict";
import test from "node:test";
import { selectPilotVariant } from "./lib/pilot-variant-selection.mjs";

const unit = "piece-unit";
const first = { id: "variant-a", createdAt: new Date("2026-01-01T00:00:00Z") };
const tied = { id: "variant-b", createdAt: first.createdAt };
const existing = (variant) => ({ productVariantId: variant.id, saleUnitId: unit });

test("equal timestamps select the same variant despite database row order", () => {
  const input = [tied, first];
  assert.equal(selectPilotVariant(input, [], unit).id, first.id);
  assert.equal(selectPilotVariant([...input].reverse(), [], unit).id, first.id);
  assert.deepEqual(input, [tied, first]);
});

test("preserves a previously seeded variant even if it loses the new tie-break", () => {
  for (const variants of [[first, tied], [tied, first]]) {
    assert.equal(selectPilotVariant(variants, [existing(tied), existing(tied)], unit).id, tied.id);
  }
});

test("first seed retains earliest-created preference before the ID tie-break", () => {
  const later = { id: "variant-0", createdAt: new Date("2026-01-02T00:00:00Z") };
  assert.equal(selectPilotVariant([later, tied], [], unit).id, tied.id);
});

test("refuses to repoint conflicting existing pilot offers", () => {
  assert.throws(() => selectPilotVariant([first, tied], [existing(first), existing(tied)], unit), /disagree/);
});

test("refuses an existing offer assigned to another product", () => {
  assert.throws(() => selectPilotVariant([first], [existing(tied)], unit), /another product/);
});

test("refuses to silently change the sale unit", () => {
  assert.throws(() => selectPilotVariant([first], [{ ...existing(first), saleUnitId: "box" }], unit), /sale unit/);
});

test("reports a missing variant before publication writes", () => {
  assert.throws(() => selectPilotVariant([], [], unit), /no variants/);
});
