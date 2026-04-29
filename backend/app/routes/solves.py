import base64
import hashlib
import hmac
import re
from datetime import datetime, timezone
from flask import Blueprint, Response, request, jsonify, current_app, g
from functools import wraps
from ..auth import BEARER_PREFIX, verify_token_local
from ..db import get_supabase_client, get_supabase_service_client
from ..validators import validate_create_solve, validate_update_solve, validate_create_solves_batch
from ..extensions import limiter
from ..repositories.solves_repo import SolvesRepository  # used in service factories
from ..repositories.personal_bests_repo import PersonalBestsRepository
from ..services.solves_service import SolvesService
from ..services.solves_service import SOLVE_LIFETIME_CAP  # re-exported; tests import from here
from ..services.share_links_service import ShareLinksService
from ..services.exceptions import SolveLimitReached, SolveNotFound

# Cursor pagination tokens are user-supplied; both halves get interpolated
# into a PostgREST .or_() filter, so unsafe characters could break out of
# the intended filter. Strict shape validation in _decode_solve_cursor
# rejects anything that isn't a plain ISO-8601 timestamp + UUID.
_ISO_TIMESTAMP_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$"
)
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

solves = Blueprint('solves', __name__)
solves.strict_slashes = False


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')

        if not auth_header.startswith(BEARER_PREFIX):
            return jsonify({"error": "No authorization token provided"}), 401

        token = auth_header.removeprefix(BEARER_PREFIX).strip()
        if not token:
            return jsonify({"error": "No authorization token provided"}), 401

        # Fast path: verify the JWT locally via cached JWKS so we skip a
        # per-request Supabase round-trip. Falls back to auth.get_user() only
        # when local verification cannot succeed (legacy HS256 projects, JWKS
        # fetch failure, expired keys).
        user_id = verify_token_local(token)

        if user_id is None:
            try:
                supabase = get_supabase_client(token)
                user = supabase.auth.get_user(jwt=token)
            except Exception:
                # Auth provider unreachable or rejecting; don't leak which.
                current_app.logger.exception("Supabase auth lookup failed")
                return jsonify({"error": "Auth service unavailable"}), 503

            if not user or not getattr(user, 'user', None):
                return jsonify({"error": "Invalid authentication token"}), 401

            user_id = user.user.id
            g.supabase = supabase
        else:
            g.supabase = get_supabase_client(token)

        g.user_id = user_id
        return f(*args, **kwargs)
    return decorated


def _parse_positive_int(value, default, maximum):
    """Parse a query-param int, clamp to [1, maximum], fall back to default."""
    if value is None:
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid integer: {value!r}")
    if parsed < 1:
        return 1
    return min(parsed, maximum)


def _internal_error(label: str) -> tuple[Response, int]:
    """Log + 500 response shaped consistently across routes."""
    current_app.logger.exception(f"{label} failed")
    return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------------------------
# Per-request service factories (cached on flask.g)
# ---------------------------------------------------------------------------

def _solves_service() -> SolvesService:
    if "solves_service" not in g:
        g.solves_service = SolvesService(
            SolvesRepository(g.supabase),
            PersonalBestsRepository(g.supabase),
        )
    return g.solves_service


def _share_links_service() -> ShareLinksService:
    if "share_links_service" not in g:
        g.share_links_service = ShareLinksService(
            SolvesRepository(get_supabase_service_client()),
        )
    return g.share_links_service


# ---------------------------------------------------------------------------
# SD-2: Cursor-based pagination helpers (HTTP-shape concerns, stay in routes)
#
# Why cursor over OFFSET:
#   OFFSET N rescans N rows on every request and breaks when rows are deleted
#   between pages. A cursor (created_at timestamp) uses the B-tree index in
#   002_cursor_pagination_index.sql directly — O(log n) regardless of page.
#
# Request:  GET /api/solves?puzzle_type=333&limit=50&cursor=<ISO timestamp>
# Response: { "solves": [...], "next_cursor": "<ISO timestamp> | null" }
# ---------------------------------------------------------------------------

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _b64url_decode(s: str) -> bytes:
    padding = '=' * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def _encode_solve_cursor(created_at: str, solve_id: str) -> str:
    return _b64url(f"{created_at}|{solve_id}".encode())


