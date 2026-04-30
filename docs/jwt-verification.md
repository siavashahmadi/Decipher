# JWT verification: fast and slow paths

`require_auth` (`backend/app/routes/solves.py`) attempts two paths in
order. Both produce a verified `user_id`; only the cost differs.

## Fast path: local JWKS

`verify_token_local(token)` (`backend/app/auth.py:46`) verifies the JWT
signature against Supabase's published JWKS using PyJWT.

- The JWKS client is a process-wide singleton, lazily constructed under a
  threading lock (`auth.py:25`). The cache rotates every 5 minutes
  (`lifespan=300`) and bounds memory at 16 keys.
- Decode validates: signature (ES256 or RS256), expiry, audience
  (`authenticated`), issuer (`{SUPABASE_URL}/auth/v1`).
- Token-shaped failures (expired, bad signature, wrong issuer, wrong
  audience, malformed) log at DEBUG and return `None` so the caller
  falls through to the slow path. Anything else propagates so it shows
  up in error reporting.

This is the path nearly every authenticated request takes. Cost is one
JWT decode (a few hundred microseconds) and zero network calls.

## Slow path: Supabase `auth.get_user`

When `verify_token_local` returns `None`, `require_auth` calls
`supabase.auth.get_user(jwt=token)` (`solves.py:81`). This is a network
round-trip to Supabase.

When it fires:

1. **JWKS unreachable** (transient or sustained outage of Supabase's
   `/.well-known/jwks.json`).
2. **Legacy HS256 tokens** issued by older Supabase projects. PyJWT only
   accepts ES256/RS256 in our config.
3. **Key rotation lag**. The JWKS cache (5-minute TTL) returns stale
   keys; verification fails until the next refresh.
4. **Token from a different Supabase project**. The `iss` check on the
   fast path catches this; slow path will reject too, but with a 503 if
   the network call itself fails.

## Observing fallback rate

Each slow-path entry logs at INFO from the `app.routes.solves` logger:

```
auth_slow_path event=auth_slow_path
```

After Cluster I (Task 6) ships JSON logging, an aggregation query is
just a `jq` filter:

```bash
journalctl -u ao5-backend -o cat | jq -r 'select(.message | contains("auth_slow_path")) | .timestamp'
```

A healthy steady state is under 1% of authenticated requests. Sustained
spikes above 5% usually mean JWKS rotation or unreachability; check
`/api/ready` for the JWKS cache state.

## Tuning knobs

- JWKS cache lifespan: `auth.py:40` (`lifespan=300`). Longer means fewer
  refreshes but slower key-rotation pickup; shorter is the opposite.
- Cache size: `auth.py:41` (`max_cached_keys=16`). Bound for unique kids
  observed; 16 covers many rotations without growth.

## Troubleshooting

- All requests are slow: JWKS unreachable. Run
  `curl <SUPABASE_URL>/auth/v1/.well-known/jwks.json` from the Flask host.
- DEBUG logs show `verify_token_local: token_invalid`: token is
  shape-valid but does not pass signature/issuer/audience. Confirm the
  Supabase project that issued the token matches `SUPABASE_URL`.
- 401s with no `auth_slow_path` log: missing or malformed Authorization
  header (caught earlier in `require_auth`).
