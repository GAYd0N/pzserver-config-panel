export type CronSchedule = {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  dayOfMonthRestricted: boolean;
  dayOfWeekRestricted: boolean;
};

type FieldConfig = {
  label: string;
  min: number;
  max: number;
};

const MINUTE_FIELD: FieldConfig = { label: "minute", min: 0, max: 59 };
const HOUR_FIELD: FieldConfig = { label: "hour", min: 0, max: 23 };
const DAY_OF_MONTH_FIELD: FieldConfig = { label: "day-of-month", min: 1, max: 31 };
const MONTH_FIELD: FieldConfig = { label: "month", min: 1, max: 12 };
const DAY_OF_WEEK_FIELD: FieldConfig = { label: "day-of-week", min: 0, max: 7 };

function parseNumber(value: string, field: FieldConfig): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`invalid ${field.label} value: ${value}`);
  }

  const parsed = Number(value);
  if (parsed < field.min || parsed > field.max) {
    throw new Error(
      `${field.label} value out of range (${field.min}-${field.max}): ${value}`,
    );
  }

  return parsed;
}

function parseField(value: string, field: FieldConfig): Set<number> {
  const text = value.trim();
  if (!text) {
    throw new Error(`missing ${field.label} field`);
  }

  const result = new Set<number>();

  for (const rawPart of text.split(",")) {
    const part = rawPart.trim();
    if (!part) {
      throw new Error(`invalid ${field.label} field: ${value}`);
    }

    const stepParts = part.split("/");
    if (stepParts.length > 2) {
      throw new Error(`invalid ${field.label} step: ${part}`);
    }

    let step = 1;
    if (stepParts.length === 2) {
      if (!/^\d+$/.test(stepParts[1])) {
        throw new Error(`invalid ${field.label} step: ${part}`);
      }
      step = Number(stepParts[1]);
      if (step <= 0) {
        throw new Error(`invalid ${field.label} step: ${part}`);
      }
    }

    const rangePart = stepParts[0];
    let start: number;
    let end: number;

    if (rangePart === "*") {
      start = field.min;
      end = field.max;
    } else if (rangePart.includes("-")) {
      const bounds = rangePart.split("-");
      if (bounds.length !== 2) {
        throw new Error(`invalid ${field.label} range: ${rangePart}`);
      }
      start = parseNumber(bounds[0], field);
      end = parseNumber(bounds[1], field);
      if (start > end) {
        throw new Error(`invalid ${field.label} range: ${rangePart}`);
      }
    } else {
      start = parseNumber(rangePart, field);
      end = stepParts.length === 2 ? field.max : start;
    }

    for (let current = start; current <= end; current += step) {
      result.add(current);
    }
  }

  return result;
}

function normalizeDaysOfWeek(values: Set<number>): Set<number> {
  if (values.has(7)) {
    values.delete(7);
    values.add(0);
  }
  return values;
}

export function parseCronExpression(expression: string): CronSchedule {
  if (typeof expression !== "string") {
    throw new Error("cron expression must be a string");
  }

  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error("cron expression must contain exactly 5 fields");
  }

  return {
    minutes: parseField(fields[0], MINUTE_FIELD),
    hours: parseField(fields[1], HOUR_FIELD),
    daysOfMonth: parseField(fields[2], DAY_OF_MONTH_FIELD),
    months: parseField(fields[3], MONTH_FIELD),
    daysOfWeek: normalizeDaysOfWeek(parseField(fields[4], DAY_OF_WEEK_FIELD)),
    dayOfMonthRestricted: fields[2].trim() !== "*",
    dayOfWeekRestricted: fields[4].trim() !== "*",
  };
}

export function isValidCronExpression(expression: string): boolean {
  try {
    parseCronExpression(expression);
    return true;
  } catch {
    return false;
  }
}

export function matchesCronExpression(schedule: CronSchedule, date: Date): boolean {
  if (!schedule.minutes.has(date.getMinutes())) {
    return false;
  }
  if (!schedule.hours.has(date.getHours())) {
    return false;
  }
  if (!schedule.months.has(date.getMonth() + 1)) {
    return false;
  }

  const dayOfMonthMatches = schedule.daysOfMonth.has(date.getDate());
  const dayOfWeekMatches = schedule.daysOfWeek.has(date.getDay());

  if (schedule.dayOfMonthRestricted && schedule.dayOfWeekRestricted) {
    return dayOfMonthMatches || dayOfWeekMatches;
  }

  return dayOfMonthMatches && dayOfWeekMatches;
}
