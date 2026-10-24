"""FastAPI transport for privacy-bounded keyboard model updates."""

from __future__ import annotations

import secrets
from collections.abc import Callable

from fastapi import FastAPI, Header, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .aggregation import AggregationError, ClientDelta, FedAvgAggregator
from .config import Settings
from .models import MetadataResponse, ModelResponse, UpdateResponse, UpdateSubmission
from .store import DuplicateClientError, PrivacyPolicy, RoundError, RoundStore, StaleModelError


def create_app(settings: Settings | None = None, store: RoundStore | None = None) -> FastAPI:
    """Create an app with injectable settings and in-memory state for tests."""

    runtime = settings or Settings.from_env()
    runtime.validate()
    round_store = store or RoundStore(
        aggregator=FedAvgAggregator(
            min_clients=runtime.min_clients,
            clip_norm=runtime.clip_norm,
            max_layers=runtime.max_layers,
            max_values_per_layer=runtime.max_values_per_layer,
            max_total_values=runtime.max_total_values,
            max_examples_per_client=runtime.max_examples_per_client,
        ),
        privacy=PrivacyPolicy(
            epsilon_per_round=runtime.privacy_epsilon_per_round,
            delta=runtime.privacy_delta,
            clip_norm=runtime.clip_norm,
        ),
    )

    app = FastAPI(
        title="Attune Federated Learning Server",
        version="0.1.0",
        description="Accepts only client-clipped, client-noised numeric keyboard model deltas.",
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
    )
    app.state.settings = runtime
    app.state.round_store = round_store

    @app.middleware("http")
    async def limit_request_size(request: Request, call_next: Callable[..., object]) -> object:
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                too_large = int(content_length) > runtime.max_body_bytes
            except ValueError:
                too_large = True
            if too_large:
                return JSONResponse(status_code=413, content={"detail": "request too large"})
        return await call_next(request)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Never serialize Pydantic's ``input`` field: it could echo an accidental raw text field.
        detail = [
            {"loc": error.get("loc", []), "msg": "invalid request", "type": error["type"]}
            for error in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": detail})

    def require_api_key(provided: str | None, request: Request) -> None:
        if runtime.api_key is None:
            if (
                runtime.allow_insecure_localhost
                and request.client
                and request.client.host
                in {
                    "127.0.0.1",
                    "::1",
                }
            ):
                return
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="updates are disabled until FL_API_KEY is configured",
            )
        if provided is None or not secrets.compare_digest(provided, runtime.api_key):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid API key",
                headers={"WWW-Authenticate": "ApiKey"},
            )

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/v1/metadata", response_model=MetadataResponse)
    def metadata(
        request: Request, x_attune_api_key: str | None = Header(default=None)
    ) -> dict[str, object]:
        require_api_key(x_attune_api_key, request)
        return round_store.metadata()

    @app.get("/v1/model", response_model=ModelResponse)
    def model(
        request: Request, x_attune_api_key: str | None = Header(default=None)
    ) -> dict[str, object]:
        require_api_key(x_attune_api_key, request)
        return round_store.model()

    @app.post("/v1/updates", response_model=UpdateResponse, status_code=status.HTTP_202_ACCEPTED)
    def submit_update(
        submission: UpdateSubmission,
        request: Request,
        x_attune_api_key: str | None = Header(default=None),
    ) -> UpdateResponse:
        require_api_key(x_attune_api_key, request)
        if submission.privacy.clip_norm > runtime.clip_norm:
            raise HTTPException(status_code=422, detail="client clip_norm exceeds server bound")
        if submission.privacy.epsilon > runtime.privacy_epsilon_per_round:
            raise HTTPException(status_code=422, detail="client epsilon exceeds configured budget")
        if submission.privacy.delta > runtime.privacy_delta:
            raise HTTPException(status_code=422, detail="client delta exceeds configured budget")

        client_delta = ClientDelta(
            layers={name: tuple(values) for name, values in submission.layers.items()},
            num_examples=submission.num_examples,
            client_id=submission.client_id,
        )
        try:
            result = round_store.submit(
                base_model_version=submission.base_model_version,
                update=client_delta,
            )
        except (DuplicateClientError, StaleModelError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except AggregationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except RoundError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        return UpdateResponse(
            accepted=True,
            status=result.status,  # type: ignore[arg-type]
            model_version=result.model_version,
            round=result.round,
            pending_clients=result.pending_clients,
            required_clients=result.required_clients,
        )

    return app


app = create_app()
