"""Download-URL endpoint and text retrieval."""


def _make_file_share(client):
    init = client.post(
        "/api/shares/init",
        json={
            "type": "files",
            "file_metadata": [{"name": "report.pdf", "size": 4096, "mime": "application/pdf"}],
            "expires_in": 3600,
            "one_time": False,
        },
    ).json()
    file_id = init["upload_urls"][0]["file_id"]
    client.post(f"/api/shares/{init['share_id']}/confirm", json={"file_ids": [file_id]})
    return init["share_id"], file_id


def _make_text_share(client, content="hello"):
    resp = client.post(
        "/api/shares/text",
        json={"content": content, "expires_in": 3600, "one_time": False},
    ).json()
    return resp["share_id"]


def test_download_url_returned(client):
    share_id, file_id = _make_file_share(client)
    resp = client.get(f"/api/shares/{share_id}/files/{file_id}/download-url")
    assert resp.status_code == 200
    assert resp.json()["url"] == "https://r2.test/download"


def test_wrong_file_id_returns_404(client):
    share_id, _ = _make_file_share(client)
    resp = client.get(f"/api/shares/{share_id}/files/99999/download-url")
    assert resp.status_code == 404


def test_text_content_returned(client):
    share_id = _make_text_share(client, "secret message")
    resp = client.get(f"/api/shares/{share_id}/text")
    assert resp.status_code == 200
    assert resp.json()["content"] == "secret message"


def test_file_endpoint_on_text_share_returns_404(client):
    share_id = _make_text_share(client)
    resp = client.get(f"/api/shares/{share_id}/files/1/download-url")
    assert resp.status_code == 404
