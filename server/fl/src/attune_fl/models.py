"""Strict wire models for numeric, client-noised model updates."""

from __future__ import annotations

import math
import re
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictFloat,
    StrictInt,
    field_validator,
    model_validator,
)

_LAYER_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
_MODEL_VERSION = re.compile(r"^[a-z][A-Za-z0-9_.-]{0,63}$")
_PSEUDONYM = re.compile(r"^[A-Za-z0-9_-]{8,128}$")

PositiveStrictFloat = Annotated[StrictFloat, Field(gt=0)]
UnitIntervalFloat = Annotated[StrictFloat, Field(gt=0, lt=1)]


class PrivacyDeclaration(BaseModel):
    """Client declaration required for every upload.

    The server validates the shape of this declaration but cannot prove that a client
    actually added noise. This limitation is surfaced in metadata and documentation.
    """

    model_config = ConfigDict(extra="forbid")

    clipped: Literal[True]
    noise_added: Literal[True]
    mechanism: Literal["gaussian"]
    clip_norm: PositiveStrictFloat
    epsilon: PositiveStrictFloat
    delta: UnitIntervalFloat


class UpdateSubmission(BaseModel):
    """An update contains only bounded numeric deltas and bounded metadata."""

    model_config = ConfigDict(extra="forbid")

    base_model_version: str = Field(min_length=1, max_length=64)
    layers: dict[str, list[StrictFloat]] = Field(min_length=1)
    num_examples: StrictInt = Field(ge=1, le=10_000)
    client_id: str | None = Field(default=None, max_length=128)
    privacy: PrivacyDeclaration

    @field_validator("base_model_version")
    @classmethod
    def validate_model_version(cls, value: str) -> str:
        if _MODEL_VERSION.fullmatch(value) is None:
            raise ValueError("invalid model version")
        return value

    @field_validator("client_id")
    @classmethod
    def validate_client_id(cls, value: str | None) -> str | None:
        if value is not None and _PSEUDONYM.fullmatch(value) is None:
            raise ValueError("client_id must be an opaque pseudonym or omitted")
        return value

    @field_validator("layers")
    @classmethod
    def validate_numeric_layers(
        cls, value: dict[str, list[StrictFloat]]
    ) -> dict[str, list[StrictFloat]]:
        total_values = 0
        for name, values in value.items():
            if _LAYER_NAME.fullmatch(name) is None:
                raise ValueError("layer names must be bounded structural names")
            if not values:
                raise ValueError("layers must not be empty")
            for number in values:
                if not math.isfinite(number):
                    raise ValueError("model deltas must be finite numbers")
            total_values += len(values)
        if len(value) > 32:
            raise ValueError("too many layers")
        if total_values > 500_000:
            raise ValueError("model delta is too large")
        return value

    @model_validator(mode="after")
    def validate_privacy_declaration(self) -> UpdateSubmission:
        privacy_values = (
            self.privacy.clip_norm,
            self.privacy.epsilon,
            self.privacy.delta,
        )
        if not all(math.isfinite(value) for value in privacy_values):
            raise ValueError("privacy values must be finite numbers")
        return self


class PrivacyMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    epsilon_per_round: float
    delta: float
    clip_norm: float
    mechanism: Literal["client-side declared Gaussian noise"]
    client_declaration_verified: bool
    accounting_note: str


class MetadataResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_version: str
    round: int
    rounds_completed: int
    status: Literal["waiting_for_clients", "model_available"]
    pending_clients: int
    required_clients: int
    accepted_updates: int
    privacy_budget: PrivacyMetadata


class ModelResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_version: str
    round: int
    available: bool
    base_model_version: str | None
    delta: dict[str, list[float]] | None
    delta_sha256: str | None
    contributing_clients: int
    total_examples: int


class UpdateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accepted: bool
    status: Literal["pending", "aggregated"]
    model_version: str
    round: int
    pending_clients: int
    required_clients: int
