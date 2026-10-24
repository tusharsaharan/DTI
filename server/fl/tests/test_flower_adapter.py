from __future__ import annotations

from attune_fl.aggregation import FedAvgAggregator
from attune_fl.flower_adapter import FlowerUnavailable, build_flower_delta_strategy


def test_flower_adapter_has_a_bounded_optional_dependency_boundary() -> None:
    try:
        strategy = build_flower_delta_strategy(aggregator=FedAvgAggregator(min_clients=2))
    except FlowerUnavailable as exc:
        assert "optional" in str(exc)
    else:
        assert strategy.__class__.__name__ == "FlowerDeltaStrategy"
