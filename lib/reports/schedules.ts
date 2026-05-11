export type ReportScheduleFrequency = "daily" | "weekly" | "monthly";
export type ReportScheduleFormat = "pdf" | "xlsx";
export type ReportScheduleRunStatus = "sent" | "skipped" | "failed";

export interface ReportScheduleRow {
  id: string;
  user_id: string;
  dashboard_id: string;
  frequency: ReportScheduleFrequency;
  time_of_day: string;
  timezone: string;
  day_of_week?: number | null;
  day_of_month?: number | null;
  format: ReportScheduleFormat;
  recipients: string[];
  active: boolean;
  last_sent_at?: string | null;
  last_attempt_at?: string | null;
  next_send_at?: string | null;
  processing_at?: string | null;
  failure_count: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportSchedule {
  id: string;
  userId: string;
  dashboardId: string;
  frequency: ReportScheduleFrequency;
  timeOfDay: string;
  timezone: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  format: ReportScheduleFormat;
  recipients: string[];
  active: boolean;
  lastSentAt?: string | null;
  lastAttemptAt?: string | null;
  nextSendAt?: string | null;
  failureCount: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuildScheduleInput {
  frequency?: unknown;
  timeOfDay?: unknown;
  timezone?: unknown;
  dayOfWeek?: unknown;
  dayOfMonth?: unknown;
  format?: unknown;
  recipients?: unknown;
  active?: unknown;
}

export interface BuiltSchedule {
  data?: {
    frequency: ReportScheduleFrequency;
    time_of_day: string;
    timezone: string;
    day_of_week: number | null;
    day_of_month: number | null;
    format: ReportScheduleFormat;
    recipients: string[];
    active: boolean;
    next_send_at: string;
    last_error: null;
    processing_at: null;
  };
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function dbToReportSchedule(row: ReportScheduleRow): ReportSchedule {
  return {
    id: row.id,
    userId: row.user_id,
    dashboardId: row.dashboard_id,
    frequency: row.frequency,
    timeOfDay: row.time_of_day,
    timezone: row.timezone,
    dayOfWeek: row.day_of_week,
    dayOfMonth: row.day_of_month,
    format: row.format,
    recipients: row.recipients ?? [],
    active: row.active,
    lastSentAt: row.last_sent_at,
    lastAttemptAt: row.last_attempt_at,
    nextSendAt: row.next_send_at,
    failureCount: row.failure_count,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeRecipients(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : String(value ?? "")
      .split(/[,\n]/)
      .map((item) => item.trim());

  return Array.from(new Set(
    items
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0)
  ));
}

export function validateRecipients(recipients: string[]): string | undefined {
  const invalid = recipients.find((recipient) => !EMAIL_RE.test(recipient));
  return invalid ? `Invalid recipient email: ${invalid}` : undefined;
}

export function buildScheduleInput(body: BuildScheduleInput, now = new Date()): BuiltSchedule {
  const frequency = body.frequency;
  if (frequency !== "daily" && frequency !== "weekly" && frequency !== "monthly") {
    return { error: "Frequency must be daily, weekly, or monthly" };
  }

  const timeOfDay = typeof body.timeOfDay === "string" ? body.timeOfDay.trim() : "09:00";
  if (!TIME_RE.test(timeOfDay)) {
    return { error: "Time of day must use HH:mm format" };
  }

  const timezone = typeof body.timezone === "string" && body.timezone.trim()
    ? body.timezone.trim()
    : "UTC";
  if (!isValidTimeZone(timezone)) {
    return { error: "Timezone must be a valid IANA timezone" };
  }

  const format = body.format === "xlsx" ? "xlsx" : "pdf";
  const recipients = normalizeRecipients(body.recipients);
  const recipientError = validateRecipients(recipients);
  if (recipientError) return { error: recipientError };

  const dayOfWeek = frequency === "weekly"
    ? clampInteger(body.dayOfWeek, 1, 0, 6)
    : null;
  const dayOfMonth = frequency === "monthly"
    ? clampInteger(body.dayOfMonth, 1, 1, 28)
    : null;

  const nextSendAt = calculateNextSendAt({
    frequency,
    timeOfDay,
    timezone,
    dayOfWeek,
    dayOfMonth,
    from: now,
  });

  return {
    data: {
      frequency,
      time_of_day: timeOfDay,
      timezone,
      day_of_week: dayOfWeek,
      day_of_month: dayOfMonth,
      format,
      recipients,
      active: body.active !== false,
      next_send_at: nextSendAt.toISOString(),
      last_error: null,
      processing_at: null,
    },
  };
}

export function calculateNextSendAt({
  frequency,
  timeOfDay,
  timezone,
  dayOfWeek,
  dayOfMonth,
  from = new Date(),
}: {
  frequency: ReportScheduleFrequency;
  timeOfDay: string;
  timezone: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  from?: Date;
}): Date {
  const [hour, minute] = timeOfDay.split(":").map(Number);
  const parts = getZonedParts(from, timezone);
  let year = parts.year;
  let month = parts.month;
  let day = parts.day;

  if (frequency === "weekly") {
    const targetDow = typeof dayOfWeek === "number" ? dayOfWeek : 1;
    let delta = (targetDow - parts.weekday + 7) % 7;
    const todayTarget = zonedLocalToUtc(year, month, day, hour, minute, timezone);
    if (delta === 0 && todayTarget <= from) delta = 7;
    ({ year, month, day } = addDaysToLocalDate(year, month, day, delta));
  } else if (frequency === "monthly") {
    day = Math.min(typeof dayOfMonth === "number" ? dayOfMonth : 1, 28);
    let target = zonedLocalToUtc(year, month, day, hour, minute, timezone);
    if (target <= from) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
      target = zonedLocalToUtc(year, month, day, hour, minute, timezone);
    }
    return target;
  } else {
    const todayTarget = zonedLocalToUtc(year, month, day, hour, minute, timezone);
    if (todayTarget <= from) {
      ({ year, month, day } = addDaysToLocalDate(year, month, day, 1));
    }
  }

  return zonedLocalToUtc(year, month, day, hour, minute, timezone);
}

export function formatScheduleSubject(frequency: ReportScheduleFrequency, dashboardTitle: string, date = new Date()): string {
  const label = frequency.charAt(0).toUpperCase() + frequency.slice(1);
  return `[${label}] ${dashboardTitle} - ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getZonedParts(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(record.year),
    month: Number(record.month),
    day: Number(record.day),
    weekday: weekdayMap[record.weekday] ?? 0,
  };
}

function getTimeZoneOffsetMs(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(record.year),
    Number(record.month) - 1,
    Number(record.day),
    Number(record.hour),
    Number(record.minute),
    Number(record.second)
  );
  return asUtc - date.getTime();
}

function zonedLocalToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 2; i += 1) {
    utc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - getTimeZoneOffsetMs(utc, timezone));
  }
  return utc;
}

function addDaysToLocalDate(year: number, month: number, day: number, days: number): {
  year: number;
  month: number;
  day: number;
} {
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}
