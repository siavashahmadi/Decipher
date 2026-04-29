import pytest

from app.validators import (
    validate_create_solve,
    validate_update_solve,
    validate_create_solves_batch,
    VALID_PUZZLE_TYPES,
)


# ---------------------------------------------------------------------------
# validate_create_solve
# ---------------------------------------------------------------------------


def test_create_rejects_missing_body():
    assert validate_create_solve(None) == {"body": "Request body is required"}


def test_create_accepts_minimal_valid():
    assert validate_create_solve({"puzzle_type": "333", "time": 12.34}) is None


@pytest.mark.parametrize("puzzle_type", sorted(VALID_PUZZLE_TYPES))
def test_create_accepts_each_valid_puzzle_type(puzzle_type):
    assert validate_create_solve({"puzzle_type": puzzle_type, "time": 12.34}) is None


@pytest.mark.parametrize("puzzle_type", [
    "xyz",            # nonsense
    "minx",           # historical name dropped in favour of "mega"
    "333bf",          # BLD variant — frontend doesn't surface this
    "333oh",          # one-handed variant — same
    "444bf",
    "555bf",
    "",               # empty string
    None,             # missing
])
def test_create_rejects_invalid_or_dropped_puzzle_types(puzzle_type):
    errors = validate_create_solve({"puzzle_type": puzzle_type, "time": 10})
    assert errors is not None and "puzzle_type" in errors


@pytest.mark.parametrize("time", [0.1, 1, 60, 3600])
def test_create_accepts_in_range_time(time):
    assert validate_create_solve({"puzzle_type": "333", "time": time}) is None


@pytest.mark.parametrize("time", [0, 0.09, -1, 3600.1, 9999])
def test_create_rejects_out_of_range_time(time):
    errors = validate_create_solve({"puzzle_type": "333", "time": time})
    assert errors is not None and errors["time"] == "Must be between 0.1 and 3600 seconds"


@pytest.mark.parametrize("time", [True, False, "10", None])
def test_create_rejects_non_numeric_time(time):
    errors = validate_create_solve({"puzzle_type": "333", "time": time})
    assert errors is not None
    # Missing time → "Required"; everything else → "Must be a number"
    expected = "Required" if time is None else "Must be a number"
    assert errors["time"] == expected


@pytest.mark.parametrize("field", ["dnf", "plus_two"])
@pytest.mark.parametrize("value", ["yes", 1, 0, "true", []])
def test_create_rejects_non_boolean_flag(field, value):
    errors = validate_create_solve({"puzzle_type": "333", "time": 10, field: value})
    assert errors is not None and errors[field] == "Must be a boolean"


@pytest.mark.parametrize("scramble, valid", [
    ("", True),
    ("R U R'", True),
    ("R " * 250, True),     # exactly 500 chars
    ("R " * 251, False),    # 502 chars — over the limit
])
def test_create_validates_scramble_length(scramble, valid):
    errors = validate_create_solve({"puzzle_type": "333", "time": 10, "scramble": scramble})
    if valid:
        assert errors is None
    else:
        assert errors is not None and "scramble" in errors


def test_create_rejects_non_string_scramble():
    errors = validate_create_solve({"puzzle_type": "333", "time": 10, "scramble": 123})
    assert errors is not None and errors["scramble"] == "Must be a string"


# ---------------------------------------------------------------------------
# validate_update_solve
# ---------------------------------------------------------------------------


def test_update_rejects_missing_body():
    assert validate_update_solve(None) == {"body": "Request body is required"}


@pytest.mark.parametrize("payload", [
    {"dnf": True},
    {"dnf": False},
    {"plus_two": True},
    {"plus_two": False},
    {"dnf": True, "plus_two": False},
])
def test_update_accepts_known_flag_combinations(payload):
    assert validate_update_solve(payload) is None


@pytest.mark.parametrize("payload", [
    {"time": 999},
    {"scramble": "R U R'"},
    {"unknown": True},
])
def test_update_requires_at_least_one_known_field(payload):
    # An empty dict short-circuits on `not data` and returns the
    # "Request body is required" error, so it's covered separately.
    assert validate_update_solve(payload) == {"body": "must include dnf or plus_two"}


def test_update_treats_empty_dict_as_missing_body():
    assert validate_update_solve({}) == {"body": "Request body is required"}


@pytest.mark.parametrize("field", ["dnf", "plus_two"])
@pytest.mark.parametrize("value", ["yes", 1, 0, "true", []])
def test_update_rejects_non_boolean_flag(field, value):
    errors = validate_update_solve({field: value})
    assert errors is not None and errors[field] == "Must be a boolean"


# ---------------------------------------------------------------------------
# validate_create_solves_batch
# ---------------------------------------------------------------------------


def test_batch_validator_accepts_valid_rows():
    err, rows = validate_create_solves_batch({"solves": [
        {"puzzle_type": "333", "time": 9.0, "dnf": False, "plus_two": False, "scramble": ""},
    ]})
    assert err is None
    assert len(rows) == 1


def test_batch_validator_rejects_empty():
    err, rows = validate_create_solves_batch({"solves": []})
    assert err == {"solves": "Must not be empty"}
    assert rows == []


def test_batch_validator_rejects_too_many():
    err, _ = validate_create_solves_batch({"solves": [{"puzzle_type": "333", "time": 9.0}] * 1001})
    assert "at most 1000" in err["solves"]


def test_batch_validator_rejects_invalid_row():
    err, _ = validate_create_solves_batch({"solves": [
        {"puzzle_type": "333", "time": 9.0, "dnf": False, "plus_two": False, "scramble": ""},
        {"puzzle_type": "bad", "time": 9.0},
    ]})
    assert err["rows"][0]["index"] == 1
    assert "puzzle_type" in err["rows"][0]["errors"]


@pytest.mark.parametrize("body", [None, "not a dict", 42, ["solves"]])
def test_batch_validator_rejects_non_dict_body(body):
    err, rows = validate_create_solves_batch(body)
    assert err == {"body": "Request body is required"}
    assert rows == []


def test_batch_validator_rejects_non_list_solves():
    err, rows = validate_create_solves_batch({"solves": "nope"})
    assert err == {"solves": "Must be an array"}
    assert rows == []
