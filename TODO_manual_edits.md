# Manual edits required

Actions Claude can't perform. Do these yourself.

## Phase 1

### 1.2 Verify Supabase RLS (dashboard)

The anon key ships in the frontend. If RLS is off, any visitor can read/write every user's data using the anon key directly.

In the Supabase dashboard → Authentication → Policies, confirm:

- **`solves`**: RLS enabled. Separate policies for `SELECT`, `INSERT`, `UPDATE`, `DELETE`, each using `auth.uid() = user_id`.
- **`personal_bests`**: same.

If RLS is off, enable it and add the policies before shipping anything else.

### ProxyFix sanity check (after next deploy)

`ProxyFix(x_for=1, x_proto=1)` is wired in `backend/app/__init__.py`. Only observable in a real deployment.

- After deploying, make requests from two different IPs.
- In your host's logs (Render / Fly / Railway), confirm `request.remote_addr` shows the real client IP, not the proxy's.
- If rate limits still look global rather than per-user, the `x_for` count may need bumping for your hosting stack.
