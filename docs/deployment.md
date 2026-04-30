# Deployment runbook (home server)

Single-container deploy to the home server (DuckDNS hostname `sia-server.duckdns.org`), fronted by Nginx Proxy Manager (NPM) and reachable at `https://sia-server.duckdns.org`.

## Architecture

```
internet ──HTTPS──> NPM (Docker, ports 80/443)
                      │
                      ▼ HTTP
                  ao5 container :5000  (Flask + gunicorn, serves API + built React app)
                      │
                      ▼ HTTPS
                  Supabase (managed, remote)
```

The single ao5 container holds the Flask backend AND the built React frontend. Flask serves the React `index.html` and static assets at `/`; client-side routes (`/stats`, `/trainers`, `/s/<token>`) fall through to `index.html` for SPA routing. The API is mounted at `/api/v1`.

NPM terminates TLS (Let's Encrypt cert via the NPM web UI) and reverse-proxies plain HTTP to the ao5 container.

## Prerequisites on the server

Already installed per `home_server.md`:

- Docker 29.x + Docker Compose v2 (the `docker compose` plugin)
- Nginx Proxy Manager running and reachable at `http://sia-server.duckdns.org:81`
- DuckDNS hostname `sia-server.duckdns.org` configured to resolve to the public IP
- Router port-forwarding: 80 and 443 forward to the server's LAN IP (NPM needs both — 80 for the Let's Encrypt HTTP-01 challenge, 443 for serving)
- DuckDNS A record for `sia-server.duckdns.org` updates automatically (via the duckdns updater, cron, or your router) to your home's public IP

If port forwarding isn't already in place, the cert request will fail.

## First-time deploy

### 1. Clone the repo on the server

```bash
ssh sia@sia-server.duckdns.org
mkdir -p ~/apps && cd ~/apps
git clone <repo-url> ao5
cd ao5
```

### 2. Create `.env` at the project root

The container expects these env vars. Generate `SHARE_SECRET` if you don't have one yet (must be ≥32 chars).

```env
# Supabase (from Project Settings → API in the dashboard)
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Share-link signing key (>=32 chars; rotate per docs/share-secret-rotation.md)
SHARE_SECRET=<paste output of: python3 -c "import secrets; print(secrets.token_urlsafe(48))">

# CORS origin = the public HTTPS URL
FRONTEND_URL=https://sia-server.duckdns.org

# Optional
LOG_LEVEL=INFO
```

The Vite build does NOT need Supabase env vars at build time because the frontend reads them from `import.meta.env` and Vite inlines those at build. Add the matching `VITE_` ones to a `frontend/.env` file before running `docker compose build`:

```env
# frontend/.env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_API_URL=/api/v1
```

`VITE_API_URL` is `/api/v1` (a relative path) because Flask serves both the static assets and the API on the same origin behind NPM, so the frontend talks to `https://sia-server.duckdns.org/api/v1` automatically.

### 3. Build and start

```bash
docker compose build       # ~3-5 min the first time (npm install + pip install)
docker compose up -d
docker compose logs -f ao5 # confirm it boots; ctrl+C to stop tailing
```

Successful boot looks like:

```
{"timestamp": "...", "level": "INFO", "logger": "...", "message": "Starting gunicorn 23.0.0"}
{"timestamp": "...", "level": "INFO", "logger": "...", "message": "Listening at: http://0.0.0.0:5000"}
```

If `create_app` raises, you'll see `RuntimeError: Required environment variables missing: ...` or `RuntimeError: SHARE_SECRET must be at least 32 characters`. Fix `.env` and re-up.

### 4. Verify locally on the server

From the server itself:

```bash
curl http://localhost:5000/api/health        # → {"status":"healthy"}
curl http://localhost:5000/api/ready         # → {"status":"ready","checks":{...}}
curl -I http://localhost:5000/                # → 200 with HTML
```

If `/api/ready` returns 503 with `"supabase":"fail"`, the env vars are wrong or Supabase is paused.

### 5. Add the proxy host in Nginx Proxy Manager

