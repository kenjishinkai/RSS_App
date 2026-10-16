def test_register_success(client):
    response = client.post(
        "/auth/register",
        json={"email": "new-user@example.com", "password": "password123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "new-user@example.com"
    assert "newsdesk_token" in response.cookies


def test_register_duplicate_email(client):
    payload = {"email": "dup@example.com", "password": "password123"}
    assert client.post("/auth/register", json=payload).status_code == 200
    again = client.post("/auth/register", json=payload)
    assert again.status_code == 409


def test_login_success_and_failure(client):
    client.post(
        "/auth/register",
        json={"email": "login@example.com", "password": "password123"},
    )
    # 別クライアント相当にするため Cookie を消す
    client.cookies.clear()

    bad = client.post(
        "/auth/login",
        json={"email": "login@example.com", "password": "wrong-password"},
    )
    assert bad.status_code == 401

    ok = client.post(
        "/auth/login",
        json={"email": "login@example.com", "password": "password123"},
    )
    assert ok.status_code == 200
    assert "newsdesk_token" in ok.cookies


def test_topics_require_login(client):
    response = client.get("/topics")
    assert response.status_code == 401


def test_logout_clears_access(auth_client):
    client, _email, _password = auth_client
    assert client.get("/topics").status_code == 200

    logout = client.post("/auth/logout")
    assert logout.status_code == 200

    assert client.get("/topics").status_code == 401
