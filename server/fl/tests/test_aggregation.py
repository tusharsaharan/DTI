from __future__ import annotations

import pytest

from attune_fl.aggregation import AggregationError, ClientDelta, FedAvgAggregator


def test_fedavg_is_weighted_and_defensively_clips_each_client() -> None:
    aggregator = FedAvgAggregator(min_clients=2, clip_norm=1.0)

    result = aggregator.aggregate(
        [
            ClientDelta(layers={"dense": (1.0, 0.0)}, num_examples=1),
            ClientDelta(layers={"dense": (0.0, 1.0)}, num_examples=3),
        ]
    )

    assert result is not None
    assert result.client_count == 2
    assert result.total_examples == 4
    assert result.layers["dense"] == pytest.approx((0.25, 0.75))
    assert result.clipped_client_count == 0


def test_large_client_delta_is_clipped_before_average() -> None:
    aggregator = FedAvgAggregator(min_clients=2, clip_norm=1.0)

    result = aggregator.aggregate(
        [
            ClientDelta(layers={"dense": (3.0, 4.0)}, num_examples=1),
            ClientDelta(layers={"dense": (0.0, 0.0)}, num_examples=1),
        ]
    )

    assert result is not None
    assert result.layers["dense"] == pytest.approx((0.3, 0.4))
    assert result.clipped_client_count == 1


def test_aggregation_waits_for_minimum_clients_and_rejects_shape_mismatch() -> None:
    aggregator = FedAvgAggregator(min_clients=2)

    assert aggregator.aggregate([ClientDelta(layers={"dense": (1.0,)}, num_examples=1)]) is None
    with pytest.raises(AggregationError, match="matching"):
        aggregator.aggregate(
            [
                ClientDelta(layers={"dense": (1.0,)}, num_examples=1),
                ClientDelta(layers={"dense": (1.0, 2.0)}, num_examples=1),
            ]
        )
