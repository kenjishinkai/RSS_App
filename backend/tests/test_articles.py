import uuid

from tests.conftest import create_topic_via_api, seed_article


def test_list_read_favorite_delete(auth_client):
    client, _email, _password = auth_client
    topic = create_topic_via_api(client, "記事トピック")
    article = seed_article(topic["id"], title="消す記事")

    listed = client.get(f"/articles?topic_id={topic['id']}")
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 1
    assert rows[0]["id"] == str(article.id)
    assert rows[0]["is_read"] is False
    assert rows[0]["is_favorite"] is False

    read = client.patch(f"/articles/{article.id}/read")
    assert read.status_code == 200
    assert read.json()["is_read"] is True

    fav = client.patch(f"/articles/{article.id}/favorite")
    assert fav.status_code == 200
    assert fav.json()["is_favorite"] is True

    unfav = client.delete(f"/articles/{article.id}/favorite")
    assert unfav.status_code == 200
    assert unfav.json()["is_favorite"] is False

    deleted = client.delete(f"/articles/{article.id}")
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}

    after = client.get(f"/articles?topic_id={topic['id']}")
    assert after.json() == []


def test_delete_missing_article_404(auth_client):
    client, _email, _password = auth_client
    missing = uuid.uuid4()
    response = client.delete(f"/articles/{missing}")
    assert response.status_code == 404
