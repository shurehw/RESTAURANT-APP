/**
 * Sentry monitoring utilities for restaurant app
 * Provides helpers to add restaurant-specific context to errors
 */

import * as Sentry from '@sentry/nextjs';

/**
 * Context type for restaurant operations
 */
export interface RestaurantContext {
  venueId?: string;
  venueName?: string;
  employeeId?: string;
  employeeName?: string;
  checkId?: string;
  checkNumber?: string;
  managerId?: string;
  businessDate?: string;
  operation?: 'comp_review' | 'labor_calc' | 'forecast' | 'health_check' | 'attestation' | 'other';
}

/**
 * Add restaurant context to current Sentry scope
 * Use this in API routes and server components
 */
export function setRestaurantContext(context: RestaurantContext) {
  Sentry.setContext('restaurant', {
    venue_id: context.venueId,
    venue_name: context.venueName,
    employee_id: context.employeeId,
    employee_name: context.employeeName,
    check_id: context.checkId,
    check_number: context.checkNumber,
    manager_id: context.managerId,
    business_date: context.businessDate,
    operation: context.operation,
  });

  // Also set as tags for easier filtering
  if (context.venueId) Sentry.setTag('venue_id', context.venueId);
  if (context.operation) Sentry.setTag('operation', context.operation);
  if (context.businessDate) Sentry.setTag('business_date', context.businessDate);
}

/**
 * Capture an error with restaurant context
 * Use this for try/catch blocks
 */
export function captureRestaurantError(
  error: Error,
  context: RestaurantContext,
  level: Sentry.SeverityLevel = 'error'
) {
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    setRestaurantContext(context);
    Sentry.captureException(error);
  });
}

/**
 * Capture a message with restaurant context
 * Use this for logging important events
 */
export function captureRestaurantMessage(
  message: string,
  context: RestaurantContext,
  level: Sentry.SeverityLevel = 'info'
) {
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    setRestaurantContext(context);
    Sentry.captureMessage(message);
  });
}

/**
 * Track AI comp review performance
 */
export function trackAIReviewPerformance(
  venueId: string,
  businessDate: string,
  compCount: number,
  duration: number
) {
  // Sentry metrics API was removed in v9 — use spans instead
  Sentry.startSpan({ name: 'ai_review', attributes: { venue_id: venueId, business_date: businessDate } }, () => {
    // duration and compCount captured as span attributes
  });
}

/**
 * Track API route performance
 */
export function trackAPIPerformance(
  route: string,
  method: string,
  statusCode: number,
  duration: number
) {
  Sentry.startSpan({ name: 'api.request', attributes: { route, method, status: statusCode.toString() } }, () => {
    // duration captured as span attribute
  });
}

/**
 * Breadcrumb helpers for tracking user actions
 */
export function addCompReviewBreadcrumb(
  checkId: string,
  action: 'approved' | 'flagged' | 'reviewed'
) {
  Sentry.addBreadcrumb({
    category: 'comp_review',
    message: `Comp ${action}: ${checkId}`,
    level: 'info',
    data: { check_id: checkId, action },
  });
}

export function addManagerActionBreadcrumb(
  actionId: string,
  action: 'created' | 'completed' | 'dismissed'
) {
  Sentry.addBreadcrumb({
    category: 'manager_action',
    message: `Manager action ${action}: ${actionId}`,
    level: 'info',
    data: { action_id: actionId, action },
  });
}

/**
 * Filter sensitive data before sending to Sentry
 */
export function sanitizeError(error: any): any {
  if (typeof error === 'object' && error !== null) {
    const sanitized = { ...error };

    // Remove sensitive fields
    const sensitiveFields = [
      'password',
      'token',
      'api_key',
      'apiKey',
      'secret',
      'authorization',
      'cookie',
      'ssn',
      'credit_card',
      'creditCard',
    ];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  return error;
}
