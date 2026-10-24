"""Optional Flower integration boundary.

The FastAPI service does not pretend to be a Flower transport. This module adapts
Flower's fit-result tensors to the independently tested FedAvg core when Flower is
installed and a caller explicitly wires the strategy into a Flower server.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from .aggregation import ClientDelta, FedAvgAggregator


class FlowerUnavailable(RuntimeError):
    """Flower is not installed or does not expose the expected strategy API."""


def _as_client_delta(
    arrays: Sequence[Any], num_examples: int
) -> tuple[ClientDelta, tuple[tuple[int, ...], ...]]:
    """Convert Flower tensors to flat pure-Python layers and retain their shapes."""

    layers: dict[str, tuple[float, ...]] = {}
    shapes: list[tuple[int, ...]] = []
    for index, array in enumerate(arrays):
        if not hasattr(array, "shape") or not hasattr(array, "reshape"):
            raise ValueError("Flower fit parameters must be numeric arrays")
        shapes.append(tuple(int(size) for size in array.shape))
        flattened = array.reshape(-1).tolist()
        layers[f"layer_{index}"] = tuple(float(value) for value in flattened)
    return ClientDelta(layers=layers, num_examples=num_examples), tuple(shapes)


def build_flower_delta_strategy(*, aggregator: FedAvgAggregator) -> Any:
    """Build an explicitly delta-based Flower strategy adapter.

    Clients must encode *deltas* as Flower fit parameters. The adapter averages numeric
    tensors only; it does not add DP noise, verify client declarations, authenticate
    clients, or infer whether parameters are weights versus deltas. Those responsibilities
    remain with the caller and the device protocol. Returning ``None`` for failures and
    incomplete rounds avoids claiming an FL round occurred without enough clients.
    """

    try:
        import numpy as np
        from flwr.common import ndarrays_to_parameters, parameters_to_ndarrays
        from flwr.server.strategy import FedAvg
    except (ImportError, ModuleNotFoundError) as exc:
        raise FlowerUnavailable(
            "Flower and NumPy are optional for this adapter; install requirements.txt first"
        ) from exc

    class FlowerDeltaStrategy(FedAvg):  # type: ignore[misc, no-redef]
        def __init__(self) -> None:
            super().__init__(
                min_fit_clients=aggregator.min_clients,
                min_available_clients=aggregator.min_clients,
                accept_failures=False,
            )

        def aggregate_fit(self, server_round: int, results: list[Any], failures: list[Any]) -> Any:
            if failures or len(results) < aggregator.min_clients:
                return None, {"status": "waiting_for_clients", "round": server_round}

            updates: list[ClientDelta] = []
            shapes: tuple[tuple[int, ...], ...] | None = None
            for _, fit_result in results:
                arrays = parameters_to_ndarrays(fit_result.parameters)
                update, current_shapes = _as_client_delta(arrays, fit_result.num_examples)
                if shapes is None:
                    shapes = current_shapes
                elif current_shapes != shapes:
                    raise ValueError("Flower clients submitted mismatched tensor shapes")
                updates.append(update)

            aggregate = aggregator.aggregate(updates)
            if aggregate is None or shapes is None:
                return None, {"status": "waiting_for_clients", "round": server_round}

            tensors = [
                np.asarray(aggregate.layers[f"layer_{index}"], dtype=np.float32).reshape(shape)
                for index, shape in enumerate(shapes)
            ]
            return ndarrays_to_parameters(tensors), {
                "status": "aggregated",
                "round": server_round,
                "client_count": aggregate.client_count,
                "total_examples": aggregate.total_examples,
            }

    return FlowerDeltaStrategy()
