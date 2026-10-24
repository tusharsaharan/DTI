from __future__ import annotations

from fastapi.testclient import TestClient

from attune_fl.api import create_app
from attune_fl.config import Settings

API_KEY = "local-prototype-key"


def _client() -> TestClient:
    return TestClient(
        create_app(
            Settings(
                api_key=API_KEY,
                min_clients=2,
                clip_norm=1.0,
                privacy_epsilon_per_round=1.0,
                privacy_delta=1e-5,
            )
        )
    )


def _update(
    client_id: str, values: list[float], *, base_version: str = "base-0"
) -> dict[str, object]:
    return {
        "base_model_version": base_version,
        "layers": {"lm.weight": values},
        "num_examples": 1,
        "client_id": client_id,
        "privacy": {
            "clipped": True,
            "noise_added": True,
            "mechanism": "gaussian",
            "clip_norm": 1.0,
            "epsilon": 1.0,
            "delta": 1e-5,
        },
    }


def test_round_does_not_advance_until_two_clients_submit() -> None:
    client = _client()

    before = client.get("/v1/metadata", headers={"X-Attune-API-Key": API_KEY})
    assert before.status_code == 200
    assert before.json()["round"] == 0
    assert before.json()["status"] == "waiting_for_clients"

    first = client.post(
        "/v1/updates",
        headers={"X-Attune-API-Key": API_KEY},
        json=_update("device-a", [0.25, 0.0]),
    )
    assert first.status_code == 202
    assert first.json()["status"] == "pending"
    assert first.json()["round"] == 0

    still_pending = client.get("/v1/metadata", headers={"X-Attune-API-Key": API_KEY})
    assert still_pending.json()["round"] == 0
    assert still_pending.json()["rounds_completed"] == 0
    assert (
        client.get("/v1/model", headers={"X-Attune-API-Key": API_KEY}).json()["available"] is False
    )

    second = client.post(
        "/v1/updates",
        headers={"X-Attune-API-Key": API_KEY},
        json=_update("device-b", [0.0, 0.5]),
    )
    assert second.status_code == 202
    assert second.json()["status"] == "aggregated"
    assert second.json()["round"] == 1

    model = client.get("/v1/model", headers={"X-Attune-API-Key": API_KEY})
    assert model.status_code == 200
    assert model.json()["model_version"] == "model-1"
    assert model.json()["delta"] == {"lm.weight": [0.125, 0.25]}
    assert model.json()["contributing_clients"] == 2


def test_authentication_and_raw_text_boundary() -> None:
    client = _client()

    unauthorized = client.get("/v1/metadata")
    assert unauthorized.status_code == 401

    raw_text = client.post(
        "/v1/updates",
        headers={"X-Attune-API-Key": API_KEY},
        json={"text": "this must never be accepted"},
    )
    assert raw_text.status_code == 422
    assert "this must never be accepted" not in raw_text.text


def test_duplicate_pseudonym_and_stale_model_are_rejected() -> None:
    client = _client()
    headers = {"X-Attune-API-Key": API_KEY}
    assert (
        client.post("/v1/updates", headers=headers, json=_update("device-a", [0.1])).status_code
        == 202
    )
    duplicate = client.post("/v1/updates", headers=headers, json=_update("device-a", [0.2]))
    assert duplicate.status_code == 409

    assert (
        client.post("/v1/updates", headers=headers, json=_update("device-b", [0.1])).status_code
        == 202
    )
    stale = client.post("/v1/updates", headers=headers, json=_update("device-c", [0.1]))
    assert stale.status_code == 409


def test_rejected_shape_does_not_poison_the_pending_round() -> None:
    client = _client()
    headers = {"X-Attune-API-Key": API_KEY}
    assert (
        client.post("/v1/updates", headers=headers, json=_update("device-a", [0.1])).status_code
        == 202
    )

    invalid = client.post("/v1/updates", headers=headers, json=_update("device-b", [0.1, 0.2]))
    assert invalid.status_code == 422

    valid = client.post("/v1/updates", headers=headers, json=_update("device-b", [0.2]))
    assert valid.status_code == 202
    assert valid.json()["status"] == "aggregated"
