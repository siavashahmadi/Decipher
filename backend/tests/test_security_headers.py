"""B.7: every API response carries the configured security headers."""


def test_health_response_has_security_headers(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    h = r.headers
    assert h.get("X-Frame-Options") == "DENY"
    assert h.get("X-Content-Type-Options") == "nosniff"
    assert h.get("Referrer-Policy") == "no-referrer"
    assert "max-age=31536000" in h.get("Strict-Transport-Security", "")
    assert "includeSubDomains" in h.get("Strict-Transport-Security", "")
    # Phase 1 emits report-only; phase 2 flips to enforced. Accept either
    # so this test survives the second commit too.
    csp = h.get("Content-Security-Policy") or h.get("Content-Security-Policy-Report-Only")
    assert csp, "expected CSP or CSP-Report-Only header"
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
    assert "https://*.supabase.co" in csp
    assert "wss://*.supabase.co" in csp
    assert "'wasm-unsafe-eval'" in csp
