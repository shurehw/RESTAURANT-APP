#!/usr/bin/env python3
"""
CLI Wrapper for Demand Forecaster
Callable from automation cron jobs

Usage:
  python run_forecast.py --venue-id <uuid> --days-ahead 14
"""

import argparse
import json
import sys
from datetime import datetime, timedelta
from forecaster import DemandForecaster


def run_forecast(venue_id: str, days_ahead: int = 14):
    """
    Run forecaster for specified venue and days ahead

    Args:
        venue_id: UUID of the venue
        days_ahead: Number of days to forecast (default: 14)

    Returns:
        JSON string with results
    """

    try:
        print(f"Starting forecast for venue {venue_id}, {days_ahead} days ahead...", file=sys.stderr)

        # Initialize forecaster
        forecaster = DemandForecaster(venue_id)

        # Train models
        print("Training models...", file=sys.stderr)
        accuracy = forecaster.train_models()
        print(f"Model accuracy - Covers: {accuracy['covers_accuracy']:.2%}, Revenue: {accuracy['revenue_accuracy']:.2%}", file=sys.stderr)

        # Generate forecasts
        forecasts = []
        for days in range(1, days_ahead + 1):
            target_date = (datetime.now() + timedelta(days=days)).date()

            # Generate forecast for each shift
            for shift_type in ['lunch', 'dinner']:
                try:
                    forecast = forecaster.generate_forecast(target_date, shift_type=shift_type)
                    forecasts.append({
                        'date': str(target_date),
                        'shift_type': shift_type,
                        'covers': forecast['covers_predicted'],
                        'revenue': forecast['revenue_predicted'],
                        'confidence': forecast['confidence_level']
                    })
                    print(f"  ✓ {target_date} {shift_type}: {forecast['covers_predicted']} covers, ${forecast['revenue_predicted']:,.0f}", file=sys.stderr)
                except Exception as e:
                    print(f"  ✗ {target_date} {shift_type}: {str(e)}", file=sys.stderr)

        # Return results as JSON
        result = {
            'success': True,
            'venue_id': venue_id,
            'forecasts_generated': len(forecasts),
            'days_ahead': days_ahead,
            'model_accuracy': accuracy,
            'forecasts': forecasts
        }

        print(json.dumps(result))
        return 0

    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'venue_id': venue_id
        }
        print(json.dumps(error_result))
        return 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate demand forecasts')
    parser.add_argument('--venue-id', required=True, help='Venue UUID')
    parser.add_argument('--days-ahead', type=int, default=14, help='Number of days to forecast (default: 14)')

    args = parser.parse_args()

    exit_code = run_forecast(args.venue_id, args.days_ahead)
    sys.exit(exit_code)
