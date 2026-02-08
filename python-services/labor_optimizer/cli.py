"""
CLI - Click-based commands for the labor optimizer.

Usage:
    python -m labor_optimizer.cli import-checks --venue-id UUID --date 2026-02-07 --pos-type toast
    python -m labor_optimizer.cli build-snapshots --venue-id UUID --date 2026-02-07
    python -m labor_optimizer.cli build-profiles --venue-id UUID --lookback 8
    python -m labor_optimizer.cli forecast --venue-id UUID --week-start 2026-02-10
    python -m labor_optimizer.cli backtest --venue-id UUID --start 2026-01-01 --end 2026-02-01
    python -m labor_optimizer.cli report --venue-id UUID --week-start 2026-02-10
    python -m labor_optimizer.cli full-pipeline --venue-id UUID
"""

import click
from datetime import datetime, date, timedelta


@click.group()
def cli():
    """Labor Optimizer - Active Covers Staffing Engine"""
    pass


@cli.command("import-checks")
@click.option("--venue-id", required=True, help="Venue UUID")
@click.option("--date", "business_date", required=True, help="Business date (YYYY-MM-DD)")
@click.option("--end-date", default=None, help="End date for range import (YYYY-MM-DD)")
@click.option("--pos-type", required=True, type=click.Choice(["toast", "square", "csv"]))
@click.option("--restaurant-guid", default=None, help="Toast restaurant GUID")
@click.option("--location-id", default=None, help="Square location ID")
@click.option("--csv-file", default=None, help="Path to CSV file")
@click.option("--dwell-minutes", default=90, help="Default dwell time for missing close_time")
def import_checks(venue_id, business_date, end_date, pos_type, restaurant_guid, location_id, csv_file, dwell_minutes):
    """Import POS checks from Toast, Square, or CSV."""
    from .services.pos_importer import ToastCheckImporter, SquareCheckImporter, CSVCheckImporter

    click.echo(f"Importing {pos_type} checks for venue {venue_id[:8]}...")

    if pos_type == "toast":
        if not restaurant_guid:
            raise click.BadParameter("--restaurant-guid required for Toast")
        importer = ToastCheckImporter(venue_id, restaurant_guid)
    elif pos_type == "square":
        if not location_id:
            raise click.BadParameter("--location-id required for Square")
        importer = SquareCheckImporter(venue_id, location_id)
    elif pos_type == "csv":
        if not csv_file:
            raise click.BadParameter("--csv-file required for CSV")
        importer = CSVCheckImporter(venue_id)
        importer.load_csv(csv_file)

    if end_date:
        count = importer.import_range(business_date, end_date, dwell_minutes)
    else:
        count = importer.import_date(business_date, dwell_minutes)

    click.echo(f"Done: {count} checks imported")


@cli.command("build-snapshots")
@click.option("--venue-id", required=True, help="Venue UUID")
@click.option("--date", "business_date", default=None, help="Specific date (YYYY-MM-DD)")
@click.option("--backfill", is_flag=True, help="Backfill all dates with check data")
@click.option("--start-date", default=None, help="Start date for backfill")
@click.option("--end-date", default=None, help="End date for backfill")
def build_snapshots(venue_id, business_date, backfill, start_date, end_date):
    """Build hourly snapshots from pos_checks."""
    from .services.snapshot_builder import SnapshotBuilder

    builder = SnapshotBuilder(venue_id)

    if backfill:
        click.echo(f"Backfilling snapshots for venue {venue_id[:8]}...")
        count = builder.backfill_all(start_date, end_date)
        click.echo(f"Done: {count} snapshots built")
    elif business_date:
        click.echo(f"Building snapshots for {business_date}...")
        snapshots = builder.build_snapshots(business_date)
        click.echo(f"Done: {len(snapshots)} hourly snapshots")
    else:
        raise click.BadParameter("Provide --date or --backfill")


