"""Data leakage unit test for 96-block generation forecaster.

Verifies step 9:
Modify all future power generation rows after issue_time in a copy of the dataset.
Assert that the lag and rolling features and the generated forecast remain identical
(except for the documented weather forecast proxy).
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR / "backend"))

from app.forecast.service import forecast, _get_dataset


def test_forecast_no_future_power_leakage():
    """Modifying future power_kw values after issue_time must not alter the forecast."""
    issue_time = "2020-06-10T12:00:00"
    issue_dt = pd.to_datetime(issue_time)

    # Base forecast
    fc_clean = forecast("solar_plant_1", issue_time)
    assert len(fc_clean) == 96

    # Create mutated copy where future actual power is drastically corrupted
    df_mutated = _get_dataset("solar_pv").copy()
    future_mask = df_mutated["dt"] > issue_dt

    # Corrupt future power with 999999.0
    df_mutated.loc[future_mask, "power_kw"] = 999999.0

    # Weather proxy remains intact, power_kw in the future is changed
    fc_mutated = forecast("solar_plant_1", issue_time, override_df=df_mutated)

    # Check identical forecasts across all 96 blocks
    for i in range(96):
        assert fc_clean[i]["ts"] == fc_mutated[i]["ts"]
        assert fc_clean[i]["forecast_kw"] == pytest.approx(fc_mutated[i]["forecast_kw"], abs=1e-2)


def test_forecast_wind_no_future_power_leakage():
    """Modifying wind power after issue_time must not affect wind forecast."""
    issue_time = "2018-10-15T06:00:00"
    issue_dt = pd.to_datetime(issue_time)

    fc_clean = forecast("wind_plant_1", issue_time)
    assert len(fc_clean) == 96

    df_mutated = _get_dataset("wind_turbine").copy()
    future_mask = df_mutated["dt"] > issue_dt
    df_mutated.loc[future_mask, "power_kw"] = 99999.0

    fc_mutated = forecast("wind_plant_1", issue_time, override_df=df_mutated)

    for i in range(96):
        assert fc_clean[i]["ts"] == fc_mutated[i]["ts"]
        assert fc_clean[i]["forecast_kw"] == pytest.approx(fc_mutated[i]["forecast_kw"], abs=1e-2)

