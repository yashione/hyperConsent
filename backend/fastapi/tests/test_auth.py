from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_login_success():
    response = client.post("/login", data={"username": "alice", "password": "alice123"})

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]


def test_login_failure():
    response = client.post("/login", data={"username": "alice", "password": "wrong"})

    assert response.status_code == 401
