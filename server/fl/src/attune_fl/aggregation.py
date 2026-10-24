"""Pure, dependency-free FedAvg over bounded numeric model deltas."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

LayerValues = tuple[float, ...]


class AggregationError(ValueError):
    """Raised when client deltas cannot be safely aggregated."""


@dataclass(frozen=True, slots=True)
class ClientDelta:
    """A validated client contribution in a model-version round."""

    layers: Mapping[str, LayerValues]
    num_examples: int
    client_id: str | None = None


@dataclass(frozen=True, slots=True)
class AggregationResult:
    """The weighted mean delta and non-sensitive round accounting."""

    layers: dict[str, LayerValues]
    client_count: int
    total_examples: int
    clipped_client_count: int


def _l2_norm(layers: Mapping[str, LayerValues]) -> float:
    squared = sum(value * value for values in layers.values() for value in values)
    return math.sqrt(squared)


def _clip_layers(
    layers: Mapping[str, LayerValues], clip_norm: float
) -> tuple[dict[str, LayerValues], bool]:
    norm = _l2_norm(layers)
    if not math.isfinite(norm):
        raise AggregationError("delta norm must be finite")
    if norm <= clip_norm or norm == 0:
        return dict(layers), False

    factor = clip_norm / norm
    return (
        {name: tuple(value * factor for value in values) for name, values in layers.items()},
        True,
    )


class FedAvgAggregator:
    """Aggregate client-noised deltas using example-count weighted FedAvg.

    This class deliberately does not create model weights, infer training data, or add
    privacy noise. It averages the deltas supplied by clients and clips each contribution
    defensively before averaging. The caller owns model architecture and client-side DP.
    """

    def __init__(
        self,
        *,
        min_clients: int = 2,
        clip_norm: float = 1.0,
        max_layers: int = 32,
        max_values_per_layer: int = 100_000,
        max_total_values: int = 500_000,
        max_examples_per_client: int = 10_000,
    ) -> None:
        if min_clients < 2:
            raise ValueError("min_clients must be at least 2")
        if clip_norm <= 0:
            raise ValueError("clip_norm must be positive")
        self.min_clients = min_clients
        self.clip_norm = clip_norm
        self.max_layers = max_layers
        self.max_values_per_layer = max_values_per_layer
        self.max_total_values = max_total_values
        self.max_examples_per_client = max_examples_per_client

    def aggregate(self, updates: Sequence[ClientDelta]) -> AggregationResult | None:
        """Return ``None`` until the configured minimum number of clients is present."""

        if not updates:
            return None
        reference_shapes = self._validate_shapes(updates)
        clipped: list[dict[str, LayerValues]] = []
        clipped_count = 0
        total_examples = 0
        for update in updates:
            if update.num_examples < 1 or update.num_examples > self.max_examples_per_client:
                raise AggregationError("num_examples is outside the permitted bound")
            layers, was_clipped = _clip_layers(update.layers, self.clip_norm)
            clipped.append(layers)
            clipped_count += int(was_clipped)
            total_examples += update.num_examples

        if len(updates) < self.min_clients:
            return None
        if total_examples < 1:
            raise AggregationError("total example weight must be positive")

        aggregate: dict[str, LayerValues] = {}
        for name, size in reference_shapes.items():
            aggregate[name] = tuple(
                sum(
                    layers[name][index] * update.num_examples
                    for layers, update in zip(clipped, updates, strict=True)
                )
                / total_examples
                for index in range(size)
            )

        return AggregationResult(
            layers=aggregate,
            client_count=len(updates),
            total_examples=total_examples,
            clipped_client_count=clipped_count,
        )

    def _validate_shapes(self, updates: Sequence[ClientDelta]) -> dict[str, int]:
        first = updates[0].layers
        if not first or len(first) > self.max_layers:
            raise AggregationError("invalid layer count")
        reference: dict[str, int] = {}
        total_values = 0
        for name, values in first.items():
            if not name or not values or len(values) > self.max_values_per_layer:
                raise AggregationError("invalid layer shape")
            reference[name] = len(values)
            total_values += len(values)
            if any(not math.isfinite(value) for value in values):
                raise AggregationError("model deltas must be finite")
        if total_values > self.max_total_values:
            raise AggregationError("model delta is too large")

        for update in updates[1:]:
            if set(update.layers) != set(reference):
                raise AggregationError("all clients must submit the same layer names")
            for name, size in reference.items():
                values = update.layers[name]
                if len(values) != size or any(not math.isfinite(value) for value in values):
                    raise AggregationError("all clients must submit matching finite layer shapes")
        return reference
