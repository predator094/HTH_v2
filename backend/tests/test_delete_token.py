"""Delete token — shown once, never retrievable, bcrypt-hashed."""


def _make_text(client):
    resp = client.post(
        "/api/shares/text",
        json={"content": "deletable", "expires_in": 3600, "one_time": False},
    ).json()
    return resp["share_id"], resp["delete_token"]


def test_valid_token_deletes_share(client):
    share_id, token = _make_text(client)
    resp = client.delete(f"/api/shares/{share_id}", headers={"X-Delete-Token": token})
    assert resp.status_code == 204

    # Confirm it's gone
    assert client.get(f"/api/shares/{share_id}").status_code == 404


def test_wrong_token_returns_403(client):
    share_id, _ = _make_text(client)
    resp = client.delete(f"/api/shares/{share_id}", headers={"X-Delete-Token": "wrong-token"})
    assert resp.status_code == 403


def test_missing_token_returns_422(client):
    share_id, _ = _make_text(client)
    resp = client.delete(f"/api/shares/{share_id}")
    assert resp.status_code == 422


def test_delete_nonexistent_returns_404(client):
    resp = client.delete("/api/shares/doesnotexist", headers={"X-Delete-Token": "any"})
    assert resp.status_code == 404


def test_delete_token_not_returned_after_creation(client):
    """Re-fetching metadata must never expose the delete token."""
    share_id, _ = _make_text(client)
    meta = client.get(f"/api/shares/{share_id}").json()
    assert "delete_token" not in meta
