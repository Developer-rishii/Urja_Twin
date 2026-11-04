/**
 * UrjaTwin REST API Client.
 *
 * Types and client functions corresponding to all UrjaTwin Backend Endpoints:
 * - GET /plants
 * - GET /plants/{id}/state
 * - GET /plants/{id}/forecast
 * - GET /plants/{id}/actual
 * - GET /plants/{id}/schedule
 * - GET /plants/{id}/dsm
 * - GET /plants/{id}/accuracy
 * - GET /plants/{id}/alerts
 * - POST /plants/{id}/simulate
 */

import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface PlantSummary {
  plant_id: string;
  plant_type: "solar_pv" | "wind_turbine";
  location: string;
  capacity_kw: number;
  dsm_tolerance_pct: number;
  latitude?: number;
  longitude?: number;
  zoom?: number;
  location_label?: string;
  location_basis?: string;
}

export interface PlantListResponse {
  source: string;
  count: number;
  plants: PlantSummary[];
}

export interface PlantStateResponse {
  source: string;
  plant_id: string;
  plant_type: string;
  capacity_kw: number;
  last_ts: string | null;
  expected_kw: number;
  actual_kw: number;
  gap_pct: number;
  soiling_loss_pct: number;
  node_status: "online" | "offline";
  message: string;
}

export interface ForecastBlock {
  ts: string;
  forecast_kw: number;
  weather?: {
    irradiance?: number;
    module_temp?: number;
    ambient_temp?: number;
    wind_speed?: number;
  };
}

export interface ForecastResponse {
  source: string;
  plant_id: string;
  issue_time: string;
  horizon_blocks: number;
  forecast: ForecastBlock[];
  message: string;
}

export interface ActualBlock {
  ts: string;
  power_kw: number;
  irradiance?: number;
  module_temp?: number;
  wind_speed?: number;
}

export interface ActualResponse {
  source: string;
  plant_id: string;
  count: number;
  actual: ActualBlock[];
  message: string;
}

export interface ScheduleBlock {
  ts: string;
  schedule_kw: number;
}

export interface ScheduleResponse {
  source: string;
  plant_id: string;
  horizon_blocks: number;
  schedule: ScheduleBlock[];
  message: string;
}

export interface DSMBreach {
  ts: string;
  forecast_kw: number;
  schedule_kw: number;
  deviation_kw: number;
  deviation_pct: number;
  severity_pct: number;
}

export interface DSMResponse {
  source: string;
  plant_id: string;
  tolerance_pct: number;
  capacity_kw: number;
  total_breaches: number;
  relative_exposure_pct: number;
  breach_blocks: DSMBreach[];
  revised_schedule: ScheduleBlock[];
  message: string;
}

export interface AccuracyResponse {
  source: string;
  accuracy: {
    plant_id: string;
    plant_type: string;
    capacity_kw: number;
    split_date: string;
    selected_model: string;
    test_metrics: Record<string, number>;
    horizon_buckets: Array<{
      bucket: string;
      hours: string;
      model_mae_kw: number;
      no_weather_mae_kw: number;
    }>;
    caveat: string;
  };
  message: string;
}

export interface AlertItem {
  plant_id: string;
  type: "dsm_breach" | "soiling" | "node_offline";
  ts: string;
  message: string;
  severity: "low" | "medium" | "high";
  [key: string]: any;
}

export interface AlertsResponse {
  source: string;
  plant_id: string;
  count: number;
  alerts: AlertItem[];
  message: string;
}

export interface SimulationSeriesItem {
  ts: string;
  schedule_kw: number;
  before_kw: number;
  after_kw: number;
  battery_dispatch_kw?: number;
  battery_soc_mwh?: number;
}

export interface SimulationResult {
  scenario: string;
  plant_id: string;
  assumptions: string[];
  params: Record<string, any>;
  before: {
    total_kwh: number;
    breach_count: number;
    relative_exposure_pct: number;
  };
  after: {
    total_kwh: number;
    breach_count: number;
    relative_exposure_pct: number;
  };
  impact: {
    gain_kwh?: number;
    gain_pct?: number;
    loss_kwh?: number;
    breaches_eliminated?: number;
    breaches_added?: number;
    exposure_reduction_pct?: number;
    final_soc_mwh?: number;
  };
  summary: string;
  series: SimulationSeriesItem[];
}

export interface SimulationResponse {
  source: string;
  simulation: SimulationResult;
  message: string;
}

// API functions
export async function getPlants(): Promise<PlantListResponse> {
  const res = await apiClient.get<PlantListResponse>("/plants");
  return res.data;
}

export async function getPlantState(plantId: string): Promise<PlantStateResponse> {
  const res = await apiClient.get<PlantStateResponse>(`/plants/${plantId}/state`);
  return res.data;
}

export async function getPlantForecast(plantId: string, issueTime?: string): Promise<ForecastResponse> {
  const res = await apiClient.get<ForecastResponse>(`/plants/${plantId}/forecast`, {
    params: issueTime ? { issue_time: issueTime } : {},
  });
  return res.data;
}

export async function getPlantActual(plantId: string, limit: number = 96): Promise<ActualResponse> {
  const res = await apiClient.get<ActualResponse>(`/plants/${plantId}/actual`, {
    params: { limit },
  });
  return res.data;
}

export async function getPlantSchedule(plantId: string, issueTime?: string): Promise<ScheduleResponse> {
  const res = await apiClient.get<ScheduleResponse>(`/plants/${plantId}/schedule`, {
    params: issueTime ? { issue_time: issueTime } : {},
  });
  return res.data;
}

export async function getPlantDSM(plantId: string, issueTime?: string): Promise<DSMResponse> {
  const res = await apiClient.get<DSMResponse>(`/plants/${plantId}/dsm`, {
    params: issueTime ? { issue_time: issueTime } : {},
  });
  return res.data;
}

export async function getPlantAccuracy(plantId: string): Promise<AccuracyResponse> {
  const res = await apiClient.get<AccuracyResponse>(`/plants/${plantId}/accuracy`);
  return res.data;
}

export async function getPlantAlerts(plantId: string, limit: number = 50): Promise<AlertsResponse> {
  const res = await apiClient.get<AlertsResponse>(`/plants/${plantId}/alerts`, {
    params: { limit },
  });
  return res.data;
}

export async function simulateScenario(
  plantId: string,
  scenario: string,
  params: Record<string, any> = {},
  issueTime?: string
): Promise<SimulationResponse> {
  const res = await apiClient.post<SimulationResponse>(`/plants/${plantId}/simulate`, {
    scenario,
    params,
    issue_time: issueTime,
  });
  return res.data;
}
