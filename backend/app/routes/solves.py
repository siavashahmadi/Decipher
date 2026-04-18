from flask import Blueprint, request, jsonify
from functools import wraps
from ..db import get_supabase_client
from ..validators import validate_create_solve, validate_update_solve
from ..extensions import limiter

solves = Blueprint('solves', __name__)
solves.strict_slashes = False


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')

        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "No authorization token provided"}), 401

        try:
            token = auth_header.split(' ')[1]
            supabase = get_supabase_client(token)
            user = supabase.auth.get_user(jwt=token)
            request.user_id = user.user.id
            request.supabase = supabase
            return f(*args, **kwargs)
        except Exception:
            return jsonify({"error": "Invalid authentication token"}), 401
    return decorated


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
    limit = min(int(request.args.get('limit', 50)), 100)
    cursor = request.args.get('cursor')  # ISO 8601 created_at of last seen row

    try:
        query = (request.supabase.table('solves')
                 .select('*')
                 .eq('user_id', request.user_id))
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
        return jsonify({"error": "Internal server error"}), 500


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
        data['user_id'] = request.user_id
        result = request.supabase.table('solves').insert(data).execute()
        saved_solve = result.data[0]

        # SD-3: Check if this solve is a personal best and record it.
        # This is write-time materialization — we pay a small cost on every
        # non-DNF insert to keep GET /personal-bests O(1) at read time.
        if not data.get('dnf', False):
            _maybe_record_pb(
                request.supabase,
                request.user_id,
                data['puzzle_type'],
                float(saved_solve['time']),
                saved_solve['created_at'],
                saved_solve['id'],
            )

        return jsonify(saved_solve)
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


def _maybe_record_pb(supabase, user_id, puzzle_type, new_time, achieved_at, solve_id):
    """
    Insert into personal_bests if new_time beats the current recorded PB.
    Runs best-effort — exceptions are swallowed so the main create_solve
    response is never affected by PB tracking failures.
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
        pass


@solves.route('/solves/<solve_id>', methods=['PATCH'])
@require_auth
def update_solve(solve_id):
    data = request.json
    errors = validate_update_solve(data)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 422

    # Only allow dnf and plus_two to be updated — strip everything else
    allowed = {k: data[k] for k in ('dnf', 'plus_two') if k in data}

    try:
        result = (request.supabase.table('solves')
                  .update(allowed)
                  .eq('id', solve_id)
                  .eq('user_id', request.user_id)
                  .execute())
        if not result.data:
            return jsonify({"error": "Solve not found"}), 404
        return jsonify(result.data[0])
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@solves.route('/solves/<solve_id>', methods=['DELETE'])
@require_auth
def delete_solve(solve_id):
    try:
        result = (request.supabase.table('solves')
                  .delete()
                  .eq('id', solve_id)
                  .eq('user_id', request.user_id)
                  .execute())
        if not result.data:
            return jsonify({"error": "Solve not found"}), 404
        return jsonify(result.data[0])
    except Exception:
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
        query = (request.supabase.table('personal_bests')
                 .select('*')
                 .eq('user_id', request.user_id))
        if puzzle_type:
            query = query.eq('puzzle_type', puzzle_type)
        query = query.order('achieved_at')
        result = query.execute()
        return jsonify(result.data)
    except Exception:
        return jsonify({"error": "Internal server error"}), 500
