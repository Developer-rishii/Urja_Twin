"""Unit tests for the physics twin models.

Tests required by Task T2:
1. Zero irradiance -> zero power
2. Wind power clipped at rated
3. L_soil = 0.1 -> power exactly 10% lower
4. Wind below cut-in and above cut-out -> 0
"""

import pytest
import numpy as np

from app.twin.physics import calculate_solar_power, calculate_wind_power


def test_solar_zero_irradiance():
    """Zero irradiance must result in strictly zero solar power."""
    p_zero = calculate_solar_power(irradiance=0.0, module_temp=25.0)
    assert p_zero == 0.0

    p_negative = calculate_solar_power(irradiance=-0.05, module_temp=30.0)
    assert p_negative == 0.0


def test_solar_soiling_reduction():
    """L_soil = 0.1 must produce power exactly 10 percent lower than clean baseline."""
    irradiance = 0.8  # kW/m2
    module_temp = 35.0

    clean_power = calculate_solar_power(
        irradiance=irradiance,
        module_temp=module_temp,
        l_soil=0.0,
    )
    soiled_power = calculate_solar_power(
        irradiance=irradiance,
        module_temp=module_temp,
        l_soil=0.1,
    )

    assert clean_power > 0.0
    expected_soiled = clean_power * 0.9
    assert pytest.approx(soiled_power, rel=1e-5) == expected_soiled


def test_wind_power_clipped_at_rated():
    """At high wind speeds within operational envelope, power must be capped at rated capacity."""
    p_rated = 3600.0
    # High wind speed (e.g. 18 m/s, well above rated speed of ~13 m/s)
    p_high = calculate_wind_power(wind_speed=18.0, p_rated_kw=p_rated)
    assert p_high == p_rated

    # Extreme speed within operational envelope (e.g. 24.5 m/s)
    p_extreme = calculate_wind_power(wind_speed=24.5, p_rated_kw=p_rated)
    assert p_extreme == p_rated


def test_wind_cut_in_and_cut_out():
    """Wind speed below cut-in (3 m/s) or above cut-out (25 m/s) must produce 0 kW."""
    p_rated = 3600.0

    # Below cut-in
    assert calculate_wind_power(wind_speed=2.5, p_rated_kw=p_rated, v_cut_in=3.0) == 0.0
    assert calculate_wind_power(wind_speed=0.0, p_rated_kw=p_rated, v_cut_in=3.0) == 0.0

    # Above cut-out
    assert calculate_wind_power(wind_speed=25.5, p_rated_kw=p_rated, v_cut_out=25.0) == 0.0
    assert calculate_wind_power(wind_speed=30.0, p_rated_kw=p_rated, v_cut_out=25.0) == 0.0

    # Within operational range gives positive power
    assert calculate_wind_power(wind_speed=8.0, p_rated_kw=p_rated) > 0.0


def test_vectorized_inputs():
    """Physics functions must handle numpy arrays accurately."""
    irr = np.array([0.0, 0.5, 1.0])
    temps = np.array([20.0, 25.0, 40.0])
    p_solar = calculate_solar_power(irr, temps)
    assert len(p_solar) == 3
    assert p_solar[0] == 0.0
    assert p_solar[1] > 0.0

    speeds = np.array([1.0, 7.0, 15.0, 28.0])
    p_wind = calculate_wind_power(speeds)
    assert len(p_wind) == 4
    assert p_wind[0] == 0.0
    assert p_wind[1] > 0.0
    assert p_wind[2] == 3600.0
    assert p_wind[3] == 0.0
