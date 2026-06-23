"""One-time download semantics."""


def _make_one_time_file(client):
    init = client.post(
        "/api/shares/init",
        json={
            "type": "files",
            "file_metadata": [{"name": "secret.zip", "size": 100, "mime": "application/zip"}],
            "expires_in": 3600,
            "one_time": True,
        },
    ).json()
    file_id = init["upload_urls"][0]["file_id"]
    client.post(f"/api/shares/{init['share_id']}/confirm", json={"file_ids": [file_id]})
    return init["share_id"], file_id


def _make_one_time_text(client):
    resp = client.post(
        "/api/shares/text",
        json={"content": "burn after reading", "expires_in": 3600, "one_time": True},
    ).json()
    return resp["share_id"]


def test_file_share_burned_after_first_download_url(client):
    share_id, file_id = _make_one_time_file(client)

    first = client.get(f"/api/shares/{share_id}/files/{file_id}/download-url")
    assert first.status_code == 200

    # Share should now be burned → 404
    second = client.get(f"/api/shares/{share_id}/files/{file_id}/download-url")
    assert second.status_code == 404


def test_text_share_burned_after_content_retrieved(client):
    share_id = _make_one_time_text(client)

    first = client.get(f"/api/shares/{share_id}/text")
    assert first.status_code == 200
    assert first.json()["content"] == "burn after reading"

    second = client.get(f"/api/shares/{share_id}/text")
    assert second.status_code == 404


def test_metadata_does_not_burn_share(client):
    """Metadata GET must not trigger the burn — only content retrieval does."""
    share_id, file_id = _make_one_time_file(client)

    meta = client.get(f"/api/shares/{share_id}")
    assert meta.status_code == 200

    # Still accessible after metadata read
    dl = client.get(f"/api/shares/{share_id}/files/{file_id}/download-url")
    assert dl.status_code == 200
