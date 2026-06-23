"""Passcode auth and per-share brute-force lockout."""
from src.config import settings


def _make_protected_text(client, passcode="s3cr3t"):
    resp = client.post(
        "/api/shares/text",
        json={"content": "protected", "expires_in": 3600, "passcode": passcode, "one_time": False},
    ).json()
    return resp["share_id"]


def test_correct_passcode_grants_access(client):
    share_id = _make_protected_text(client)
    resp = client.get(f"/api/shares/{share_id}", headers={"X-Passcode": "s3cr3t"})
    assert resp.status_code == 200
    assert resp.json()["requires_passcode"] is True


def test_missing_passcode_returns_401(client):
    share_id = _make_protected_text(client)
    resp = client.get(f"/api/shares/{share_id}")
    assert resp.status_code == 401
    assert resp.json()["detail"]["requires_passcode"] is True


def test_wrong_passcode_returns_401(client):
    share_id = _make_protected_text(client)
    resp = client.get(f"/api/shares/{share_id}", headers={"X-Passcode": "wrong"})
    assert resp.status_code == 401


def test_lockout_after_max_attempts(client):
    share_id = _make_protected_text(client)
    for _ in range(settings.passcode_max_attempts):
        client.get(f"/api/shares/{share_id}", headers={"X-Passcode": "bad"})

    # Next attempt should be locked
    resp = client.get(f"/api/shares/{share_id}", headers={"X-Passcode": "bad"})
    assert resp.status_code == 423
    assert "locked_until" in resp.json()["detail"]


def test_correct_passcode_not_locked_after_partial_failures(client):
    share_id = _make_protected_text(client)
    # Fail fewer than max attempts
    for _ in range(settings.passcode_max_attempts - 1):
        client.get(f"/api/shares/{share_id}", headers={"X-Passcode": "bad"})

    # Correct passcode still works
    resp = client.get(f"/api/shares/{share_id}", headers={"X-Passcode": "s3cr3t"})
    assert resp.status_code == 200
