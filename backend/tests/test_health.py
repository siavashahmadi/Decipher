"""Tests for /api/health (liveness) and /api/ready (readiness)."""
from unittest.mock import MagicMock, patch


def test_health_returns_200(client):
    res = client.get('/api/health')
    assert res.status_code == 200
    assert res.get_json() == {"status": "healthy"}


def test_ready_returns_200_when_supabase_ok(client):
    fake_client = MagicMock()
    # The chain client.table('solves').select('id').limit(1).execute() returns
    # an object with .data = []. MagicMock auto-handles the chain shape.
    with patch('app.db.get_supabase_client', return_value=fake_client):
        res = client.get('/api/ready')

    assert res.status_code == 200
    body = res.get_json()
    assert body['status'] == 'ready'
    assert body['checks']['supabase'] == 'ok'
    # JWKS may be 'fresh' or 'cold' depending on whether prior tests have
    # initialized the client; either is non-failing.
    assert body['checks']['jwks'] in ('fresh', 'cold')


def test_ready_returns_503_when_supabase_fails(client):
    with patch('app.db.get_supabase_client', side_effect=RuntimeError('down')):
        res = client.get('/api/ready')

    assert res.status_code == 503
    body = res.get_json()
    assert body['status'] == 'not_ready'
    assert body['checks']['supabase'] == 'fail'
