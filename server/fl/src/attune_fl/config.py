"""Configuration for the small, in-memory prototype service."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number") from exc


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean")


@dataclass(frozen=True, slots=True)
class Settings:
    """Runtime limits and privacy declarations.

    The service intentionally keeps state in memory. This makes the prototype easy to
    run and avoids silently introducing a database containing client metadata. A restart
    resets the pending round and published aggregate.
    """

    api_key: str | None = None
    allow_insecure_localhost: bool = False
    min_clients: int = 2
    clip_norm: float = 1.0
    privacy_epsilon_per_round: float = 1.0
    privacy_delta: float = 1e-5
    max_layers: int = 32
    max_values_per_layer: int = 100_000
    max_total_values: int = 500_000
    max_examples_per_client: int = 10_000
    max_body_bytes: int = 8 * 1024 * 1024

    @classmethod
    def from_env(cls) -> Settings:
        """Load settings from environment variables with conservative defaults."""

        settings = cls(
            api_key=os.getenv("FL_API_KEY") or None,
            allow_insecure_localhost=_env_bool("FL_ALLOW_INSECURE_LOCALHOST", False),
            min_clients=_env_int("FL_MIN_CLIENTS", 2),
            clip_norm=_env_float("FL_CLIP_NORM", 1.0),
            privacy_epsilon_per_round=_env_float("FL_PRIVACY_EPSILON", 1.0),
            privacy_delta=_env_float("FL_PRIVACY_DELTA", 1e-5),
            max_layers=_env_int("FL_MAX_LAYERS", 32),
            max_values_per_layer=_env_int("FL_MAX_VALUES_PER_LAYER", 100_000),
            max_total_values=_env_int("FL_MAX_TOTAL_VALUES", 500_000),
            max_examples_per_client=_env_int("FL_MAX_EXAMPLES_PER_CLIENT", 10_000),
            max_body_bytes=_env_int("FL_MAX_BODY_BYTES", 8 * 1024 * 1024),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        """Reject unsafe or internally inconsistent configuration."""

        if self.min_clients < 2:
            raise ValueError("min_clients must be at least 2 to reduce single-client exposure")
        if self.clip_norm <= 0:
            raise ValueError("clip_norm must be positive")
        if self.privacy_epsilon_per_round <= 0:
            raise ValueError("privacy_epsilon_per_round must be positive")
        if not 0 < self.privacy_delta < 1:
            raise ValueError("privacy_delta must be between 0 and 1")
        if self.max_layers < 1 or self.max_values_per_layer < 1 or self.max_total_values < 1:
            raise ValueError("model size limits must be positive")
        if self.max_examples_per_client < 1 or self.max_body_bytes < 1:
            raise ValueError("request limits must be positive")
