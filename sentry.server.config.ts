import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
  // Adjust this value in production to reduce costs
  tracesSampleRate: 0.1,

  // Capture 100% of errors
  sampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Add restaurant-specific context
  beforeSend(event, hint) {
    // Don't send events in development
    if (process.env.NODE_ENV === 'development') {
      return null;
    }

    // Add custom tags for restaurant context
    if (event.request?.url) {
      const url = new URL(event.request.url, 'http://localhost');
      const venueId = url.searchParams.get('venue_id');

      if (venueId) {
        Sentry.setTag('venue_id', venueId);
      }
    }

    // Filter sensitive headers
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
    }

    // Filter sensitive query params
    if (event.request?.query_string && typeof event.request.query_string === 'string') {
      const filtered = event.request.query_string
        .split('&')
        .filter((param: string) => !param.startsWith('token=') && !param.startsWith('api_key='))
        .join('&');
      event.request.query_string = filtered;
    }

    return event;
  },
});
