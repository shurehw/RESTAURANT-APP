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
  enable_auto_scheduling: z.boolean().optional(),
  enable_labor_forecasting: z.boolean().optional(),
  target_labor_percentage: z.number().min(0).max(100).optional(),
  notify_slack: z.boolean().optional(),
  slack_webhook_url: z.string().url().nullable().optional(),
  notify_email: z.boolean().optional(),
  daily_briefing_enabled: z.boolean().optional(),
  daily_briefing_time: z.string().regex(/^\d{2}:\d{2}:\d{2}$/).optional(),
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
