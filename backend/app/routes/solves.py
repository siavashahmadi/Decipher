from flask import Blueprint, request, jsonify
from functools import wraps
from ..db import get_supabase_client

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
            
            # Create authenticated client
            supabase = get_supabase_client(token)
            
            # Get user info using the token
            user = supabase.auth.get_user(jwt=token)
            request.user_id = user.user.id
            request.supabase = supabase
            
            return f(*args, **kwargs)
        except Exception as e:
            return jsonify({"error": "Invalid authentication token"}), 401
    return decorated

@solves.route('/solves', methods=['GET'])
@require_auth
def get_solves():
    puzzle_type = request.args.get('puzzle_type')
    
    try:
        query = request.supabase.table('solves').select('*').eq('user_id', request.user_id)
        if puzzle_type:
            query = query.eq('puzzle_type', puzzle_type)
        result = query.execute()
        return jsonify(result.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@solves.route('/solves', methods=['POST'])
@require_auth
def create_solve():
    try:
        data = request.json
        
        # Ensure user_id is set and matches the authenticated user
        data['user_id'] = request.user_id
        
        # Use the authenticated client for the insert
        result = request.supabase.table('solves').insert(data).execute()
        
        return jsonify(result.data[0])
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@solves.route('/solves/<solve_id>', methods=['PATCH'])
@require_auth
def update_solve(solve_id):
    try:
        data = request.json
        
        result = (request.supabase.table('solves')
                 .update(data)
                 .eq('id', solve_id)
                 .eq('user_id', request.user_id)
                 .execute())
        return jsonify(result.data[0])
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@solves.route('/solves/<solve_id>', methods=['DELETE'])
@require_auth
def delete_solve(solve_id):
    try:
        result = (request.supabase.table('solves')
                 .delete()
                 .eq('id', solve_id)
                 .eq('user_id', request.user_id)
                 .execute())
        return jsonify(result.data[0])
    except Exception as e:
        return jsonify({"error": str(e)}), 400