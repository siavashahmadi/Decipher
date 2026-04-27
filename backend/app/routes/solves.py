import base64
import hashlib
import hmac
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, current_app, g
from functools import wraps
from ..auth import verify_token_local
from ..db import get_supabase_client, get_supabase_service_client
from ..validators import validate_create_solve, validate_update_solve
from ..extensions import limiter

solves = Blueprint('solves', __name__)
solves.strict_slashes = False


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')

        if not auth_header.startswith('Bearer '):
            return jsonify({"error": "No authorization token provided"}), 401

        token = auth_header[len('Bearer '):].strip()
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


# ---------------------------------------------------------------------------
# SD-2: Cursor-based pagination
#
# Why cursor over OFFSET:
#   OFFSET N rescans N rows on every request and breaks when rows are deleted
#   between pages. A cursor (created_at timestamp) uses the B-tree index in
#   002_cursor_pagination_index.sql directly — O(log n) regardless of page.
#
# Request:  GET /api/solves?puzzle_type=333&limit=50&cursor=<ISO timestamp>
# Response: { "solves": [...], "next_cursor": "<ISO timestamp> | null" }
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
    cursor = request.args.get('cursor')  # ISO 8601 created_at of last seen row

    try:
        query = (g.supabase.table('solves')
                 .select('*')
                 .eq('user_id', g.user_id)
                 .is_('deleted_at', None))
        if puzzle_type:
            query = query.eq('puzzle_type', puzzle_type)
        if cursor:
            query = query.lt('created_at', cursor)
        query = query.order('created_at', desc=True).limit(limit)
        result = query.execute()

        data = result.data
        # next_cursor is null when fewer rows than limit came back (last page)
        next_cursor = data[-1]['created_at'] if len(data) == limit else None
        return jsonify({"solves": data, "next_cursor": next_cursor})
    except Exception:
        current_app.logger.exception("get_solves failed")
        return jsonify({"error": "Internal server error"}), 500


SOLVE_LIFETIME_CAP = 100_000
SHARE_TOKEN_TTL_SECONDS = 30 * 24 * 3600  # 30 days
MAC_LENGTH = 16  # truncated SHA-256 output, 128-bit MAC


# ---------------------------------------------------------------------------
# SD-4: Input validation
# SD-3: Write-time PB materialization
# ---------------------------------------------------------------------------
@solves.route('/solves', methods=['POST'])
@require_auth
@limiter.limit("30 per minute")
def create_solve():
    data = request.json
    errors = validate_create_solve(data)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422

    try:
        # Cheap insurance against a malicious sign-up + mass-post spree.
        # Counts non-deleted solves only; soft-deleted rows still occupy
        # storage but do not block honest users.
        count_result = (g.supabase.table('solves')
                        .select('id', count='exact', head=True)
                        .eq('user_id', g.user_id)
                        .is_('deleted_at', None)
                        .execute())
        existing = getattr(count_result, 'count', None) or 0
        if existing >= SOLVE_LIFETIME_CAP:
            return jsonify({
                "error": f"Lifetime solve limit of {SOLVE_LIFETIME_CAP} reached"
            }), 429

        data['user_id'] = g.user_id
        result = g.supabase.table('solves').insert(data).execute()
        saved_solve = result.data[0]

        # SD-3: Check if this solve is a personal best and record it.
        # This is write-time materialization — we pay a small cost on every
        # non-DNF insert to keep GET /personal-bests O(1) at read time.
        if not data.get('dnf', False):
            _maybe_record_pb(
                g.supabase,
                g.user_id,
                data['puzzle_type'],
                float(saved_solve['time']),
                saved_solve['created_at'],
                saved_solve['id'],
            )

        return jsonify(saved_solve)
    except Exception:
        current_app.logger.exception("create_solve failed")
        return jsonify({"error": "Internal server error"}), 500


def _maybe_record_pb(supabase, user_id, puzzle_type, new_time, achieved_at, solve_id):
    """
    Insert into personal_bests if new_time beats the current recorded PB.
    Runs best-effort — the create_solve response is not affected by PB
    tracking failures, but we log them so they aren't invisible.
    """
    try:
        pb_result = (supabase.table('personal_bests')
                     .select('time')
                     .eq('user_id', user_id)
                     .eq('puzzle_type', puzzle_type)
                     .order('time')
                     .limit(1)
                     .execute())

        current_pb = float(pb_result.data[0]['time']) if pb_result.data else None

        if current_pb is None or new_time < current_pb:
            supabase.table('personal_bests').insert({
                'user_id': user_id,
                'puzzle_type': puzzle_type,
                'time': new_time,
                'achieved_at': achieved_at,
                'solve_id': solve_id,
            }).execute()
    except Exception:
        current_app.logger.exception("PB materialization failed (non-fatal)")


