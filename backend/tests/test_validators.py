from app.validators import validate_create_solve, validate_update_solve


def test_create_rejects_missing_body():
    assert validate_create_solve(None) == {"body": "Request body is required"}


def test_create_accepts_minimal_valid():
    assert validate_create_solve({
        "puzzle_type": "333",
        "time": 12.34,
    }) is None


def test_create_rejects_unknown_puzzle():
    errors = validate_create_solve({"puzzle_type": "xyz", "time": 10})
    assert "puzzle_type" in errors


def test_create_rejects_bool_as_time():
    errors = validate_create_solve({"puzzle_type": "333", "time": True})
    assert errors["time"] == "Must be a number"


def test_create_rejects_out_of_range_time():
    assert "time" in validate_create_solve({"puzzle_type": "333", "time": 0})
    assert "time" in validate_create_solve({"puzzle_type": "333", "time": 3601})


def test_create_rejects_non_bool_flags():
    errors = validate_create_solve({
        "puzzle_type": "333",
        "time": 10,
        "dnf": "yes",
        "plus_two": 1,
    })
    assert errors["dnf"] == "Must be a boolean"
    assert errors["plus_two"] == "Must be a boolean"


def test_create_rejects_overlong_scramble():
    errors = validate_create_solve({
        "puzzle_type": "333",
        "time": 10,
        "scramble": "R " * 400,  # > 500 chars
    })
    assert "scramble" in errors


def test_update_rejects_missing_body():
    assert validate_update_solve(None) == {"body": "Request body is required"}


def test_update_accepts_partial_flags():
    assert validate_update_solve({"dnf": True}) is None
    assert validate_update_solve({"plus_two": False}) is None


def test_update_rejects_non_bool():
    assert "dnf" in validate_update_solve({"dnf": "yes"})
    assert "plus_two" in validate_update_solve({"plus_two": 1})


def test_update_requires_at_least_one_known_field():
    from app.validators import validate_update_solve
    assert validate_update_solve({"time": 999}) == {
        "body": "must include dnf or plus_two"
    }


def test_update_accepts_dnf_only():
    from app.validators import validate_update_solve
    assert validate_update_solve({"dnf": True}) is None


def test_update_accepts_plus_two_only():
    from app.validators import validate_update_solve
    assert validate_update_solve({"plus_two": True}) is None


def test_create_accepts_mega():
    from app.validators import validate_create_solve
    assert validate_create_solve({
        "puzzle_type": "mega",
        "time": 60.0,
        "scramble": "",
    }) is None


def test_create_rejects_minx():
    from app.validators import validate_create_solve
    result = validate_create_solve({
        "puzzle_type": "minx",
        "time": 60.0,
        "scramble": "",
    })
    assert result is not None and "puzzle_type" in result


def test_create_rejects_dropped_bld_oh_types():
    from app.validators import validate_create_solve
    for dropped in ('333bf', '333oh', '444bf', '555bf'):
        result = validate_create_solve({
            "puzzle_type": dropped,
            "time": 60.0,
            "scramble": "",
        })
        assert result is not None and "puzzle_type" in result, f"{dropped} should be rejected"
