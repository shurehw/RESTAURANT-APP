/**
 * Standardized API error handling utilities
 * Provides consistent error parsing and toast notification integration
 */

import { toast } from 'sonner';

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, any>;
}

/**
 * Parse API error response into standardized format
 * Handles both structured errors and generic fetch failures
 */
export function parseApiError(error: any): ApiError {
  // Already structured error (from route-guard)
  if (error?.status && error?.code && error?.message) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  // Fetch Response object
  if (error instanceof Response) {
    return {
      status: error.status,
      code: 'HTTP_ERROR',
      message: error.statusText || `HTTP ${error.status} error`,
    };
  }

  // Network error
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Network request failed. Please check your connection.',
    };
  }

  // Supabase error
  if (error?.message && error?.code) {
    return {
      status: 500,
      code: error.code,
      message: error.message,
      details: error.details || error.hint,
    };
  }

  // Generic error fallback
  return {
    status: 500,
    code: 'UNKNOWN_ERROR',
    message: error?.message || 'An unexpected error occurred',
  };
}

/**
 * Show error toast notification with proper formatting
 * Includes retry guidance based on error type
 */
export function showErrorToast(error: any, customMessage?: string): void {
  const parsed = parseApiError(error);

  // Use custom message if provided, otherwise use parsed message
  const title = customMessage || getErrorTitle(parsed);
  const description = getErrorDescription(parsed);

  toast.error(title, {
    description,
    duration: parsed.status >= 500 ? 8000 : 5000, // Longer duration for server errors
  });
}

/**
 * Show success toast notification
 */
export function showSuccessToast(
  message: string,
  description?: string
): void {
  toast.success(message, {
    description,
    duration: 3000,
  });
}

/**
 * Get user-friendly error title based on error code
 */
function getErrorTitle(error: ApiError): string {
  switch (error.code) {
    case 'RATE_LIMIT_EXCEEDED':
      return 'Too Many Requests';
    case 'FORBIDDEN':
    case 'INSUFFICIENT_PERMISSIONS':
      return 'Access Denied';
    case 'NO_ORG':
      return 'Organization Access Required';
    case 'DUPLICATE_STATEMENT':
    case 'DUPLICATE_ENTRY':
      return 'Duplicate Entry';
    case 'NETWORK_ERROR':
      return 'Connection Failed';
    case 'FILE_TOO_LARGE':
      return 'File Too Large';
    case 'INVALID_TYPE':
    case 'INVALID_FILE_FORMAT':
      return 'Invalid File';
    default:
      return error.status >= 500
        ? 'Server Error'
        : 'Request Failed';
  }
}

/**
 * Get detailed error description with action hints
 */
function getErrorDescription(error: ApiError): string {
  // Return custom message if available
  if (error.message && !error.message.includes('error')) {
    return error.message;
  }

  // Provide context-specific guidance
  switch (error.code) {
    case 'RATE_LIMIT_EXCEEDED':
      return `You've exceeded the request limit. ${
        error.details?.retry_after
          ? `Please wait ${error.details.retry_after} seconds.`
          : 'Please try again in a moment.'
      }`;
    case 'FORBIDDEN':
      return "You don't have permission to access this resource.";
    case 'NO_ORG':
      return 'You must belong to an organization to access this feature.';
    case 'NETWORK_ERROR':
      return 'Unable to connect to the server. Check your internet connection and try again.';
    case 'DUPLICATE_STATEMENT':
      return 'A statement for this period already exists. Please check existing statements.';
    default:
      return error.message || 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Handle API response with automatic error toast
 * Returns null on error for easy optional chaining
 *
 * Usage:
 * ```tsx
 * const data = await handleApiResponse(fetch('/api/items'));
 * if (!data) return; // Error already shown via toast
 * ```
 */
export async function handleApiResponse<T = any>(
  response: Response | Promise<Response>,
  customErrorMessage?: string
): Promise<T | null> {
  try {
    const res = await response;

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      showErrorToast(errorData, customErrorMessage);
      return null;
    }

    const data = await res.json();
    return data;
  } catch (error) {
    showErrorToast(error, customErrorMessage);
    return null;
  }
}

/**
 * Wrap async function with error handling
 * Shows toast on error and optionally re-throws
 *
 * Usage:
 * ```tsx
 * const handleSubmit = withErrorHandler(async () => {
 *   await saveData();
 * }, 'Failed to save data');
 * ```
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  errorMessage?: string,
  options: { rethrow?: boolean } = {}
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      showErrorToast(error, errorMessage);
      if (options.rethrow) {
        throw error;
      }
    }
  }) as T;
}

/**
 * Get HTTP status text for common codes
 */
export function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };

  return statusTexts[status] || `HTTP ${status}`;
}
