from tests.conftest import create_topic_via_api, seed_article  # noqa: F401


def test_topic_crud(auth_client):
    client, _email, _password = auth_client

    created = create_topic_via_api(client, "AI")
    assert created["name"] == "AI"

    listed = client.get("/topics")
    assert listed.status_code == 200
    assert any(row["id"] == created["id"] for row in listed.json())

    updated = client.patch(
        f"/topics/{created['id']}",
        json={"name": "人工知能"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "人工知能"

    deleted = client.delete(f"/topics/{created['id']}")
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}

    after = client.get("/topics").json()
    assert all(row["id"] != created["id"] for row in after)


def test_create_topic_empty_name(auth_client):
    client, _email, _password = auth_client
    response = client.post("/topics", json={"name": "   "})
    assert response.status_code == 422


def test_delete_topic_with_articles_returns_409(auth_client):
    client, _email, _password = auth_client
    topic = create_topic_via_api(client, "記事あり")
    seed_article(topic["id"])

    response = client.delete(f"/topics/{topic['id']}")
    assert response.status_code == 409
    assert "記事" in response.json()["detail"]


def test_delete_empty_topic_ok(auth_client):
    client, _email, _password = auth_client
    topic = create_topic_via_api(client, "空の箱")
    response = client.delete(f"/topics/{topic['id']}")
    assert response.status_code == 200
