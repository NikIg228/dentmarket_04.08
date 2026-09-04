$ErrorActionPreference = "Stop"

$env:DATABASE_URL = "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public"

npm run catalog:build-pilot
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm exec --workspace=@marketplace/api -- prisma migrate deploy --schema prisma/schema.prisma
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run db:seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run catalog:sync-production:apply
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run db:seed-pilot
exit $LASTEXITCODE