@cli.command("build-profiles")
@click.option("--venue-id", required=True, help="Venue UUID")
@click.option("--lookback", default=8, help="Lookback weeks for profile building")
@click.option("--min-samples", default=3, help="Minimum sample count per DOW/hour")
def build_profiles(venue_id, lookback, min_samples):
    """Build DOW x Hour statistical profiles from hourly_snapshots."""
    from .services.profile_builder import ProfileBuilder

    click.echo(f"Building profiles for venue {venue_id[:8]} (lookback: {lookback}w)...")
    builder = ProfileBuilder(venue_id)
    profiles = builder.build_profiles(lookback, min_samples)
    click.echo(f"Done: {len(profiles)} profiles built")


@cli.command("forecast")
@click.option("--venue-id", required=True, help="Venue UUID")
@click.option("--date", "target_date", default=None, help="Single date (YYYY-MM-DD)")
@click.option("--week-start", default=None, help="Week start date (Monday, YYYY-MM-DD)")
@click.option("--start-date", default=None, help="Start of date range")
@click.option("--end-date", default=None, help="End of date range")
@click.option("--scenarios", default="lean,buffered,safe", help="Comma-separated scenarios")
def forecast(venue_id, target_date, week_start, start_date, end_date, scenarios):
    """Generate staffing forecasts from profiles."""
    from .services.forecast_generator import ForecastGenerator

    gen = ForecastGenerator(venue_id)
    scenario_list = [s.strip() for s in scenarios.split(",")]

    if week_start:
        click.echo(f"Generating forecasts for week of {week_start}...")
        results = gen.generate_week(week_start, scenario_list)
    elif start_date and end_date:
        click.echo(f"Generating forecasts for {start_date} to {end_date}...")
        results = gen.generate_range(start_date, end_date, scenario_list)
    elif target_date:
        click.echo(f"Generating forecast for {target_date}...")
        results = gen.generate_forecast(target_date, scenario_list)
    else:
        raise click.BadParameter("Provide --date, --week-start, or --start-date/--end-date")

    click.echo(f"Done: {len(results)} forecasts generated")


@cli.command("backtest")
@click.option("--venue-id", required=True, help="Venue UUID")
@click.option("--start", required=True, help="Start date (YYYY-MM-DD)")
@click.option("--end", required=True, help="End date (YYYY-MM-DD)")
@click.option("--scenario", default="buffered", help="Scenario to backtest")
@click.option("--rolling", is_flag=True, help="Use rolling (walk-forward) backtest")
@click.option("--train-weeks", default=4, help="Training weeks for rolling backtest")
def backtest(venue_id, start, end, scenario, rolling, train_weeks):
    """Run backtest comparing profiles vs actuals."""
    from .services.backtest_runner import BacktestRunner

    runner = BacktestRunner(venue_id)

    if rolling:
        click.echo(f"Running rolling backtest ({train_weeks}w train) for {start} to {end}...")
        results = runner.rolling_backtest(start, end, train_weeks, scenario)
    else:
        click.echo(f"Running standard backtest for {start} to {end}...")
        results = runner.backtest_range(start, end, scenario)

    click.echo(f"Done: {len(results)} days backtested")


@cli.command("alerts")
@click.option("--venue-id", required=True, help="Venue UUID")
@click.option("--date", "business_date", required=True, help="Business date to check (YYYY-MM-DD)")
def alerts(venue_id, business_date):
    """Run post-close alert analysis for a date."""
    from .services.alert_monitor import AlertMonitor

    monitor = AlertMonitor(venue_id)
    click.echo(f"Checking alerts for {business_date}...")
    results = monitor.check_date(business_date)
    click.echo(f"Done: {len(results)} alerts generated")


