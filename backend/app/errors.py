"""Standardized error envelope (H.2).

Wire shape:
  {"error": {"code": "<CODE>", "message": "<msg>", "fields": {<field>: <msg>}}}

Status code is HTTP. `fields` is omitted when empty. `code` is a stable
upper-snake-case identifier; consumers should switch on `code` for
branching logic and fall back to `message` for display copy.

Any new code MUST be added here, not inlined at a route, so the catalogue
stays greppable.
"""
from __future__ import annotations

from typing import Any
from flask import jsonify

# Auth
AUTH_MISSING_TOKEN = "AUTH_MISSING_TOKEN"
AUTH_INVALID_TOKEN = "AUTH_INVALID_TOKEN"
AUTH_UNAVAILABLE = "AUTH_UNAVAILABLE"

# Validation
VALIDATION_FAILED = "VALIDATION_FAILED"
BATCH_VALIDATION_FAILED = "BATCH_VALIDATION_FAILED"
INVALID_QUERY_PARAM = "INVALID_QUERY_PARAM"

# Resource
NOT_FOUND = "NOT_FOUND"
SHARE_LINK_INVALID = "SHARE_LINK_INVALID"
SOLVE_LIMIT_REACHED = "SOLVE_LIMIT_REACHED"

# Throttling
RATE_LIMITED = "RATE_LIMITED"

# Server
INTERNAL_ERROR = "INTERNAL_ERROR"


def error_response(
    code: str,
    message: str,
    status: int,
    fields: dict[str, Any] | None = None,
):
    """Build a (response, status) tuple in the standard envelope."""
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if fields:
        body["error"]["fields"] = fields
    return jsonify(body), status
