"""Physics twin calculation engine for UrjaTwin.

Implements standard physics models:
1. Solar PV:
   P_pv = P_stc * (G / 1000) * [1 + gamma * (T_cell - 25)] * (1 - L_soil) * PR
   where:
     - G is plane-of-array irradiance in W/m2 (or converted from kW/m2)
     - P_stc is rated STC capacity in kW
     - gamma is cell temperature power coefficient (/degC, default -0.004)
     - T_cell is module temperature in degC
     - L_soil is fractional soiling loss in [0, 1]
     - PR is performance ratio

2. Wind Turbine:
   v_hub = v_s * (h_hub / h_s)**alpha
   P_wind = min(P_rated, 0.5 * rho * A * Cp * v_hub**3 / 1000) if v_cut_in <= v_hub <= v_cut_out else 0
   where:
     - v_hub, v_s are wind speeds in m/s
     - rho is air density in kg/m3 (standard assumption: 1.225 kg/m3)
     - A is rotor swept area in m2
     - Cp is aerodynamic power coefficient
     - P_rated is generator rated capacity in kW
"""

from typing import Union
import numpy as np


def calculate_solar_power(
    irradiance: Union[float, np.ndarray],
    module_temp: Union[float, np.ndarray],
    p_stc_kw: float = 32000.0,
    gamma: float = -0.004,
    pr: float = 0.9916,
    l_soil: float = 0.0,
    irradiance_is_kw_m2: bool = True,
) -> Union[float, np.ndarray]:
    """Calculate expected solar PV output in kW.

    Args:
        irradiance: Solar irradiation. If irradiance_is_kw_m2=True, values are in kW/m2
                    (Kaggle dataset peak ~1.22 kW/m2), converted to W/m2 internally.
        module_temp: Module surface temperature in degC.
        p_stc_kw: Rated STC power in kW.
        gamma: Temperature coefficient (/degC). Typical value: -0.004 for c-Si.
        pr: Plant performance ratio.
        l_soil: Fractional soiling loss in [0.0, 1.0].
        irradiance_is_kw_m2: If True, multiply by 1000 to get W/m2.

    Returns:
        Expected power in kW (>= 0.0).
    """
    is_scalar = np.isscalar(irradiance)
    g = np.asarray(irradiance, dtype=float)
    t = np.asarray(module_temp, dtype=float)

    # Convert to W/m2 if needed
    g_wm2 = g * 1000.0 if irradiance_is_kw_m2 else g

    # Standard PV equation:
    # P_pv = P_stc * (G / 1000) * [1 + gamma * (T_cell - 25)] * (1 - L_soil) * PR
    # Note: G / 1000 where G is in W/m2
    temp_factor = 1.0 + gamma * (t - 25.0)
    soiling_factor = 1.0 - float(l_soil)
    soiling_factor = max(0.0, min(1.0, soiling_factor))

    p = p_stc_kw * (g_wm2 / 1000.0) * temp_factor * soiling_factor * pr

    # Zero irradiance or negative irradiance gives strictly zero power
    p = np.where(g_wm2 <= 0.0, 0.0, p)
    p = np.clip(p, 0.0, None)

    return float(p) if is_scalar else p


def calculate_wind_power(
    wind_speed: Union[float, np.ndarray],
    p_rated_kw: float = 3600.0,
    rotor_area_m2: float = 10207.03,
    cp: float = 0.3313,
    rho: float = 1.225,
    v_cut_in: float = 3.0,
    v_cut_out: float = 25.0,
    sensor_height_m: float = 90.0,
    hub_height_m: float = 90.0,
    alpha: float = 0.14,
) -> Union[float, np.ndarray]:
    """Calculate expected wind turbine output in kW.

    Args:
        wind_speed: Wind speed at sensor height in m/s.
        p_rated_kw: Generator rated power capacity in kW.
        rotor_area_m2: Rotor swept area in m2 (pi * R^2).
        cp: Aerodynamic power coefficient.
        rho: Air density in kg/m3 (default 1.225 kg/m3 assumption).
        v_cut_in: Cut-in wind speed in m/s.
        v_cut_out: Cut-out wind speed in m/s.
        sensor_height_m: Height of anemometer (default 90m = hub height).
        hub_height_m: Turbine hub height in m.
        alpha: Wind shear power-law exponent.

    Returns:
        Expected power in kW (>= 0.0 and <= p_rated_kw).
    """
    is_scalar = np.isscalar(wind_speed)
    v_s = np.asarray(wind_speed, dtype=float)

    # Wind shear adjustment
    if sensor_height_m > 0 and hub_height_m > 0 and sensor_height_m != hub_height_m:
        v_hub = v_s * ((hub_height_m / sensor_height_m) ** alpha)
    else:
        # Standard assumption when anemometer is mounted on nacelle/hub
        v_hub = v_s

    # Theoretical aerodynamic power in Watts: 0.5 * rho * A * Cp * (v^3)
    # Convert to kW by dividing by 1000.0
    p_mech_kw = 0.5 * rho * rotor_area_m2 * cp * (v_hub ** 3) / 1000.0

    # Clip to generator rated capacity
    p_clipped = np.clip(p_mech_kw, 0.0, p_rated_kw)

    # Operational cut-in and cut-out envelope
    in_envelope = (v_hub >= v_cut_in) & (v_hub <= v_cut_out)
    p_final = np.where(in_envelope, p_clipped, 0.0)

    return float(p_final) if is_scalar else p_final
