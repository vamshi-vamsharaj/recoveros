import type {
  ApiErrorBody,
  DashboardResponse,
  RecoveryCaseDetailResponse,
  RecoveryCasesResponse,
  RecoveryCaseStatus,
  RecoveryCaseSourceType,
} from "@/types";
import type {
  GetBatchEvaluationResponse,
  ListBatchEvaluationsResponse,
  RunBatchEvaluationResponse,
} from "@/types/batch-evaluation";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      "Could not reach the RecoverOS API. Is the API server running?",
      0
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON response body; body stays null and the status check below handles it.
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? (body as ApiErrorBody).error
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return body as T;
}

export interface CaseFilters {
  status?: RecoveryCaseStatus;
  sourceType?: RecoveryCaseSourceType;
  q?: string;
}

export const api = {
  getDashboard: () => request<DashboardResponse>("/api/dashboard"),

  getCases: (filters: CaseFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.sourceType) params.set("sourceType", filters.sourceType);
    if (filters.q) params.set("q", filters.q);
    const qs = params.toString();
    return request<RecoveryCasesResponse>(`/api/recovery/cases${qs ? `?${qs}` : ""}`);
  },

  getCase: (id: string) =>
    request<RecoveryCaseDetailResponse>(`/api/recovery/cases/${id}`),

  approveCase: (id: string) =>
    request<{ success: true; recoveryCaseId: string; status: string }>(
      `/api/recovery/cases/${id}/approve`,
      { method: "POST" }
    ),

  rejectCase: (id: string, reason?: string) =>
    request<{ success: true; recoveryCaseId: string; status: string }>(
      `/api/recovery/cases/${id}/reject`,
      { method: "POST", body: JSON.stringify({ reason }) }
    ),

  runBatchEvaluation: () =>
    request<RunBatchEvaluationResponse>("/api/batch-evaluation/run", { method: "POST" }),

  getBatchEvaluations: () =>
    request<ListBatchEvaluationsResponse>("/api/batch-evaluation"),

  getBatchEvaluation: (id: string) =>
    request<GetBatchEvaluationResponse>(`/api/batch-evaluation/${id}`),
};
