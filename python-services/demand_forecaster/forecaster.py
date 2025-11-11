"""
AI Labor OS - Demand Forecasting Engine
Predicts BOTH covers AND revenue (sales) using Prophet ML models
"""

import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import pandas as pd
import numpy as np
from prophet import Prophet
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

class DemandForecaster:
    """
    Dual-model forecasting engine:
    - Model 1: Predicts covers
    - Model 2: Predicts revenue
    - Derives: Avg check, party size, hour-by-hour breakdown
    """

    def __init__(self, venue_id: str):
        self.venue_id = venue_id

        # Supabase client
        self.supabase: Client = create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        )

        # Models
        self.covers_model: Optional[Prophet] = None
        self.revenue_model: Optional[Prophet] = None

        # Accuracy tracking
        self.model_version = f"v1.0_{datetime.now().strftime('%Y%m%d')}"

    def load_historical_data(self, lookback_months: int = 18) -> pd.DataFrame:
        """
        Load historical covers and revenue data for training
        """

        cutoff_date = (datetime.now() - timedelta(days=lookback_months * 30)).date()

        response = self.supabase.table('demand_history') \
            .select('*') \
            .eq('venue_id', self.venue_id) \
            .gte('business_date', str(cutoff_date)) \
            .order('business_date') \
            .execute()

        if not response.data:
            raise ValueError(f"No historical data found for venue {self.venue_id}")

        df = pd.DataFrame(response.data)

        # Convert dates
        df['business_date'] = pd.to_datetime(df['business_date'])

        # Calculate derived metrics
        df['avg_check'] = df['revenue'] / df['covers']
        df['walkin_covers'] = df['covers'] - df['reservation_covers']

        print(f"✓ Loaded {len(df)} historical records ({df['business_date'].min()} to {df['business_date'].max()})")

        return df

    def train_covers_model(self, df: pd.DataFrame) -> Prophet:
        """
        Train Prophet model to forecast COVERS
        """

        print("\n📊 Training COVERS forecasting model...")

        # Prepare data for Prophet (requires 'ds' and 'y' columns)
        prophet_df = pd.DataFrame({
            'ds': df['business_date'],
            'y': df['covers'],

            # Regressors (external factors)
            'temp_high': df['weather_temp_high'].fillna(df['weather_temp_high'].mean()),
            'precipitation': df['weather_precipitation'].fillna(0),
            'has_event': df['has_nearby_event'].astype(int),
            'reservation_count': df['reservation_count'].fillna(0),
            'is_holiday': df['is_holiday'].astype(int),
            'day_of_week': df['day_of_week']
        })

        # Initialize Prophet
        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False,
            seasonality_mode='multiplicative',
            changepoint_prior_scale=0.05  # Flexibility for trend changes
        )

        # Add custom seasonalities
        model.add_seasonality(name='monthly', period=30.5, fourier_order=5)

        # Add regressors
        model.add_regressor('temp_high')
        model.add_regressor('precipitation')
        model.add_regressor('has_event')
        model.add_regressor('reservation_count')
        model.add_regressor('is_holiday')

        # Fit model
        model.fit(prophet_df)

        print(f"✓ Covers model trained on {len(prophet_df)} data points")

        return model

    def train_revenue_model(self, df: pd.DataFrame) -> Prophet:
        """
        Train Prophet model to forecast REVENUE (sales)
        """

        print("\n💰 Training REVENUE forecasting model...")

        # Prepare data for Prophet
        prophet_df = pd.DataFrame({
            'ds': df['business_date'],
            'y': df['revenue'],

            # Regressors
            'temp_high': df['weather_temp_high'].fillna(df['weather_temp_high'].mean()),
            'precipitation': df['weather_precipitation'].fillna(0),
            'has_event': df['has_nearby_event'].astype(int),
            'reservation_count': df['reservation_count'].fillna(0),
            'reservation_covers': df['reservation_covers'].fillna(0),
            'is_holiday': df['is_holiday'].astype(int),
            'day_of_week': df['day_of_week']
        })

        # Initialize Prophet
        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False,
            seasonality_mode='multiplicative',
            changepoint_prior_scale=0.05
        )

        # Add custom seasonalities
        model.add_seasonality(name='monthly', period=30.5, fourier_order=5)

        # Add regressors
        model.add_regressor('temp_high')
        model.add_regressor('precipitation')
        model.add_regressor('has_event')
        model.add_regressor('reservation_count')
        model.add_regressor('reservation_covers')
        model.add_regressor('is_holiday')

        # Fit model
        model.fit(prophet_df)

        print(f"✓ Revenue model trained on {len(prophet_df)} data points")

        return model

    def train_models(self):
        """
        Train both covers and revenue models
        """

        print(f"\n🤖 Training demand forecasting models for venue: {self.venue_id}")
        print("=" * 60)

        # Load historical data
        df = self.load_historical_data(lookback_months=18)

        # Train covers model
        self.covers_model = self.train_covers_model(df)

        # Train revenue model
        self.revenue_model = self.train_revenue_model(df)

        # Calculate model accuracy on recent data
        accuracy = self.calculate_model_accuracy(df)

        print("\n✅ Model training complete!")
        print(f"   Covers accuracy: {accuracy['covers_accuracy']:.1%}")
        print(f"   Revenue accuracy: {accuracy['revenue_accuracy']:.1%}")
        print("=" * 60)

        return accuracy

    def calculate_model_accuracy(self, df: pd.DataFrame, test_days: int = 30) -> Dict:
        """
        Calculate model accuracy on recent historical data
        """

        # Use last 30 days as test set
        test_df = df.tail(test_days).copy()

        # Generate predictions for test period
        test_predictions = []

        for _, row in test_df.iterrows():
            pred = self.generate_forecast_internal(
                target_date=row['business_date'].date(),
                weather_forecast={
                    'high_temp': row['weather_temp_high'],
                    'precipitation': row['weather_precipitation']
                },
                reservation_count=int(row['reservation_count']),
                reservation_covers=int(row['reservation_covers']),
                has_event=bool(row['has_nearby_event'])
            )

            test_predictions.append({
                'actual_covers': row['covers'],
                'pred_covers': pred['covers_predicted'],
                'actual_revenue': row['revenue'],
                'pred_revenue': pred['revenue_predicted']
            })

        pred_df = pd.DataFrame(test_predictions)

        # Calculate MAPE (Mean Absolute Percentage Error)
        covers_mape = np.mean(np.abs((pred_df['actual_covers'] - pred_df['pred_covers']) / pred_df['actual_covers']))
        revenue_mape = np.mean(np.abs((pred_df['actual_revenue'] - pred_df['pred_revenue']) / pred_df['actual_revenue']))

        return {
            'covers_accuracy': 1 - covers_mape,
            'revenue_accuracy': 1 - revenue_mape,
            'test_days': test_days
        }

    def generate_forecast(
        self,
        target_date: datetime.date,
        shift_type: str = 'dinner'
    ) -> Dict:
        """
        Generate forecast for specific date
        Fetches external data automatically
        """

        # Get weather forecast
        weather = self.get_weather_forecast(target_date)

        # Get events
        events = self.get_local_events(target_date)

        # Get reservations
        reservations = self.get_current_reservations(target_date, shift_type)

        # Generate prediction
        forecast = self.generate_forecast_internal(
            target_date=target_date,
            weather_forecast=weather,
            reservation_count=len(reservations),
            reservation_covers=sum(r['party_size'] for r in reservations),
            has_event=len(events) > 0
        )

        # Add context
        forecast['factors'] = {
            'weather': weather,
            'events': events,
            'reservations': {
                'count': len(reservations),
                'covers': sum(r['party_size'] for r in reservations)
            },
            'day_of_week': target_date.strftime('%A'),
            'historical_avg': self.get_historical_avg(target_date.weekday(), shift_type)
        }

        # Save to database
        self.save_forecast(forecast, target_date, shift_type)

        return forecast

    def generate_forecast_internal(
        self,
        target_date: datetime.date,
        weather_forecast: Dict,
        reservation_count: int,
        reservation_covers: int,
        has_event: bool
    ) -> Dict:
        """
        Internal forecast generation with provided external factors
        """

        if not self.covers_model or not self.revenue_model:
            raise ValueError("Models not trained. Call train_models() first.")

        # Prepare future dataframe
        future = pd.DataFrame({
            'ds': [pd.to_datetime(target_date)],
            'temp_high': [weather_forecast.get('high_temp', 70)],
            'precipitation': [weather_forecast.get('precipitation', 0)],
            'has_event': [1 if has_event else 0],
            'reservation_count': [reservation_count],
            'reservation_covers': [reservation_covers],
            'is_holiday': [self.is_holiday(target_date)],
            'day_of_week': [target_date.weekday()]
        })

        # Generate COVERS prediction
        covers_forecast = self.covers_model.predict(future)
        covers_pred = max(0, round(covers_forecast['yhat'].iloc[0]))
        covers_lower = max(0, round(covers_forecast['yhat_lower'].iloc[0]))
        covers_upper = round(covers_forecast['yhat_upper'].iloc[0])

        # Generate REVENUE prediction
        revenue_forecast = self.revenue_model.predict(future)
        revenue_pred = max(0, revenue_forecast['yhat'].iloc[0])
        revenue_lower = max(0, revenue_forecast['yhat_lower'].iloc[0])
        revenue_upper = revenue_forecast['yhat_upper'].iloc[0]

        # Calculate derived metrics
        avg_check = revenue_pred / covers_pred if covers_pred > 0 else 0

        # Estimate walkins
        walkin_covers_pred = max(0, covers_pred - reservation_covers)

        # Calculate confidence (based on prediction interval width)
        covers_interval_width = (covers_upper - covers_lower) / covers_pred if covers_pred > 0 else 1
        confidence = max(0.5, min(0.95, 1 - (covers_interval_width / 2)))

        return {
            'date': str(target_date),
            'day_of_week': target_date.strftime('%A'),

            # COVERS forecast
            'covers_predicted': int(covers_pred),
            'covers_lower': int(covers_lower),
            'covers_upper': int(covers_upper),

            # REVENUE forecast
            'revenue_predicted': round(revenue_pred, 2),
            'revenue_lower': round(revenue_lower, 2),
            'revenue_upper': round(revenue_upper, 2),

            # Derived metrics
            'avg_check_predicted': round(avg_check, 2),
            'confidence_level': round(confidence, 3),

            # Breakdown
            'breakdown': {
                'reservation_covers': reservation_covers,
                'predicted_walkins': int(walkin_covers_pred),
                'walkin_percentage': round(walkin_covers_pred / covers_pred * 100, 1) if covers_pred > 0 else 0
            }
        }

    def save_forecast(self, forecast: Dict, target_date: datetime.date, shift_type: str):
        """
        Save forecast to database
        """

        data = {
            'venue_id': self.venue_id,
            'forecast_date': str(datetime.now().date()),
            'business_date': str(target_date),
            'shift_type': shift_type,

            # Covers
            'covers_predicted': forecast['covers_predicted'],
            'covers_lower': forecast['covers_lower'],
            'covers_upper': forecast['covers_upper'],

            # Revenue
            'revenue_predicted': forecast['revenue_predicted'],

            # Breakdown
            'reservation_covers_predicted': forecast['breakdown']['reservation_covers'],
            'walkin_covers_predicted': forecast['breakdown']['predicted_walkins'],

            # Metadata
            'model_version': self.model_version,
            'confidence_level': forecast['confidence_level'],

            # External factors
            'weather_forecast': forecast.get('factors', {}).get('weather', {}),
            'events': forecast.get('factors', {}).get('events', {})
        }

        # Upsert (update if exists, insert if new)
        self.supabase.table('demand_forecasts').upsert(data).execute()

    def get_weather_forecast(self, target_date: datetime.date) -> Dict:
        """
        Fetch weather forecast from API
        """
        # TODO: Integrate with OpenWeatherMap or similar
        # For now, return placeholder
        return {
            'high_temp': 72,
            'low_temp': 58,
            'precipitation': 0,
            'conditions': 'clear'
        }

    def get_local_events(self, target_date: datetime.date) -> List[Dict]:
        """
        Fetch local events from API
        """
        # TODO: Integrate with events API (Ticketmaster, SeatGeek, etc)
        return []

    def get_current_reservations(self, target_date: datetime.date, shift_type: str) -> List[Dict]:
        """
        Fetch current reservations from OpenTable/Resy
        """
        # TODO: Integrate with reservation system
        # For now, query from database if you're storing them
        return []

    def get_historical_avg(self, day_of_week: int, shift_type: str) -> float:
        """
        Get historical average for this day of week
        """

        response = self.supabase.table('demand_history') \
            .select('covers') \
            .eq('venue_id', self.venue_id) \
            .eq('day_of_week', day_of_week) \
            .eq('shift_type', shift_type) \
            .execute()

        if response.data:
            return np.mean([r['covers'] for r in response.data])

        return 0

    def is_holiday(self, date: datetime.date) -> int:
        """
        Check if date is a holiday
        """
        # TODO: Implement holiday calendar
        # For now, just check common US holidays
        holidays = [
            (1, 1),   # New Year's
            (7, 4),   # Independence Day
            (12, 25), # Christmas
        ]

        return 1 if (date.month, date.day) in holidays else 0


def main():
    """
    Example usage
    """

    venue_id = "11111111-1111-1111-1111-111111111111"  # Replace with actual venue ID

    # Initialize forecaster
    forecaster = DemandForecaster(venue_id)

    # Train models
    accuracy = forecaster.train_models()

    # Generate forecasts for next 7 days
    print("\n📅 Generating 7-day forecasts...")
    print("=" * 80)

    for days_ahead in range(1, 8):
        target_date = (datetime.now() + timedelta(days=days_ahead)).date()

        forecast = forecaster.generate_forecast(target_date, shift_type='dinner')

        print(f"\n{forecast['day_of_week']}, {target_date}:")
        print(f"  Covers: {forecast['covers_predicted']} ({forecast['covers_lower']}-{forecast['covers_upper']})")
        print(f"  Revenue: ${forecast['revenue_predicted']:,.0f} (${forecast['revenue_lower']:,.0f}-${forecast['revenue_upper']:,.0f})")
        print(f"  Avg Check: ${forecast['avg_check_predicted']:.2f}")
        print(f"  Confidence: {forecast['confidence_level']:.1%}")

    print("\n" + "=" * 80)
    print("✅ Forecasts saved to database!")


if __name__ == '__main__':
    main()
