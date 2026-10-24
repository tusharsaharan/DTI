# Attune federated-learning server foundation

This directory contains the small server boundary for optional, on-device keyboard
model updates described in `PLAN.md §5.2`. It is intentionally an in-memory prototype
for two devices:

- clients submit only bounded numeric model deltas;
- every submission must declare that the delta was clipped and Gaussian-noised on-device;
- the server clips again defensively and performs example-count weighted FedAvg;
- the server publishes an aggregate delta only after `FL_MIN_CLIENTS` submissions;
- default `FL_MIN_CLIENTS=2` means an empty server or one-device submission never claims a
  completed round;
- no endpoint accepts, stores, logs, or returns keyboard text.

The server cannot prove that a client actually added noise. The declaration is therefore
reported as `client_declaration_verified: false` in metadata. This service does not add DP
noise, perform per-device privacy accounting, or invent model weights/training examples.
Those responsibilities remain on the device and in the future deployment protocol.

## API

All `/v1/*` endpoints require the `X-Attune-API-Key` header. `/healthz` is unauthenticated.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | Liveness only |
| `GET` | `/v1/metadata` | Current model version, round status, client threshold, and privacy metadata |
| `GET` | `/v1/model` | Latest numeric aggregate delta and integrity hash, if a round completed |
| `POST` | `/v1/updates` | Submit a clipped/noised numeric delta |

An update has this shape (layer names are structural names, not text data):

```json
{
  "base_model_version": "base-0",
  "layers": {"lm.weight": [0.01, -0.02, 0.004]},
  "num_examples": 42,
  "client_id": "opaque-pseudonym-01",
  "privacy": {
    "clipped": true,
    "noise_added": true,
    "mechanism": "gaussian",
    "clip_norm": 1.0,
    "epsilon": 1.0,
    "delta": 0.00001
  }
}
```

`client_id` is optional and must be an opaque pseudonym if supplied. It is retained only
while the current in-memory round is pending, used to reject a duplicate submission, and
never returned by the API. Omitting it is more private but means this prototype cannot
deduplicate that device within a round.

The server accepts a first update as `pending` and keeps `round=0`. A second valid update
for the same base model causes `round=1` and publishes `model-1`. If the base model version
is stale, the update is rejected instead of being silently mixed into a later round.

The optional Flower adapter is in `src/attune_fl/flower_adapter.py`. It is not wired into
the FastAPI process. A caller must explicitly install Flower and construct the adapter.
It only converts Flower numeric fit tensors into the tested pure FedAvg core; it does not
pretend to provide transport authentication or client-side privacy guarantees.

## Local Python commands

From `server/fl`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
$env:PYTHONPATH = "src"
python -m pytest
python -m ruff check src tests
$env:FL_API_KEY = "replace-with-a-long-random-local-key"
python -m uvicorn attune_fl.api:app --host 127.0.0.1 --port 8000
```

Check liveness:

```powershell
curl.exe http://127.0.0.1:8000/healthz
```

For metadata and updates, pass the API key:

```powershell
curl.exe -H "X-Attune-API-Key: replace-with-a-long-random-local-key" http://127.0.0.1:8000/v1/metadata
```

The default server state is in memory and resets on restart. There is no persistence layer
to accidentally retain client identifiers or model-update history in this foundation.

## Docker Compose

Set a secret before starting; Compose refuses to start without it:

```powershell
$env:FL_API_KEY = "replace-with-a-long-random-local-key"
docker compose up --build
```

The container listens on port `8000`. The API key protects the prototype transport, but
production deployment should still place it behind TLS and a managed secret store. Use a
stable, client-generated pseudonym only if round deduplication is needed; never send raw
keyboard text or a device serial number.