@solves.route('/solves/<solve_id>', methods=['PATCH'])
@require_auth
@limiter.limit("60 per minute")
def update_solve(solve_id):
    data = request.json
    errors = validate_update_solve(data)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422

    # Only allow dnf and plus_two to be updated — strip everything else
    allowed = {k: data[k] for k in ('dnf', 'plus_two') if k in data}

    try:
        result = (g.supabase.table('solves')
                  .update(allowed)
                  .eq('id', solve_id)
                  .eq('user_id', g.user_id)
                  .is_('deleted_at', None)
                  .execute())
        if not result.data:
            return jsonify({"error": "Solve not found"}), 404
        return jsonify(result.data[0])
    except Exception:
        current_app.logger.exception("update_solve failed")
        return jsonify({"error": "Internal server error"}), 500


@solves.route('/solves/<solve_id>', methods=['DELETE'])
@require_auth
@limiter.limit("60 per minute")
def delete_solve(solve_id):
    try:
        # Use an ISO UTC timestamp — the Supabase Python client sends JSON to
        # PostgREST, which does not interpret the literal string 'now()'.
        deleted_at = datetime.now(timezone.utc).isoformat()
        result = (g.supabase.table('solves')
                  .update({'deleted_at': deleted_at})
                  .eq('id', solve_id)
                  .eq('user_id', g.user_id)
                  .is_('deleted_at', None)
                  .execute())
        if not result.data:
            return jsonify({"error": "Solve not found"}), 404
        # Remove the matching PB row if this solve was a recorded PB. If this
        # was the current best, the next time the user beats their remaining
        # fastest a new PB will be inserted naturally.
        try:
            (g.supabase.table('personal_bests')
             .delete()
             .eq('user_id', g.user_id)
             .eq('solve_id', solve_id)
             .execute())
        except Exception:
            current_app.logger.exception("PB cleanup on delete failed (non-fatal)")
        return jsonify(result.data[0])
    except Exception:
        current_app.logger.exception("delete_solve failed")
        return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------------------------
# Shareable solve links (signed token). The token is deterministic HMAC over
# the solve id — no storage, no DB column. Verification is constant-time.
# ---------------------------------------------------------------------------
def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _b64url_decode(s: str) -> bytes:
    padding = '=' * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


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


def _verify_token(token: str):
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


@solves.route('/solves/<solve_id>/share-token', methods=['GET'])
@require_auth
@limiter.limit("30 per minute")
def get_share_token(solve_id):
    try:
        result = (g.supabase.table('solves')
                  .select('id')
                  .eq('id', solve_id)
                  .eq('user_id', g.user_id)
                  .is_('deleted_at', None)
                  .limit(1)
                  .execute())
        if not result.data:
            return jsonify({"error": "Solve not found"}), 404
        return jsonify({"token": _sign_solve_id(solve_id)})
    except Exception:
        current_app.logger.exception("get_share_token failed")
        return jsonify({"error": "Internal server error"}), 500


@solves.route('/solves/share/<token>', methods=['GET'])
@limiter.limit("60 per minute")
def get_shared_solve(token):
    solve_id = _verify_token(token)
    if solve_id is None:
        return jsonify({"error": "Invalid or expired share link"}), 404
    try:
        service = get_supabase_service_client()
        result = (service.table('solves')
                  .select('id,puzzle_type,time,dnf,plus_two,scramble,created_at')
                  .eq('id', solve_id)
                  .is_('deleted_at', None)
                  .limit(1)
                  .execute())
        if not result.data:
            return jsonify({"error": "Invalid or expired share link"}), 404
        return jsonify(result.data[0])
    except Exception:
        current_app.logger.exception("get_shared_solve failed")
        return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------------------------
# SD-3: Personal best history endpoint
# ---------------------------------------------------------------------------
@solves.route('/personal-bests', methods=['GET'])
@require_auth
@limiter.limit("60 per minute")
def get_personal_bests():
    puzzle_type = request.args.get('puzzle_type')

    try:
        query = (g.supabase.table('personal_bests')
                 .select('*')
                 .eq('user_id', g.user_id))
        if puzzle_type:
            query = query.eq('puzzle_type', puzzle_type)
        query = query.order('achieved_at')
        result = query.execute()
        return jsonify(result.data)
    except Exception:
        current_app.logger.exception("get_personal_bests failed")
        return jsonify({"error": "Internal server error"}), 500
