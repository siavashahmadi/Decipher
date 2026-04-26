# Token storage strategy

Date: 2026-04-26
Status: Accepted (interim)
Audit reference: `docs/audits/2026-04-25-full-stack-audit.md` § B.13

## Context
The Supabase JS SDK persists the user's access and refresh tokens in
`localStorage` (see `frontend/src/services/auth.ts`). A successful XSS
on any page in the app yields full account takeover, including write
access to all solves and the ability to mint share links indefinitely.

## Decision
Accept the localStorage XSS exposure for the current release. Mitigate
by:

1. Shipping the Content-Security-Policy from B.7. The CSP forbids
   inline scripts, third-party script sources, and frame embedding,
   which are the most common XSS delivery vectors.
2. Keeping the access-token TTL short (Supabase default: 1 hour). A
   stolen token expires before most attackers can pivot.
3. Rotating `SUPABASE_ANON_KEY` and `SHARE_SECRET` if a leak is
   suspected.

We do not adopt httpOnly cookies + PKCE in this release because:

- It requires migrating to `@supabase/ssr` and a backend session
  endpoint (the current backend has no session-cookie handling).
- It changes our deployment model (Vercel rewrites, cookie domain
  coordination with the API host).
- Estimated effort: at least one week, plus a deprecation window for
  existing sessions.

## Consequences
- Any successful XSS during the interim window can fully impersonate a
  user.
- We must keep the dependency surface for `cubing`, React, and Vite
  plugins audited (see `npm audit`); a malicious transitive dep is the
  likeliest XSS source.
- The CSP from B.7 is the load-bearing mitigation. Any future change
  that loosens it (e.g. allowing inline scripts for an analytics tag)
  must be reviewed against this decision.

## Revisit when
- We add user-generated content rendered into the app (markdown, custom
  profile fields, etc.).
- We grow past about 5k MAU, where the blast radius of one compromised
  account warrants the migration cost.
- A CVE in any direct or transitive dependency lands an XSS sink.

## Tracked separately
Long-term migration to PKCE + httpOnly cookies via `@supabase/ssr` is a
separate XL initiative. Not bundled into Cluster B.
