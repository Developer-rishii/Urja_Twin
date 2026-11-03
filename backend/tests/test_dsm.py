"""Unit tests for the DSM engine.

Test requirements:
1. No breach (schedule matches forecast or within tolerance).
2. Exactly one breach (detected with correct direction and severity).
3. Missing data skipped (NaN or None values ignored cleanly).
4. Revised schedule produces zero breaches when re-checked.
"""

import numpy as np
import pytest

from app.dsm.engine import check, revise, default_schedule


def test_dsm_no_breach():
    """When deviation is within tolerance, total_breaches must be zero."""
    capacity = 1000.0  # kW
    tol = 10.0  # 10% = 100 kW

    forecast = [
        {"ts": "2026-01-01T00:00:00", "forecast_kw": 500.0},
        {"ts": "2026-01-01T00:15:00", "forecast_kw": 550.0},
    ]
    # Schedule deviates by +50 kW and -80 kW (both <= 100 kW)
    schedule = [
        {"ts": "2026-01-01T00:00:00", "schedule_kw": 450.0},
        {"ts": "2026-01-01T00:15:00", "schedule_kw": 630.0},
    ]

    res = check(forecast, schedule, capacity, tol_pct=tol)
    assert res["total_breaches"] == 0
    assert res["total_blocks_checked"] == 2
    assert res["relative_exposure_pct"] == 0.0
    assert len(res["breaches"]) == 0


def test_dsm_one_breach():
    """Detect exactly one breach and compute severity accurately."""
    capacity = 1000.0  # kW
    tol = 10.0  # 10% = 100 kW

    forecast = [
        {"ts": "2026-01-01T00:00:00", "forecast_kw": 500.0},
        {"ts": "2026-01-01T00:15:00", "forecast_kw": 800.0},  # Dev = 800 - 650 = 150 kW (15% > 10%)
    ]
    schedule = [
        {"ts": "2026-01-01T00:00:00", "schedule_kw": 520.0},
        {"ts": "2026-01-01T00:15:00", "schedule_kw": 650.0},
    ]

    res = check(forecast, schedule, capacity, tol_pct=tol)
    assert res["total_breaches"] == 1
    assert res["total_blocks_checked"] == 2

    breach = res["breaches"][0]
    assert breach["ts"] == "2026-01-01T00:15:00"
    assert breach["deviation_pct"] == 15.0
    assert breach["severity_pct"] == 5.0
    assert breach["direction"] == "over_injection"
    assert res["relative_exposure_pct"] == 5.0


def test_dsm_missing_data_skipped():
    """Blocks with None, NaN, or missing entries must be skipped without errors."""
    capacity = 1000.0
    tol = 10.0

    forecast = [
        {"ts": "2026-01-01T00:00:00", "forecast_kw": 500.0},
        {"ts": "2026-01-01T00:15:00", "forecast_kw": None},
        {"ts": "2026-01-01T00:30:00", "forecast_kw": float("nan")},
        {"ts": "2026-01-01T00:45:00", "forecast_kw": 700.0},
    ]
    schedule = [
        {"ts": "2026-01-01T00:00:00", "schedule_kw": 510.0},
        {"ts": "2026-01-01T00:15:00", "schedule_kw": 500.0},
        {"ts": "2026-01-01T00:30:00", "schedule_kw": 500.0},
        {"ts": "2026-01-01T00:45:00", "schedule_kw": None},  # Missing schedule
    ]

    res = check(forecast, schedule, capacity, tol_pct=tol)
    # Only 00:00:00 is valid
    assert res["total_blocks_checked"] == 1
    assert res["total_breaches"] == 0


def test_dsm_revised_schedule_zero_breaches():
    """Revising a breaching schedule must result in exactly 0 breaches when re-checked."""
    capacity = 1000.0
    tol = 10.0  # 100 kW

    forecast = [
        {"ts": "2026-01-01T00:00:00", "forecast_kw": 800.0},  # dev = +300 kW (30%)
        {"ts": "2026-01-01T00:15:00", "forecast_kw": 200.0},  # dev = -300 kW (-30%)
        {"ts": "2026-01-01T00:30:00", "forecast_kw": 500.0},  # dev = 0 (0%)
    ]
    schedule = [
        {"ts": "2026-01-01T00:00:00", "schedule_kw": 500.0},
        {"ts": "2026-01-01T00:15:00", "schedule_kw": 500.0},
        {"ts": "2026-01-01T00:30:00", "schedule_kw": 500.0},
    ]

    initial_check = check(forecast, schedule, capacity, tol_pct=tol)
    assert initial_check["total_breaches"] == 2

    # Run revision
    revised_sched = revise(forecast, schedule, capacity, tol_pct=tol)
    assert len(revised_sched) == 3

    # Revised values:
    # 00:00:00 forecast 800, max dev 100 -> new sched = 700.0
    # 00:15:00 forecast 200, max dev 100 -> new sched = 300.0
    # 00:30:00 unchanged = 500.0
    assert revised_sched[0]["schedule_kw"] == 700.0
    assert revised_sched[0]["was_revised"] is True
    assert revised_sched[1]["schedule_kw"] == 300.0
    assert revised_sched[1]["was_revised"] is True
    assert revised_sched[2]["schedule_kw"] == 500.0
    assert revised_sched[2]["was_revised"] is False

    # Re-check revised schedule
    revised_check = check(forecast, revised_sched, capacity, tol_pct=tol)
    assert revised_check["total_breaches"] == 0
    assert revised_check["relative_exposure_pct"] == 0.0
