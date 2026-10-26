from fastapi.testclient import TestClient
import pytest

from app.main import app, fastapi_app


@pytest.mark.parametrize(
    "origin",
    [
        "http://localhost:5173",
        "https://project-exhibition-delta.vercel.app",
    ],
)
def test_notifications_preflight_allows_frontend_origins(origin):
    response = TestClient(app).options(
        "/api/v1/notifications/devices",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_unhandled_errors_keep_cors_headers():
    path = "/_test/cors-error"
    original_routes = fastapi_app.router.routes.copy()

    def raise_error():
        raise RuntimeError("test server error")

    fastapi_app.add_api_route(path, raise_error, methods=["GET"])
    try:
        response = TestClient(app, raise_server_exceptions=False).get(
            path,
            headers={"Origin": "https://project-exhibition-delta.vercel.app"},
        )
    finally:
        fastapi_app.router.routes = original_routes

    assert response.status_code == 500
    assert (
        response.headers["access-control-allow-origin"]
        == "https://project-exhibition-delta.vercel.app"
    )
