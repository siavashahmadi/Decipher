VALID_PUZZLE_TYPES = {
    '333', '222', '444', '555', '666', '777',
    'clock', 'mega', 'pyram', 'skewb', 'sq1',
}


def validate_create_solve(data):
    """Validate POST /solves payload. Returns dict of field errors or None."""
    if not data:
        return {"body": "Request body is required"}

    errors = {}

    puzzle_type = data.get('puzzle_type')
    if not puzzle_type or puzzle_type not in VALID_PUZZLE_TYPES:
        errors['puzzle_type'] = f"Must be one of: {', '.join(sorted(VALID_PUZZLE_TYPES))}"

    time = data.get('time')
    if time is None:
        errors['time'] = "Required"
    elif isinstance(time, bool) or not isinstance(time, (int, float)):
        errors['time'] = "Must be a number"
    elif time < 0.1 or time > 3600:
        errors['time'] = "Must be between 0.1 and 3600 seconds"

    dnf = data.get('dnf', False)
    if not isinstance(dnf, bool):
        errors['dnf'] = "Must be a boolean"

    plus_two = data.get('plus_two', False)
    if not isinstance(plus_two, bool):
        errors['plus_two'] = "Must be a boolean"

    scramble = data.get('scramble', '')
    if not isinstance(scramble, str):
        errors['scramble'] = "Must be a string"
    elif len(scramble) > 500:
        errors['scramble'] = "Must be 500 characters or fewer"

    return errors if errors else None


def validate_update_solve(data):
    """Validate PATCH /solves/<id> payload. Returns dict of field errors or None."""
    if not data:
        return {"body": "Request body is required"}

    if not any(k in data for k in ('dnf', 'plus_two')):
        return {"body": "must include dnf or plus_two"}

    errors = {}

    if 'dnf' in data and not isinstance(data['dnf'], bool):
        errors['dnf'] = "Must be a boolean"

    if 'plus_two' in data and not isinstance(data['plus_two'], bool):
        errors['plus_two'] = "Must be a boolean"

    return errors if errors else None

BATCH_MAX = 1000


def validate_create_solves_batch(data):
    """Validate POST /solves/batch payload. Returns (errors, valid_rows).

    errors is a dict like {"body": "..."} for top-level issues, or
    {"rows": [{idx, errors}, ...]} for per-row issues. valid_rows is
    the list of rows that passed validation (empty when errors exist).
    """
    if not data or not isinstance(data, dict):
        return {"body": "Request body is required"}, []
    rows = data.get("solves")
    if not isinstance(rows, list):
        return {"solves": "Must be an array"}, []
    if not rows:
        return {"solves": "Must not be empty"}, []
    if len(rows) > BATCH_MAX:
        return {"solves": f"Must contain at most {BATCH_MAX} rows"}, []

    row_errors = []
    for idx, row in enumerate(rows):
        err = validate_create_solve(row)
        if err:
            row_errors.append({"index": idx, "errors": err})

    if row_errors:
        return {"rows": row_errors}, []
    return None, rows