def _decode_solve_cursor(raw: str) -> tuple[str, str | None]:
    """Return (created_at, solve_id-or-None).

    New format: base64url(<iso_ts>|<uuid>) -> (iso_ts, uuid).
    Legacy format: bare ISO timestamp -> (iso_ts, None). Drop after one release.

    Both halves are validated against strict regex shapes before being
    returned. The caller interpolates them into a PostgREST .or_() filter
    string, so anything that isn't a plain timestamp or UUID could
    inject filter syntax. Invalid shapes fall back to the legacy path,
    where get_solves only uses the timestamp via .lt() (escaped by
    PostgREST).
    """
    try:
        decoded = _b64url_decode(raw).decode("utf-8")
        if "|" in decoded:
            ts, sid = decoded.split("|", 1)
            if _ISO_TIMESTAMP_RE.match(ts) and _UUID_RE.match(sid):
                return ts, sid
    except Exception:
        pass
    if _ISO_TIMESTAMP_RE.match(raw):
        return raw, None
    return raw, None


# ---------------------------------------------------------------------------
# Share-link token helpers (stay here: tests monkeypatch these module-level names)
# ---------------------------------------------------------------------------

SHARE_TOKEN_TTL_SECONDS = 30 * 24 * 3600  # 30 days
MAC_LENGTH = 16  # truncated SHA-256 output, 128-bit MAC


def _require_share_secret() -> bytes:
    secret = current_app.config.get('SHARE_SECRET')
    if not secret:
        raise RuntimeError("SHARE_SECRET is not configured")
    return secret.encode()


def _now_seconds() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _pack_int(n: int) -> bytes:
    return n.to_bytes(8, "big", signed=False)


def _unpack_int(b: bytes) -> int:
    if len(b) != 8:
        raise ValueError("expected 8 bytes")
    return int.from_bytes(b, "big", signed=False)


def _sign_solve_id(solve_id: str) -> str:
    iat = _now_seconds()
    exp = iat + SHARE_TOKEN_TTL_SECONDS
    msg = f"{solve_id}:{iat}:{exp}".encode()
    mac = hmac.new(_require_share_secret(), msg, hashlib.sha256).digest()[:MAC_LENGTH]
    return ".".join((
        _b64url(solve_id.encode()),
        _b64url(_pack_int(iat)),
        _b64url(_pack_int(exp)),
        _b64url(mac),
    ))


def _verify_share_token(token: str):
    try:
        id_part, iat_part, exp_part, mac_part = token.split(".", 3)
        solve_id = _b64url_decode(id_part).decode("utf-8")
        iat = _unpack_int(_b64url_decode(iat_part))
        exp = _unpack_int(_b64url_decode(exp_part))
        provided_mac = _b64url_decode(mac_part)
    except (ValueError, UnicodeDecodeError):
        return None

    msg = f"{solve_id}:{iat}:{exp}".encode()
    expected_mac = hmac.new(_require_share_secret(), msg, hashlib.sha256).digest()[:MAC_LENGTH]
    if not hmac.compare_digest(provided_mac, expected_mac):
        return None
    if _now_seconds() > exp:
        return None
    return solve_id


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@solves.route('/solves', methods=['GET'])
@require_auth
@limiter.limit("60 per minute")
def get_solves():
    puzzle_type = request.args.get('puzzle_type')
    try:
        limit = _parse_positive_int(request.args.get('limit'), default=50, maximum=100)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    cursor_param = request.args.get('cursor')
    cursor = _decode_solve_cursor(cursor_param) if cursor_param else None

    try:
        data = _solves_service().list_solves(
            g.user_id,
            puzzle_type=puzzle_type,
            limit=limit,
            cursor=cursor,
        )
        next_cursor = (
            _encode_solve_cursor(data[-1]['created_at'], data[-1]['id'])
            if len(data) == limit else None
        )
        return jsonify({"solves": data, "next_cursor": next_cursor})
    except Exception:
        return _internal_error("get_solves")