1. Open `http://sia-server.duckdns.org:81` in a browser.
2. Log in.
3. **Hosts → Proxy Hosts → Add Proxy Host**.
4. **Details tab:**
   - Domain Names: `sia-server.duckdns.org`
   - Scheme: `http`
   - Forward Hostname / IP: `172.17.0.1` (the Docker bridge gateway = the host as seen from NPM's container). Alternative: your host's LAN IP from `hostname -I`.
   - Forward Port: `5000`
   - **Cache Assets:** off (the React build has hashed filenames; nginx's default caching is fine. Enable later if you want.)
   - **Block Common Exploits:** on
   - **Websockets Support:** off (not used today)
5. **SSL tab:**
   - SSL Certificate: **Request a new SSL Certificate** (Let's Encrypt)
   - Force SSL: on
   - HTTP/2 Support: on
   - HSTS Enabled: on
   - Email: your email
   - Agree to TOS: yes
6. **Save**.

NPM will hit the Let's Encrypt HTTP-01 challenge on port 80, get the cert, and start serving HTTPS within ~30 seconds. If it fails, check that ports 80 and 443 are forwarded from the router and the duckdns A record points at your public IP.

### 6. Browser smoke test

Visit `https://sia-server.duckdns.org` from any device. You should land on the timer. Sign in, record a solve, navigate to `/stats`, hit a share link.

## Updates

After pulling new code:

```bash
cd ~/apps/ao5
git pull
docker compose build       # rebuilds frontend + reinstalls Python deps
docker compose up -d       # recreates the container
docker compose logs -f ao5 # confirm clean boot
```

If only the frontend changed, the Python layer is cached and the build is fast (~30 sec). If only the backend changed, the Node stage is cached. The `.dockerignore` keeps the build context lean (~10 MB instead of ~500 MB with node_modules).

## Common operational tasks

```bash
# Tail structured JSON logs (request_id and user_id on every line)
docker compose logs -f ao5 | grep -v 'health' | jq .

# Just access logs
docker compose logs -f ao5 | jq -r 'select(.logger=="app.access") | .message'

# Slow-path JWT fallback rate (should be <1% in steady state)
docker compose logs ao5 | jq -r 'select(.message|contains("auth_slow_path"))'

# Restart without rebuild (e.g. after editing .env)
docker compose restart ao5

# Stop and remove the container (data is in Supabase, nothing local to lose)
docker compose down

# Rebuild from scratch ignoring all cached layers (rare; troubleshooting only)
docker compose build --no-cache
```

## Troubleshooting

**`/api/ready` returns 503 `"supabase":"fail"`:** Supabase env vars wrong, project paused, or network blocked. `curl https://<project>.supabase.co/auth/v1/health` from the server to verify reachability.

**NPM cert request fails:** Router not forwarding port 80, duckdns A record stale, or another container is on port 80 (NPM should be). Check `sudo ss -tlnp | grep :80`.

**Browser shows the timer but Stats page is blank:** Probably `VITE_API_URL` is wrong in `frontend/.env`, baked into the build. Should be `/api/v1` (relative). Rebuild after fixing.

**Browser console shows CSP violations:** A new CDN/font/asset was added but isn't allowlisted in the CSP. Edit the CSP string in `backend/app/__init__.py` and rebuild. CSP is currently Report-Only (B.7 phase 1) so violations don't block; this becomes a hard failure after the audit's phase 2 flip.

**Auth requests get 503 with `AUTH_UNAVAILABLE`:** JWKS endpoint unreachable. Same as above — verify Supabase reachability.

**Rate-limit storage warnings on multi-worker:** gunicorn defaults to 2 workers; flask-limiter's in-memory store is per-process, so the same user can effectively get 2× quota. To fix, set `LIMITER_STORAGE_URI=redis://redis:6379/0` in `.env` and add a Redis service to `docker-compose.yml` (B.11 follow-up; not done yet).

## Future improvements (not done today)

- Add a Redis service for the rate limiter (B.11)
- Wire H.6 error reporting to whatever vendor you pick
- Migrate to PKCE + httpOnly cookie auth (B.13, XL)
- Pin a specific image tag (currently `ao5:latest`) for rollback ergonomics
