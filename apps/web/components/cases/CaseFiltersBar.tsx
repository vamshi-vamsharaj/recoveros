"use client";

import type { RecoveryCaseSourceType, RecoveryCaseStatus } from "@/types";
import { SOURCE_TYPE_LABEL, STATUS_LABEL } from "@/lib/format";

const STATUS_OPTIONS: RecoveryCaseStatus[] = [
  "DETECTED",
  "RECOMMENDED",
  "PENDING_APPROVAL",
  "APPROVED",
  "EXECUTING",
  "RECOVERED",
  "BLOCKED",
  "REJECTED",
  "FAILED",
];

const SOURCE_OPTIONS: RecoveryCaseSourceType[] = ["PAYMENT", "CHECKOUT_SESSION", "SUBSCRIPTION"];

interface CaseFiltersBarProps {
  status: RecoveryCaseStatus | "ALL";
  sourceType: RecoveryCaseSourceType | "ALL";
  search: string;
  onStatusChange: (status: RecoveryCaseStatus | "ALL") => void;
  onSourceTypeChange: (sourceType: RecoveryCaseSourceType | "ALL") => void;
  onSearchChange: (search: string) => void;
}

export function CaseFiltersBar({
  status,
  sourceType,
  search,
  onStatusChange,
  onSourceTypeChange,
  onSearchChange,
}: CaseFiltersBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value as RecoveryCaseStatus | "ALL")}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
        >
          <option value="ALL">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={sourceType}
          onChange={(e) => onSourceTypeChange(e.target.value as RecoveryCaseSourceType | "ALL")}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
        >
          <option value="ALL">All workflows</option>
          {SOURCE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {SOURCE_TYPE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search case, customer, or email"
        className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-muted sm:w-64"
      />
    </div>
  );
}