@cli.command("report")
@click.option("--venue-id", required=True, help="Venue UUID")
@click.option("--venue-name", default=None, help="Venue display name")
@click.option("--week-start", default=None, help="Target week for recommendations (Monday)")
@click.option("--output", default=None, help="Output file path")
def report(venue_id, venue_name, week_start, output):
    """Generate Excel optimization report."""
    from .reports.excel_generator import ExcelReportGenerator

    gen = ExcelReportGenerator(venue_id, venue_name)
    click.echo(f"Generating report for {venue_name or venue_id[:8]}...")
    path = gen.generate_report(output, week_start)
    click.echo(f"Done: {path}")


@cli.command("full-pipeline")
@click.option("--venue-id", required=True, help="Venue UUID")
@click.option("--venue-name", default=None, help="Venue display name")
@click.option("--pos-type", default=None, type=click.Choice(["toast", "square", "csv"]))
@click.option("--restaurant-guid", default=None, help="Toast restaurant GUID")
@click.option("--location-id", default=None, help="Square location ID")
@click.option("--csv-file", default=None, help="Path to CSV file")
@click.option("--date", "business_date", default=None, help="Import date (default: yesterday)")
@click.option("--lookback", default=8, help="Profile lookback weeks")
@click.option("--week-start", default=None, help="Forecast target week")
@click.option("--skip-import", is_flag=True, help="Skip POS import step")
def full_pipeline(venue_id, venue_name, pos_type, restaurant_guid, location_id, csv_file, business_date, lookback, week_start, skip_import):
    """Run the full pipeline: import -> snapshots -> profiles -> forecast -> report."""
    from .services.pos_importer import ToastCheckImporter, SquareCheckImporter, CSVCheckImporter
    from .services.snapshot_builder import SnapshotBuilder
    from .services.profile_builder import ProfileBuilder
    from .services.forecast_generator import ForecastGenerator
    from .reports.excel_generator import ExcelReportGenerator

    if not business_date:
        business_date = (date.today() - timedelta(days=1)).isoformat()
    if not week_start:
        # Next Monday
        today = date.today()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7
        week_start = (today + timedelta(days=days_until_monday)).isoformat()

    click.echo(f"=== Full Pipeline for {venue_name or venue_id[:8]} ===")

    # Step 1: Import (optional)
    if not skip_import and pos_type:
        click.echo(f"\n1. Importing {pos_type} checks for {business_date}...")
        if pos_type == "toast":
            importer = ToastCheckImporter(venue_id, restaurant_guid or "")
        elif pos_type == "square":
            importer = SquareCheckImporter(venue_id, location_id or "")
        elif pos_type == "csv":
            importer = CSVCheckImporter(venue_id)
            if csv_file:
                importer.load_csv(csv_file)
        count = importer.import_date(business_date)
        click.echo(f"   {count} checks imported")
    else:
        click.echo("\n1. Skipping POS import")

    # Step 2: Snapshots
    click.echo(f"\n2. Building snapshots for {business_date}...")
    builder = SnapshotBuilder(venue_id)
    snapshots = builder.build_snapshots(business_date)
    click.echo(f"   {len(snapshots)} hourly snapshots")

    # Step 3: Profiles
    click.echo(f"\n3. Building profiles (lookback: {lookback}w)...")
    profiler = ProfileBuilder(venue_id)
    profiles = profiler.build_profiles(lookback)
    click.echo(f"   {len(profiles)} profiles")

    # Step 4: Forecast
    click.echo(f"\n4. Generating forecasts for week of {week_start}...")
    forecaster = ForecastGenerator(venue_id)
    forecasts = forecaster.generate_week(week_start)
    click.echo(f"   {len(forecasts)} forecasts")

    # Step 5: Report
    click.echo(f"\n5. Generating Excel report...")
    reporter = ExcelReportGenerator(venue_id, venue_name)
    path = reporter.generate_report(week_start=week_start)
    click.echo(f"   Saved: {path}")

    click.echo(f"\n=== Pipeline complete ===")


if __name__ == "__main__":
    cli()
