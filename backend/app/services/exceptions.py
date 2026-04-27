"""Custom exceptions for service-layer business-rule violations.

Routes catch these and translate them to HTTP responses. Services never
import Flask or return HTTP objects.
"""


class SolveServiceError(Exception):
    """Base class for all solve-domain service errors."""


class SolveLimitReached(SolveServiceError):
    def __init__(self, limit: int):
        self.limit = limit
        super().__init__(f"Lifetime solve limit of {limit} reached")


class SolveNotFound(SolveServiceError):
    pass


class ShareTokenInvalid(SolveServiceError):
    pass
