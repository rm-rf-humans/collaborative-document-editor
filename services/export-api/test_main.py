from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_healthcheck():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_markdown_export_includes_ai_appendix():
    response = client.post(
        "/render",
        json={
            "format": "markdown",
            "title": "Launch Plan Draft",
            "content": "# Launch\n\nExport this draft.",
            "version": 2,
            "generatedAt": "2026-04-03T10:20:00.000Z",
            "includeAiAppendix": True,
            "aiInteractions": [
                {
                    "feature": "rewrite",
                    "status": "applied",
                    "initiatedBy": "user-layla",
                    "createdAt": "2026-04-03T10:18:00.000Z",
                    "requestedVersion": 2,
                    "sourceText": "Original line",
                    "suggestedText": "Sharper line",
                    "targetLanguage": None,
                }
            ],
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")
    assert "AI Suggestion History" in response.text
    assert "Sharper line" in response.text
