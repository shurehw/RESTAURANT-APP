import { z } from 'zod';

// Reusable validators
export const uuid = z.string().uuid({ message: 'Invalid UUID format' });
export const dateString = z.string().datetime({ message: 'Invalid ISO date format' });
export const paginationParams = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// Organization settings
export const orgSettingsSchema = z.object({
  allow_mobile_clock_in: z.boolean().optional(),
  require_photo_verification: z.boolean().optional(),
  require_geofence: z.boolean().optional(),
  geofence_radius_meters: z.number().int().min(10).max(1000).optional(),
  allow_shift_swaps: z.boolean().optional(),
  require_manager_approval_swaps: z.boolean().optional(),
  allow_time_off_requests: z.boolean().optional(),
  min_notice_hours_time_off: z.number().int().min(0).optional(),
  enable_auto_scheduling: z.boolean().optional(),
  enable_labor_forecasting: z.boolean().optional(),
  target_labor_percentage: z.number().min(0).max(100).optional(),
  notify_slack: z.boolean().optional(),
  slack_webhook_url: z.string().url().nullable().optional(),
  notify_email: z.boolean().optional(),
  daily_briefing_enabled: z.boolean().optional(),
  daily_briefing_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
});

// Time clock punch
export const timePunchSchema = z.object({
  employee_id: uuid,
  venue_id: uuid,
  punch_type: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end']),
  punch_time: dateString.optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  photo_url: z.string().url().optional(),
});

// Employee PIN generation
export const pinGenerationSchema = z.object({
  employee_id: uuid,
  venue_id: uuid,
});

// Break tracking
export const breakSchema = z.object({
  employee_id: uuid,
  venue_id: uuid,
  break_type: z.enum(['meal', 'rest', 'unpaid']),
  action: z.enum(['start', 'end']),
});

// Schedule template creation
export const scheduleTemplateSchema = z.object({
  venue_id: uuid,
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  template_type: z.enum(['weekly', 'seasonal', 'event', 'custom']),
  template_data: z.array(z.any()), // Array of shift objects
  created_by: uuid,
});

// Message sending
export const messageSendSchema = z.object({
  channel_id: uuid,
  sender_id: uuid,
  message_text: z.string().min(1).max(5000),
  message_type: z.enum(['text', 'image', 'file']).default('text'),
  mentioned_employee_ids: z.array(uuid).default([]),
  reply_to_message_id: uuid.nullable().optional(),
  is_announcement: z.boolean().default(false),
});

// Time-off request
export const timeOffRequestSchema = z.object({
  employee_id: uuid,
  venue_id: uuid,
  request_type: z.enum(['vacation', 'sick', 'personal', 'unpaid']),
  start_date: z.string().date(),
  end_date: z.string().date(),
  notes: z.string().max(500).optional(),
});

// Labor forecast query
export const laborForecastQuerySchema = z.object({
  venueId: uuid,
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

/**
 * Validates request body against schema
 * Throws 400 with detailed errors if validation fails
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request payload',
      details: result.error.flatten(),
    };
  }

  return result.data;
}

/**
 * Validates URL search params against schema
 */
export function validateQuery<T>(schema: z.ZodSchema<T>, params: URLSearchParams): T {
  const obj = Object.fromEntries(params.entries());
  return validate(schema, obj);
}

/**
 * Asserts Content-Type header matches required types
 * Throws 415 if mismatch
 */
export function assertContentType(req: Request, types: string[]): void {
  const ct = req.headers.get('content-type') || '';
  if (!types.some((t) => ct.includes(t))) {
    throw {
      status: 415,
      code: 'INVALID_CONTENT_TYPE',
      message: `Requires one of: ${types.join(', ')}`,
    };
  }
}
