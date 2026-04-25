VALID_PUZZLE_TYPES = {
    '333', '222', '444', '555', '666', '777',
    '333bf', '333oh', 'clock', 'minx', 'pyram',
    'skewb', 'sq1', '444bf', '555bf'
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
