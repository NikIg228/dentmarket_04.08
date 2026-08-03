$ErrorActionPreference = "Stop"

$env:DATABASE_URL = "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public"

pnpm catalog:build-pilot
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm --filter @marketplace/api exec prisma migrate deploy --schema prisma/schema.prisma
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm db:seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm catalog:sync-production:apply
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm db:seed-pilot
exit $LASTEXITCODE
