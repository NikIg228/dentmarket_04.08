export function traceExporterUrl(configuredEndpoint: string) {
  const url = new URL(configuredEndpoint);
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  if (!normalizedPath.endsWith("/v1/traces"))
    url.pathname = `${normalizedPath}/v1/traces`.replace(/\/{2,}/g, "/");
  return url.toString();
}
