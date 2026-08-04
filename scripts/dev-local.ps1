$ErrorActionPreference = "Stop"

$env:NODE_ENV = "development"
$env:DEPLOYMENT_PROFILE = "pilot"
$env:PROCESS_ROLE = "all"
$env:DATABASE_URL = "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public"
$env:API_HOST = "127.0.0.1"
$env:API_PORT = "4012"
$env:AUTH_MODE = "development"
$env:BACKGROUND_QUEUE_ENABLED = "false"
$env:OBJECT_STORAGE_DRIVER = "local"
$env:PUBLIC_CATALOG_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000030"
$env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:4012/api"
$env:NEXT_PUBLIC_BUYER_APP_URL = "http://127.0.0.1:3001"
$env:NEXT_PUBLIC_SUPPLIER_APP_URL = "http://127.0.0.1:3002"

pnpm dev
exit $LASTEXITCODE
