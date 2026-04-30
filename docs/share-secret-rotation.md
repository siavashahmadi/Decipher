# SHARE_SECRET rotation procedure

## What it signs

`SHARE_SECRET` is the HMAC key used to sign share-link tokens
(`backend/app/routes/solves.py:_sign_solve_id`). Each token has the shape:

```
b64url(solve_id) . b64url(iat) . b64url(exp) . b64url(HMAC-SHA256(secret, "solve_id:iat:exp")[:16])
```

with a 30-day TTL (`SHARE_TOKEN_TTL_SECONDS`). Tokens are stateless. There
is no DB allowlist or revocation table. Verification recomputes the MAC
with the current `SHARE_SECRET` and rejects mismatches.

## When to rotate

- Suspected secret leak (committed to a repo, exposed in a log dump, etc.).
- Regulatory or scheduled rotation (recommended every 6 to 12 months).

## Constraints

- The secret must be **at least 32 characters**. `create_app` refuses to
  boot otherwise (`backend/app/__init__.py:55`).
- Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
- The secret is read from the `SHARE_SECRET` environment variable at boot.
  There is no live-reload path; rotation requires a deploy.

## Procedure (today: hard cutover)

The verifier holds only one secret, so rotation **invalidates every
outstanding share link the instant the new secret takes effect**. Plan
for this:

1. Generate `NEW_SHARE_SECRET` and store it in your secret manager.
2. Decide on the cutover window. Communicate to any users who depend on
   long-lived share links. The maximum blast radius is the 30-day TTL of
   existing tokens.
3. Deploy with `SHARE_SECRET=<NEW>` set on the Flask process. The old
   value can be removed in the same deploy.
4. Verify on a staging env that a token signed pre-rotation now returns
   `404` from `/api/v1/solves/share/<token>`, and a fresh token signed
   post-rotation works.

## Procedure (recommended future: dual-secret rolling window)

Audit A.7 left dual-key support out of scope. Adding it later means:

- Read both `SHARE_SECRET` (primary, used to sign new tokens) and
  `SHARE_SECRET_PREVIOUS` (only used during verification) from env at boot.
- `_verify_share_token` tries primary first, falls back to previous.
- Sign always uses primary.
- Rotation becomes:
  1. Move current `SHARE_SECRET` to `SHARE_SECRET_PREVIOUS`, set the new
     value for `SHARE_SECRET`. Deploy.
  2. After the 30-day TTL has elapsed, remove `SHARE_SECRET_PREVIOUS`.
     Deploy.

This is roughly 30 lines of Python and one config addition. Track it as a
follow-up if you anticipate frequent rotation.

## What rotation does NOT do

- It does not revoke individual share links. There is no per-link
  revocation today. Building it requires the DB-backed `share_links`
  table from audit A.7 option 2.
- It does not change the share-link URL format or path; only the MAC is
  invalidated.
