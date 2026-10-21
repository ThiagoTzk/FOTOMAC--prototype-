"""CSRF between sites of the same institution (audit M3, 17/10/2026): writes from a foreign origin are refused."""
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def test_a_write_from_another_origin_is_refused_before_anything_runs():
    client = TestClient(app)
    r = client.post("/api/v1/auth/logout", headers={"Origin": "https://outro-site.cesmac.edu.br"})
    assert r.status_code == 403 and r.json()["detail"] == "Origem não permitida."


def test_our_own_origin_and_requests_without_origin_pass():
    client = TestClient(app)
    assert client.post("/api/v1/auth/logout", headers={"Origin": get_settings().cors_origins[0]}).status_code == 204
    assert client.post("/api/v1/auth/logout").status_code == 204          # mobile app, scripts
    assert client.get("/api/v1/public/consent", headers={"Origin": "https://qualquer.site"}).status_code == 200  # reads
