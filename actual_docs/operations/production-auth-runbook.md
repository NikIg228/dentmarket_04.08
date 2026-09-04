# Production authentication and rate-limit runbook

This runbook is the operational companion for B4.4. It describes the controls
that must be verified before a go-live deployment and the response steps for
authentication or abuse incidents. It does not replace the deployment release
contract or provider-specific incident procedures.

## Production invariants

- `NODE_ENV=production`, `DEPLOYMENT_PROFILE=go_live` and `AUTH_MODE=jwt` are
  mandatory. Development identity headers are never accepted in production.
- JWT validation requires the configured issuer, audience, signing key and an
  `AuthSession` that is active, unexpired and bound to the requested tenant.
- `JWT_REQUIRE_MFA=true` is mandatory for production. Operators and financial
  roles must complete TOTP MFA before receiving an elevated access token.
- Refresh tokens are stored only as hashes, rotated on use, and a replay of an
  old token revokes its token family. Refresh cookies are `HttpOnly`, `Secure`
  in production and protected by the double-submit CSRF cookie.
- Production rate limiting uses the shared Redis deployment. A process-local
  limiter is allowed only for development/test or a pilot process that is not
  horizontally scaled. If Redis is unavailable in production, requests fail
  closed with a controlled `503` rather than silently disabling the control.

## Rate-limit policy

The default window is 60 seconds. The global limits are currently:

| Dimension | Limit | Tracker |
| --- | ---: | --- |
| IP | 240 requests/window | trusted client IP |
| User | 480 requests/window | authenticated user, otherwise IP |
| Tenant | 1200 requests/window | active tenant, otherwise IP |

Sensitive route classes have stricter limits:

- authentication: 20/IP, 30/user, 60/tenant per minute;
- onboarding: 8/IP, 8/user, 8/tenant per minute for the protected mutations;
- integration and payment webhooks: 120/IP per minute.

Every limited response exposes the dimension-specific limit, remaining count
and reset time. A throttled response must also expose a generic `Retry-After`
header and the stable error code `RATE_LIMIT_EXCEEDED` in the normal API error
envelope. Clients must back off; they must not retry in a tight loop.

## Deployment checklist

1. Provision Redis with TLS and monitor memory, evictions, connection errors and
   command latency. Use a dedicated namespace for rate-limit keys.
2. Set `REDIS_URL`, `TRUST_PROXY=true`, explicit HTTPS `CORS_ORIGINS`, JWT
   issuer/audience and `JWT_REQUIRE_MFA=true` through the secret manager.
3. Run `npm run build`, `npm run verify:production-config` and
   `npm run verify:rate-limit-auth` before the immutable release is promoted.
4. Start API and worker separately. Confirm `/api/health/ready`, Redis
   readiness, request IDs, rate-limit headers and the production error envelope.
5. Verify social/email login, MFA enrollment/challenge, refresh rotation,
   logout/revocation and an operator session before opening traffic.
6. Confirm that two API instances share the same rate-limit state. A request
   burst sent alternately to both instances must still receive `429` once the
   shared limit is exceeded.

## Incident procedures

### Suspected credential or refresh-token compromise

1. Preserve the request ID, actor, tenant, timestamp and security-event record.
2. Revoke the affected session or all sessions for the user; if the token
   family is suspected, revoke the complete family.
3. Rotate the signing/provider secret through the secret manager. Keep the old
   verification key only for the documented overlap window, then remove it.
4. Require MFA re-enrollment when the factor or recovery codes may be exposed.
5. Review `SecurityEvent`, `AuditLog`, login, refresh-replay and rate-limit
   metrics before restoring normal access.

### Rate-limit abuse or false positives

1. Identify the affected dimension and route class from the rate-limit headers,
   request IDs and metrics; do not disable the global guard as a first action.
2. Block or challenge the abusive source at the trusted edge when possible.
3. Adjust a versioned limit through configuration only after recording the
   incident, expected traffic and rollback value. Never raise limits by editing
   code during an incident.
4. If Redis is unhealthy, keep the fail-closed behavior, restore Redis or route
   traffic to a healthy deployment, then replay the smoke checks.

## Rotation and rollback

- Secret changes are staged, deployed to one instance, verified, and then
  rolled out. Keep a previous key only for the documented compatibility window.
- Application rollback uses the previous immutable image; it does not roll back
  database migrations. Re-run auth, MFA, Redis and rate-limit smoke checks after
  rollback.
- Never print JWT keys, refresh tokens, CSRF tokens, MFA secrets or provider
  credentials in logs, CI output or incident tickets.

## Evidence commands

```powershell
npm run verify:rate-limit-auth
npm run verify:security
npm run verify:production-config
npm run verify:runtime-split
npm run verify:postgres
```

`verify:rate-limit-auth` proves the bounded production configuration, shared
Redis requirement, stable error contract and Redis storage fallback/fail-closed
behavior. Live Redis failover and two-instance behavior remain deployment-level
evidence and must be recorded during the go-live rehearsal.
