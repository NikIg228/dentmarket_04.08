// Only the verification runner uses this environment; never a deployment default.
export function platformAuthorityRuntimeEnvironment(base, profile) {
  if (!['pilot', 'go_live'].includes(profile)) throw new Error('Unknown authority test profile');
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramFiles(x86)', 'PATHEXT', 'NODE_OPTIONS', 'APP_SECURITY_ENCRYPTION_KEY', 'INTEGRATION_ENCRYPTION_KEY', 'MEDIA_SIGNING_SECRET', 'METRICS_BEARER_TOKEN']) {
    if (base[key] !== undefined) env[key] = base[key];
  }
  return { ...env, NODE_ENV: 'test', DEPLOYMENT_PROFILE: profile, PROCESS_ROLE: 'api',
    DATABASE_URL: base.DATABASE_URL, AUTH_MODE: 'development', BACKGROUND_QUEUE_ENABLED: 'false',
    OBJECT_STORAGE_DRIVER: 'local', LOCAL_STORAGE_PATH: base.LOCAL_STORAGE_PATH,
    AV_SCAN_MODE: 'disabled', LOG_LEVEL: 'warn', PAYMENT_PROVIDER_MODE: 'mock' };
}
