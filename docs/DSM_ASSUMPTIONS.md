# DSM (Deviation Settlement Mechanism) Assumptions & Documentation

## 1. Regulatory Context & Tolerance Band
- **Regulation Framework:** Indian Central Electricity Regulatory Commission (CERC) Deviation Settlement Mechanism and Related Matters Regulations.
- **Configurable Tolerance Band:** Defined by `DSM_TOLERANCE_PCT` in environment configuration (default value: **10%** of available capacity).
- **Caveat:** The default tolerance of 10% is an operational benchmark for demo purposes and has not yet been formally verified against the latest post-2023 CERC amendments for specific regional grid codes. Hence, it is never hardcoded.

## 2. Deviation Calculation
For each 15-minute time block $t$:
$$\text{deviation\_pct} = \frac{\text{forecast\_kw} - \text{schedule\_kw}}{\text{capacity\_kw}} \times 100$$
A DSM breach occurs when:
$$|\text{deviation\_pct}| > \text{DSM\_TOLERANCE\_PCT}$$

## 3. Financial Exposure vs Rupee Penalty
- Because real-time DSM penalty matrices depend on variable Area Clearing Prices (ACP), system frequency bands (50.05 Hz – 49.90 Hz), and dynamic ancillary charge vectors that require market settlement data feeds, **no rupee penalty is fabricated or hardcoded**.
- Instead, the engine outputs:
  - **Breach Block Count:** Number of 15-minute blocks breaching the tolerance band.
  - **Relative Exposure (%):** Cumulative sum of percentage deviations exceeding the tolerance threshold ($\sum |\text{deviation\_pct}| - \text{tol\_pct}$).

## 4. Default Schedule Generation (3-Hour Block Average)
- In competitive wholesale electricity scheduling, renewable generators submit day-ahead schedules that follow aggregated hourly or multi-hour profiles rather than volatile instantaneous fluctuations.
- To simulate this reality and provide realistic deviation events for demonstration without requiring manual schedule uploads, `default_schedule()` computes a **3-hour (12-block) rolling block average** of the forecasted generation.
- This creates realistic ramp deviations during morning ramp-up, midday peak, and evening ramp-down, clearly demonstrating both breach detection and automated schedule revision.

## 5. Automated Schedule Revision Logic
- Under grid code provisions, renewable generators can revise schedules within permissible gate-closure windows.
- The `revise()` algorithm calculates the minimum adjustment required:
  $$\text{revised\_schedule} = \begin{cases}
  \text{forecast} - \text{tol\_kw}, & \text{if } \text{forecast} - \text{schedule} > \text{tol\_kw} \\
  \text{forecast} + \text{tol\_kw}, & \text{if } \text{schedule} - \text{forecast} > \text{tol\_kw} \\
  \text{schedule}, & \text{otherwise}
  \end{cases}$$
- This brings all blocks strictly within tolerance while minimizing unnecessary schedule churn.
