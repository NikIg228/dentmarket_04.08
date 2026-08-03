# Pilot catalog

The Buyer runtime uses a curated 500-card catalog during recovery and pilot testing.

The fixture contains 10 explicitly named demo suppliers. The same 50 pilot products
receive one offer from every supplier, producing 500 offers and a useful price-comparison
sample. The remaining 450 cards intentionally have no price or inventory. Demo values
must never be represented as real supplier data.

## Sources

- `data/archive/public-catalog-full.json` is the complete normalized source snapshot.
- `data/archive/public-catalog-media-full.json` is the complete media manifest.
- `apps/buyer-web/app/data/public-catalog-fallback.json` is the active pilot catalog.
- `apps/buyer-web/app/data/public-catalog-media.json` is the active pilot media manifest.
- `data/pilot/pilot-catalog-report.json` records the deterministic selection result.

The archive is not a publication queue. Archived cards must not appear in Buyer search,
product pages, seed data or production sync unless they pass the pilot policy again.

## Rebuild

Run `pnpm catalog:build-pilot` to rebuild the active 500-card snapshot from the archived
source. The selection requires a usable name, a description of at least 60 characters,
a variant and exact local media. It rejects highly reused placeholder-like media and caps
dominant categories before filling the remainder by quality score.

Run `pnpm catalog:prune-media` for a dry run and
`pnpm catalog:prune-media:apply` to remove public product images not referenced by the
active pilot manifest. Deleted media remains recoverable from the Git baseline until the
repository history is intentionally compacted.

## Clean local database

Use PostgreSQL with the `DATABASE_URL` from `.env.example`, then run:

1. `pnpm --filter @marketplace/api exec prisma migrate deploy --schema prisma/schema.prisma`
2. `pnpm db:seed`
3. `pnpm catalog:sync-production:apply`
4. `pnpm db:seed-pilot`

On the prepared Windows workstation, `pnpm db:prepare-pilot` runs this sequence
idempotently. Use `pnpm dev:local` to start the local pilot profile without manually
setting environment variables. PostgreSQL must already be running.

The last command creates 10 demo clinic organizations, 10 demo supplier organizations,
their warehouses, and 500 published demo offers. It is local fixture data, not a source
for production publication.

The root `pnpm build` intentionally runs workspace builds one at a time. Four concurrent
Next.js production builds exceed the memory available on common 8 GB Windows development
machines; deterministic local builds are more important than maximum build throughput.

## Publication boundary

Selection into the technical pilot fixture is not legal or commercial verification.
Before a real pilot, every active SKU still requires confirmed naming, category,
packaging, price, inventory freshness, supplier ownership and media usage rights.
