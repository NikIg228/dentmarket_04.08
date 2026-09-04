import { NextRequest, NextResponse } from "next/server";
import { searchFallbackCatalog } from "../catalog-fallback.server";

const MAX_FALLBACK_ITEMS = 120;

function boundedLimit(value: string | null) {
  const parsed = Number(value ?? "24");
  if (!Number.isFinite(parsed)) return 24;
  return Math.max(1, Math.min(Math.trunc(parsed), MAX_FALLBACK_ITEMS));
}

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const result = searchFallbackCatalog(
    params.get("q") ?? "",
    params.get("sort") ?? "RELEVANCE",
    {
      unit: params.get("unit") ?? undefined,
      packaging: params.get("packaging") ?? undefined,
      delivery: params.get("deliveryMethod") ?? undefined,
      stock: params.get("inStock") ?? undefined,
    },
    boundedLimit(params.get("limit")),
  );

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
