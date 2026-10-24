"""In-memory round lifecycle for a two-device prototype."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from threading import RLock

from .aggregation import AggregationResult, ClientDelta, FedAvgAggregator


class RoundError(ValueError):
    """Base class for client-visible round errors."""


class StaleModelError(RoundError):
    """The client trained against an older published model."""


class DuplicateClientError(RoundError):
    """The same optional pseudonym was already accepted in this round."""


@dataclass(frozen=True, slots=True)
class PrivacyPolicy:
    epsilon_per_round: float
    delta: float
    clip_norm: float


@dataclass(frozen=True, slots=True)
class SubmissionResult:
    status: str
    model_version: str
    round: int
    pending_clients: int
    required_clients: int


class RoundStore:
    """Collect, aggregate, and publish one anonymous round at a time.

    Only optional opaque pseudonyms are retained while a round is pending. They are not
    returned by the API and are discarded after aggregation. Anonymous submissions are
    accepted, but cannot be deduplicated by this in-memory prototype.
    """

    def __init__(self, aggregator: FedAvgAggregator, privacy: PrivacyPolicy) -> None:
        self._aggregator = aggregator
        self._privacy = privacy
        self._lock = RLock()
        self._model_version = "base-0"
        self._round = 0
        self._pending: list[ClientDelta] = []
        self._pending_ids: set[str] = set()
        self._latest: AggregationResult | None = None
        self._latest_base_version: str | None = None
        self._accepted_updates = 0

    @property
    def min_clients(self) -> int:
        return self._aggregator.min_clients

    @property
    def privacy(self) -> PrivacyPolicy:
        return self._privacy

    def submit(self, *, base_model_version: str, update: ClientDelta) -> SubmissionResult:
        with self._lock:
            if base_model_version != self._model_version:
                raise StaleModelError("base_model_version does not match the current model")
            if update.client_id is not None and update.client_id in self._pending_ids:
                raise DuplicateClientError("client pseudonym already submitted in this round")

            candidate = [*self._pending, update]
            result = self._aggregator.aggregate(candidate)
            if result is None:
                self._pending.append(update)
                if update.client_id is not None:
                    self._pending_ids.add(update.client_id)
                self._accepted_updates += 1
                return SubmissionResult(
                    status="pending",
                    model_version=self._model_version,
                    round=self._round,
                    pending_clients=len(self._pending),
                    required_clients=self.min_clients,
                )

            self._accepted_updates += 1
            old_version = self._model_version
            self._latest = result
            self._latest_base_version = old_version
            self._round += 1
            self._model_version = f"model-{self._round}"
            self._pending.clear()
            self._pending_ids.clear()
            return SubmissionResult(
                status="aggregated",
                model_version=self._model_version,
                round=self._round,
                pending_clients=0,
                required_clients=self.min_clients,
            )

    def metadata(self) -> dict[str, object]:
        with self._lock:
            return {
                "model_version": self._model_version,
                "round": self._round,
                "rounds_completed": self._round,
                "status": "model_available" if self._latest is not None else "waiting_for_clients",
                "pending_clients": len(self._pending),
                "required_clients": self.min_clients,
                "accepted_updates": self._accepted_updates,
                "privacy_budget": {
                    "epsilon_per_round": self._privacy.epsilon_per_round,
                    "delta": self._privacy.delta,
                    "clip_norm": self._privacy.clip_norm,
                    "mechanism": "client-side declared Gaussian noise",
                    "client_declaration_verified": False,
                    "accounting_note": (
                        "The server reports configured per-round values; it cannot verify "
                        "client-side noise addition or perform per-device composition accounting."
                    ),
                },
            }

    def model(self) -> dict[str, object]:
        with self._lock:
            if self._latest is None:
                return {
                    "model_version": self._model_version,
                    "round": self._round,
                    "available": False,
                    "base_model_version": None,
                    "delta": None,
                    "delta_sha256": None,
                    "contributing_clients": 0,
                    "total_examples": 0,
                }

            delta = {name: list(values) for name, values in sorted(self._latest.layers.items())}
            canonical = json.dumps(delta, separators=(",", ":"), sort_keys=True).encode("utf-8")
            return {
                "model_version": self._model_version,
                "round": self._round,
                "available": True,
                "base_model_version": self._latest_base_version,
                "delta": delta,
                "delta_sha256": hashlib.sha256(canonical).hexdigest(),
                "contributing_clients": self._latest.client_count,
                "total_examples": self._latest.total_examples,
            }
