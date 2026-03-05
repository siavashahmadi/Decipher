from flask import Blueprint, request, jsonify
from flask_cors import cross_origin
from functools import wraps
from ..db import get_supabase_client

solves = Blueprint('solves', __name__)

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        print("\n=== Auth Decorator Start ===")
        auth_header = request.headers.get('Authorization')
        print(f"Auth header received: {auth_header[:30]}..." if auth_header else "No auth header")
        
        if not auth_header or not auth_header.startswith('Bearer '):
            print("No Bearer token found")
            return jsonify({"error": "No authorization token provided"}), 401
        
        try:
            token = auth_header.split(' ')[1]
            print("Token extracted, attempting to get user...")
            
            # Create authenticated client
            supabase = get_supabase_client(token)
            
            # Get user info using the token
            user = supabase.auth.get_user(token)
            request.user_id = user.user.id
            request.supabase = supabase
            
            print(f"Successfully authenticated user_id: {request.user_id}")
            print("=== Auth Decorator End ===\n")
            return f(*args, **kwargs)
        except Exception as e:
            print(f"Auth error: {str(e)}")
            print(f"Full error details: {repr(e)}")
            print("=== Auth Decorator End with Error ===\n")
            return jsonify({"error": "Invalid authentication token"}), 401
    return decorated

@solves.route('/solves/', methods=['OPTIONS'])
@solves.route('/solves', methods=['OPTIONS'])
@cross_origin()
def handle_solves_options():
    return {'success': True}, 200

@solves.route('/solves/<solve_id>/', methods=['OPTIONS'])
@solves.route('/solves/<solve_id>', methods=['OPTIONS'])
@cross_origin()
def handle_solve_options(solve_id):
    return {'success': True}, 200

@cross_origin()
@solves.route('/solves/', methods=['GET'])
@solves.route('/solves', methods=['GET'])
@require_auth
def get_solves():
    print("\n=== GET Solves Start ===")
    puzzle_type = request.args.get('puzzle_type')
    print(f"Fetching solves for puzzle_type: {puzzle_type}")
    print(f"User ID: {request.user_id}")
    
    try:
        query = request.supabase.table('solves').select('*').eq('user_id', request.user_id)
        if puzzle_type:
            query = query.eq('puzzle_type', puzzle_type)
        print(f"Executing query for user_id: {request.user_id}")
        result = query.execute()
        print(f"Found {len(result.data)} solves")
        print("=== GET Solves End ===\n")
        return jsonify(result.data)
    except Exception as e:
        print(f"Error in get_solves: {str(e)}")
        print(f"Full error details: {repr(e)}")
        print("=== GET Solves End with Error ===\n")
        return jsonify({"error": str(e)}), 400

@cross_origin()
@solves.route('/solves/', methods=['POST'])
@solves.route('/solves', methods=['POST'])
@require_auth
def create_solve():
    print("\n=== POST Solve Start ===")
    try:
        data = request.json
        print(f"Received data: {data}")
        print(f"User ID from auth: {request.user_id}")
        
        # Ensure user_id is set and matches the authenticated user
        data['user_id'] = request.user_id
        print(f"Final data to insert: {data}")
        
        # Use the authenticated client for the insert
        result = request.supabase.table('solves').insert(data).execute()
        
        print(f"Insert successful. Result: {result.data[0]}")
        print("=== POST Solve End ===\n")
        return jsonify(result.data[0])
    except Exception as e:
        print(f"Error in create_solve: {str(e)}")
        print(f"Request headers: {dict(request.headers)}")
        print(f"Full error details: {repr(e)}")
        print("=== POST Solve End with Error ===\n")
        return jsonify({"error": str(e)}), 400

@cross_origin()
@solves.route('/solves/<solve_id>/', methods=['PATCH'])
@solves.route('/solves/<solve_id>', methods=['PATCH'])
@require_auth
def update_solve(solve_id):
    print("\n=== PATCH Solve Start ===")
    print(f"Updating solve_id: {solve_id}")
    try:
        data = request.json
        print(f"Update data: {data}")
        print(f"User ID: {request.user_id}")
        
        result = (request.supabase.table('solves')
                 .update(data)
                 .eq('id', solve_id)
                 .eq('user_id', request.user_id)
                 .execute())
        print(f"Update successful. Result: {result.data[0]}")
        print("=== PATCH Solve End ===\n")
        return jsonify(result.data[0])
    except Exception as e:
        print(f"Error in update_solve: {str(e)}")
        print(f"Full error details: {repr(e)}")
        print("=== PATCH Solve End with Error ===\n")
        return jsonify({"error": str(e)}), 400

@cross_origin()
@solves.route('/solves/<solve_id>/', methods=['DELETE'])
@solves.route('/solves/<solve_id>', methods=['DELETE'])
@require_auth
def delete_solve(solve_id):
    print("\n=== DELETE Solve Start ===")
    print(f"Deleting solve_id: {solve_id}")
    try:
        result = (request.supabase.table('solves')
                 .delete()
                 .eq('id', solve_id)
                 .eq('user_id', request.user_id)
                 .execute())
        print(f"Delete successful. Result: {result.data[0]}")
        print("=== DELETE Solve End ===\n")
        return jsonify(result.data[0])
    except Exception as e:
        print(f"Error in delete_solve: {str(e)}")
        print(f"Full error details: {repr(e)}")
        print("=== DELETE Solve End with Error ===\n")
        return jsonify({"error": str(e)}), 400