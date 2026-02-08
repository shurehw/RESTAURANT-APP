"""
Metrics — coverage scores, accuracy, efficiency calculations.
"""

from typing import Dict, List, Optional


def coverage_score(
    actual_covers: int,
    recommended_servers: int,
    covers_per_server: float = 16.0,
) -> float:
    """
    How well does the recommended staffing cover actual demand?

    Returns 1.0 if capacity >= actual, scales down linearly if under.
    """
    if recommended_servers <= 0:
        return 0.0 if actual_covers > 0 else 1.0
    capacity = recommended_servers * covers_per_server
    if capacity >= actual_covers:
        return 1.0
    return capacity / actual_covers


def accuracy_pct(actual: float, predicted: float) -> float:
    """
    Forecast accuracy as percentage.
    accuracy = (1 - |actual - predicted| / actual) * 100

    Returns 100.0 for perfect prediction, 0.0 for complete miss.
    """
    if actual == 0:
        return 100.0 if predicted == 0 else 0.0
    error = abs(actual - predicted)
    return max(0.0, (1 - error / actual) * 100)


def staffing_delta(
    actual_covers: int,
    recommended_servers: int,
    covers_per_server: float = 16.0,
) -> Dict:
    """
    Compare recommended staffing vs what was actually needed.

    Returns:
        {
            'needed_servers': int,
            'recommended_servers': int,
            'delta': int (positive = overstaffed, negative = understaffed),
            'adequate': bool,
            'status': 'adequate' | 'understaffed' | 'overstaffed',
        }
    """
    import math
    needed = math.ceil(actual_covers / covers_per_server) if actual_covers > 0 else 0
    delta = recommended_servers - needed
    if delta >= 0 and delta <= 1:
        status = "adequate"
    elif delta > 1:
        status = "overstaffed"
    else:
        status = "understaffed"

    return {
        "needed_servers": needed,
        "recommended_servers": recommended_servers,
        "delta": delta,
        "adequate": delta >= 0,
        "status": status,
    }


def compute_wasted_labor(
    hourly_results: List[Dict],
    avg_hourly_rate: float = 18.0,
) -> Dict:
    """
    Compute wasted labor hours and cost from backtest hourly results.

    Each entry should have: {recommended_servers, needed_servers, delta}
    """
    wasted_hours = 0.0
    understaffed_hours = 0.0

    for entry in hourly_results:
        delta = entry.get("delta", 0)
        if delta > 0:
            wasted_hours += delta
        elif delta < 0:
            understaffed_hours += abs(delta)

    return {
        "wasted_labor_hours": wasted_hours,
        "wasted_labor_cost": wasted_hours * avg_hourly_rate,
        "understaffed_labor_hours": understaffed_hours,
    }


def overall_backtest_metrics(hourly_results: List[Dict]) -> Dict:
    """
    Aggregate backtest metrics across all hours.

    Returns:
        {
            'hours_analyzed': int,
            'hours_adequate': int,
            'hours_understaffed': int,
            'hours_overstaffed': int,
            'coverage_pct': float,
            'avg_accuracy_pct': float,
        }
    """
    total = len(hourly_results)
    if total == 0:
        return {
            "hours_analyzed": 0,
            "hours_adequate": 0,
            "hours_understaffed": 0,
            "hours_overstaffed": 0,
            "coverage_pct": 0.0,
            "avg_accuracy_pct": 0.0,
        }

    adequate = sum(1 for r in hourly_results if r.get("adequate", False))
    understaffed = sum(1 for r in hourly_results if r.get("status") == "understaffed")
    overstaffed = sum(1 for r in hourly_results if r.get("status") == "overstaffed")

    accuracies = []
    for r in hourly_results:
        actual = r.get("actual_covers", 0)
        rec_servers = r.get("recommended_servers", 0)
        if actual > 0:
            # Accuracy of the staffing recommendation
            needed = r.get("needed_servers", 0)
            if needed > 0:
                accuracies.append(accuracy_pct(needed, rec_servers))

    avg_acc = sum(accuracies) / len(accuracies) if accuracies else 0.0

    return {
        "hours_analyzed": total,
        "hours_adequate": adequate,
        "hours_understaffed": understaffed,
        "hours_overstaffed": overstaffed,
        "coverage_pct": round(adequate / total * 100, 1),
        "avg_accuracy_pct": round(avg_acc, 1),
    }
