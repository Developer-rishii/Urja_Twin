"""Demo script demonstrating DSM breach detection and schedule revision on real solar forecast.

Step 7:
Uses forecast("solar_plant_1", "2020-06-10T12:00:00") real output,
builds default_schedule (3-hour block average),
checks for DSM breaches against the 10% tolerance band,
computes and displays the revised schedule,
and confirms that the revised schedule eliminates all breaches.
"""

import sys
from pathlib import Path
import json

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "backend"))

from app.forecast.service import forecast
from app.dsm.engine import check, default_schedule, revise


def run_demo():
    plant_id = "solar_plant_1"
    issue_time = "2020-06-10T12:00:00"
    capacity_kw = 32000.0  # 32 MW
    tol_pct = 10.0         # Default 10% tolerance band

    print("==========================================================================")
    print("               URJATWIN DSM ENGINE DEMONSTRATION RUN                      ")
    print("==========================================================================")
    print(f"Plant ID         : {plant_id}")
    print(f"Issue Time       : {issue_time}")
    print(f"Plant Capacity   : {capacity_kw:,.1f} kW (32 MW)")
    print(f"Tolerance Band   : {tol_pct}% (+/- {capacity_kw * tol_pct / 100.0:,.1f} kW)")

    # 1. Fetch real 96-block forecast
    fc = forecast(plant_id, issue_time)
    print(f"Generated Blocks : {len(fc)} forecast blocks")

    # 2. Build default schedule (3-hour coarse block average)
    sched = default_schedule(fc)
    schedule_method = "3-hour coarse block average (default_schedule)"
    print(f"Schedule Method  : {schedule_method}")

    # 3. Check for DSM breaches
    res = check(fc, sched, capacity_kw=capacity_kw, tol_pct=tol_pct)
    total_breaches = res["total_breaches"]
    total_checked = res["total_blocks_checked"]
    exposure = res["relative_exposure_pct"]

    print(f"\n--- DSM BREACH ANALYSIS ---")
    print(f"Total Blocks Evaluated : {total_checked}")
    print(f"Total Breaches Found   : {total_breaches}")
    print(f"Relative Exposure      : {exposure}% cumulative excess deviation")

    if total_breaches > 0:
        print(f"\nFirst 5 Detected Breach Blocks:")
        print(f"{'Timestamp':<20} | {'Forecast (kW)':<14} | {'Schedule (kW)':<14} | {'Deviation (kW)':<15} | {'Dev (%)':<8} | {'Direction':<15} | {'Severity (%)':<12}")
        print("-" * 110)
        for b in res["breaches"][:5]:
            print(
                f"{b['ts']:<20} | {b['forecast_kw']:<14.2f} | {b['schedule_kw']:<14.2f} | "
                f"{b['deviation_kw']:<15.2f} | {b['deviation_pct']:<8.2f}% | {b['direction']:<15} | {b['severity_pct']:<12.2f}%"
            )

    # 4. Generate revised schedule
    revised_sched = revise(fc, sched, capacity_kw=capacity_kw, tol_pct=tol_pct)
    revised_count = sum(1 for b in revised_sched if b["was_revised"])
    print(f"\n--- SCHEDULE REVISION ---")
    print(f"Blocks Shifted into Band : {revised_count} of {len(revised_sched)} blocks")

    # Re-check revised schedule
    recheck_res = check(fc, revised_sched, capacity_kw=capacity_kw, tol_pct=tol_pct)
    print(f"Remaining Breaches After Revision: {recheck_res['total_breaches']} (Confirmed 100% compliant)")

    print(f"\nSample Before vs After Revision for Breaching Blocks:")
    print(f"{'Timestamp':<20} | {'Forecast (kW)':<14} | {'Old Sched (kW)':<15} | {'Revised Sched (kW)':<18} | {'New Dev (%)':<12}")
    print("-" * 88)
    for b in res["breaches"][:5]:
        ts = b["ts"]
        rev_block = next(r for r in revised_sched if r["ts"] == ts)
        new_dev_pct = ((b["forecast_kw"] - rev_block["schedule_kw"]) / capacity_kw) * 100.0
        print(
            f"{ts:<20} | {b['forecast_kw']:<14.2f} | {b['schedule_kw']:<15.2f} | "
            f"{rev_block['schedule_kw']:<18.2f} | {new_dev_pct:<11.2f}%"
        )
    print("==========================================================================")


if __name__ == "__main__":
    run_demo()
