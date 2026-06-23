"""3-step upload flow: init → (mock PUT) → confirm."""


def test_init_returns_presigned_urls(client):
    resp = client.post(
        "/api/shares/init",
        json={
            "type": "files",
            "file_metadata": [{"name": "hello.txt", "size": 1024, "mime": "text/plain"}],
            "expires_in": 3600,
            "one_time": False,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "share_id" in data
    assert "delete_token" in data
    assert len(data["upload_urls"]) == 1
    assert data["upload_urls"][0]["url"] == "https://r2.test/upload"
    assert isinstance(data["upload_urls"][0]["file_id"], int)


def test_confirm_activates_share(client):
    init = client.post(
        "/api/shares/init",
        json={
            "type": "files",
            "file_metadata": [{"name": "doc.pdf", "size": 2048, "mime": "application/pdf"}],
            "expires_in": 3600,
            "one_time": False,
        },
    ).json()

    share_id = init["share_id"]
    file_id = init["upload_urls"][0]["file_id"]

    confirm = client.post(f"/api/shares/{share_id}/confirm", json={"file_ids": [file_id]})
    assert confirm.status_code == 200
    assert confirm.json()["share_id"] == share_id
    assert "url" in confirm.json()


def test_share_is_gettable_after_confirm(client):
    init = client.post(
        "/api/shares/init",
        json={
            "type": "files",
            "file_metadata": [{"name": "img.png", "size": 512, "mime": "image/png"}],
            "expires_in": 3600,
            "one_time": False,
        },
    ).json()
    share_id = init["share_id"]
    file_id = init["upload_urls"][0]["file_id"]
    client.post(f"/api/shares/{share_id}/confirm", json={"file_ids": [file_id]})

    meta = client.get(f"/api/shares/{share_id}")
    assert meta.status_code == 200
    body = meta.json()
    assert body["type"] == "files"
    assert len(body["files"]) == 1
    assert body["files"][0]["name"] == "img.png"


def test_unconfirmed_share_returns_404(client):
    init = client.post(
        "/api/shares/init",
        json={
            "type": "files",
            "file_metadata": [{"name": "data.csv", "size": 100, "mime": "text/csv"}],
            "expires_in": 3600,
            "one_time": False,
        },
    ).json()
    resp = client.get(f"/api/shares/{init['share_id']}")
    assert resp.status_code == 404


def test_multi_file_upload(client):
    init = client.post(
        "/api/shares/init",
        json={
            "type": "files",
            "file_metadata": [
                {"name": "a.txt", "size": 10, "mime": "text/plain"},
                {"name": "b.txt", "size": 20, "mime": "text/plain"},
            ],
            "expires_in": 3600,
            "one_time": False,
        },
    ).json()
    assert len(init["upload_urls"]) == 2
    file_ids = [u["file_id"] for u in init["upload_urls"]]
    confirm = client.post(
        f"/api/shares/{init['share_id']}/confirm", json={"file_ids": file_ids}
    )
    assert confirm.status_code == 200


def test_text_share_single_step(client):
    resp = client.post(
        "/api/shares/text",
        json={"content": "hello world", "expires_in": 3600, "one_time": False},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "share_id" in data
    assert "delete_token" in data
    assert "/s/" in data["url"]
