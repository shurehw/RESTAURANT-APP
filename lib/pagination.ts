/**
 * Pagination utilities for list endpoints
 */

export type PaginationParams = {
  page: number;
  limit: number;
  from: number;
  to: number;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
};

/**
 * Parse pagination params from URL search params
 * Default: page=1, limit=50, max=100
 */
export function parsePageParams(search: URLSearchParams): PaginationParams {
  const page = Math.max(1, parseInt(search.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(search.get('limit') || '50')));

  const from = (page - 1) * limit;
  const to = page * limit - 1;

  return { page, limit, from, to };
}

/**
 * Build pagination metadata for response
 */
export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  const total_pages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    total_pages,
    has_next: page < total_pages,
    has_prev: page > 1,
  };
}
