"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { ReportScheduleFormat, ReportScheduleFrequency } from "@/lib/reports/schedules";

interface ScheduleResponse {
  schedule: {
    frequency: ReportScheduleFrequency;
    timeOfDay: string;
    timezone: string;
    dayOfWeek?: number | null;
    dayOfMonth?: number | null;
    format: ReportScheduleFormat;
    recipients: string[];
    active: boolean;
    nextSendAt?: string | null;
  } | null;
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function ScheduleModal({
  dashboardId,
  open,
  onOpenChange,
}: {
  dashboardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [hasSchedule, setHasSchedule] = useState(false);
  const [frequency, setFrequency] = useState<ReportScheduleFrequency>("daily");
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [timezone, setTimezone] = useState("UTC");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [format, setFormat] = useState<ReportScheduleFormat>("pdf");
  const [recipients, setRecipients] = useState("");
  const [nextSendAt, setNextSendAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setLoading(true);
    fetch(`/api/dashboards/${dashboardId}/schedule`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Could not load schedule");
        return body as ScheduleResponse;
      })
      .then(({ schedule }) => {
        setHasSchedule(Boolean(schedule));
        if (!schedule) return;
        setFrequency(schedule.frequency);
        setTimeOfDay(schedule.timeOfDay);
        setTimezone(schedule.timezone);
        setDayOfWeek(String(schedule.dayOfWeek ?? 1));
        setDayOfMonth(String(schedule.dayOfMonth ?? 1));
        setFormat(schedule.format);
        setRecipients(schedule.recipients.join(", "));
        setNextSendAt(schedule.nextSendAt ?? null);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Could not load schedule"))
      .finally(() => setLoading(false));
  }, [dashboardId, open]);

  const recipientList = useMemo(() =>
    recipients
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
    [recipients]
  );

  async function saveSchedule() {
    setSaving(true);
    try {
      const response = await fetch(`/api/dashboards/${dashboardId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frequency,
          timeOfDay,
          timezone,
          dayOfWeek: Number(dayOfWeek),
          dayOfMonth: Number(dayOfMonth),
          format,
          recipients: recipientList,
          active: true,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not save schedule");
      setHasSchedule(true);
      setNextSendAt(body.schedule?.nextSendAt ?? null);
      toast.success("Schedule saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save schedule");
    } finally {
      setSaving(false);
    }
  }

  async function removeSchedule() {
    setRemoving(true);
    try {
      const response = await fetch(`/api/dashboards/${dashboardId}/schedule`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not remove schedule");
      setHasSchedule(false);
      setNextSendAt(null);
      setRecipients("");
      toast.success("Schedule removed");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove schedule");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-brand" />
            Schedule delivery
          </DialogTitle>
          <DialogDescription>
            Send this published dashboard to selected recipients on a repeating schedule.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading schedule...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={(value) => value && setFrequency(value as ReportScheduleFrequency)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="schedule-time">Time</Label>
                <Input id="schedule-time" type="time" value={timeOfDay} onChange={(event) => setTimeOfDay(event.target.value)} />
              </div>
            </div>

            {frequency === "weekly" && (
              <div className="space-y-1.5">
                <Label>Day of week</Label>
                <Select value={dayOfWeek} onValueChange={(value) => value && setDayOfWeek(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((day, index) => (
                      <SelectItem key={day} value={String(index)}>{day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {frequency === "monthly" && (
              <div className="space-y-1.5">
                <Label htmlFor="schedule-day-month">Day of month</Label>
                <Input
                  id="schedule-day-month"
                  type="number"
                  min={1}
                  max={28}
                  value={dayOfMonth}
                  onChange={(event) => setDayOfMonth(event.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="schedule-timezone">Timezone</Label>
              <Input id="schedule-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Format</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["pdf", "xlsx"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                      format === value
                        ? "border-brand bg-brand text-white"
                        : "border-border bg-background hover:bg-muted"
                    )}
                    onClick={() => setFormat(value)}
                  >
                    {value === "pdf" ? "PDF" : "Excel"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="schedule-recipients">Recipients</Label>
              <Textarea
                id="schedule-recipients"
                value={recipients}
                onChange={(event) => setRecipients(event.target.value)}
                rows={3}
                placeholder="person@example.com, team@example.com"
              />
              {recipientList.length === 0 ? (
                <p className="text-xs text-amber-700">No recipients yet. The schedule can be saved, but cron will skip delivery until one is added.</p>
              ) : (
                <p className="text-xs text-muted-foreground">{recipientList.length} recipient{recipientList.length === 1 ? "" : "s"}</p>
              )}
            </div>

            {nextSendAt && (
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Next delivery: {new Date(nextSendAt).toLocaleString()}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {hasSchedule && (
            <Button variant="outline" onClick={removeSchedule} disabled={removing || saving} className="mr-auto gap-1.5">
              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Remove
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || removing}>
            Cancel
          </Button>
          <Button onClick={saveSchedule} disabled={loading || saving || removing} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
