from app.services.curate import CurateResult
from tests.conftest import create_topic_via_api


def test_curate_with_mocked_pipeline(auth_client, monkeypatch):
    client, _email, _password = auth_client
    topic = create_topic_via_api(client, "モック取得")

    def fake_run_curation(*, topic_id: str, topic_name: str) -> CurateResult:
        assert topic_id == topic["id"]
        assert topic_name == topic["name"]
        return CurateResult(
            fetched=1,
            new_items=1,
            inserted=1,
            message="モック成功",
        )

    monkeypatch.setattr("app.routers.jobs.run_curation", fake_run_curation)

    response = client.post(
        "/jobs/curate",
        json={"topic_id": topic["id"], "topic_name": topic["name"]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["inserted"] == 1
    assert body["message"] == "モック成功"