@solves.route('/personal-bests', methods=['GET'])
@require_auth
@limiter.limit("60 per minute")
def get_personal_bests():
    puzzle_type = request.args.get('puzzle_type')
    try:
        data = _solves_service().list_personal_bests(g.user_id, puzzle_type)
        return jsonify(data)
    except Exception:
        return _internal_error("get_personal_bests")


@solves.route('/solves/<solve_id>', methods=['DELETE'])
@require_auth
@limiter.limit("60 per minute")
def delete_solve(solve_id):
    try:
        deleted = _solves_service().delete(g.user_id, solve_id)
        return jsonify(deleted)
    except SolveNotFound:
        return jsonify({"error": "Solve not found"}), 404
    except Exception:
        return _internal_error("delete_solve")


@solves.route('/solves/<solve_id>', methods=['PATCH'])
@require_auth
@limiter.limit("60 per minute")
def update_solve(solve_id):
    data = request.json
    errors = validate_update_solve(data)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422

    # Only allow dnf and plus_two to be updated — strip everything else.
    allowed = {k: data[k] for k in ('dnf', 'plus_two') if k in data}

    try:
        result = _solves_service().update(g.user_id, solve_id, allowed)
        return jsonify(result)
    except SolveNotFound:
        return jsonify({"error": "Solve not found"}), 404
    except Exception:
        return _internal_error("update_solve")


# SD-4: Input validation / SD-3: Write-time PB materialization
@solves.route('/solves', methods=['POST'])
@require_auth
@limiter.limit("30 per minute")
def create_solve():
    data = request.json
    errors = validate_create_solve(data)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422

    try:
        solve = _solves_service().create(g.user_id, data)
        return jsonify(solve)
    except SolveLimitReached as e:
        return jsonify({"error": str(e)}), 429
    except Exception:
        return _internal_error("create_solve")


@solves.route('/solves/batch', methods=['POST'])
@require_auth
@limiter.limit("5 per minute")
def create_solves_batch():
    """Bulk-insert up to 1000 validated solves in one transaction.

    Used by the guest-to-authed migration flow: a guest with N solves can
    sign up and migrate them in one request rather than looping per-solve
    against the standard 30/min rate limit. PB rows are recomputed
    server-side after the bulk insert via recompute_pbs_for_user.
    """
    payload = request.get_json(silent=True)
    err, rows = validate_create_solves_batch(payload)
    if err:
        return jsonify({"errors": err}), 422

    try:
        inserted = _solves_service().create_batch(g.user_id, rows)
        return jsonify({"solves": inserted}), 200
    except SolveLimitReached:
        return jsonify({
            "error": f"Batch would exceed lifetime cap of {SOLVE_LIFETIME_CAP}"
        }), 429
    except Exception:
        return _internal_error("create_solves_batch")


@solves.route('/solves/<solve_id>/share-token', methods=['GET'])
@require_auth
@limiter.limit("30 per minute")
def get_share_token(solve_id):
    try:
        row = _solves_service().get_by_id(g.user_id, solve_id)
        if not row:
            return jsonify({"error": "Solve not found"}), 404
        return jsonify({"token": _sign_solve_id(solve_id)})
    except Exception:
        return _internal_error("get_share_token")


@solves.route('/solves/share/<token>', methods=['GET'])
@limiter.limit("60 per minute")
def get_shared_solve(token):
    solve_id = _verify_share_token(token)
    if solve_id is None:
        return jsonify({"error": "Invalid or expired share link"}), 404
    try:
        solve = _share_links_service().get_public_solve(solve_id)
        if solve is None:
            return jsonify({"error": "Invalid or expired share link"}), 404
        return jsonify(solve)
    except Exception:
        return _internal_error("get_shared_solve")
