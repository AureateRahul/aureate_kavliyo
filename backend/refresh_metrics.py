"""
refresh_metrics.py
------------------
Refreshes the 4 key metrics (open_rate, click_rate, conversion_value,
click_to_open_rate) for the last 90 days using API 1.

Behaviour:
  - Existing campaign_id → UPDATE only the 4 metrics (nothing else touched).
  - New campaign_id      → INSERT full row with api_call_1=1.

Usage:
  python refresh_metrics.py
"""

import sys

from db.repository import get_db_connection, refresh_metrics_last_90_days
from db.schema import initialize_db
from api.klaviyo import fetch_campaign_values_report

TIMEFRAME = {"key": "last_90_days"}


def main() -> None:
    print("[INFO] Connecting to database...")
    conn = get_db_connection()
    initialize_db(conn)

    print(f"[INFO] Fetching campaign metrics from API 1 (timeframe: {TIMEFRAME['key']})...")
    try:
        rows = fetch_campaign_values_report(TIMEFRAME)
    except Exception as exc:
        print(f"[FAIL] API 1 error: {exc}")
        sys.exit(1)

    print(f"[INFO] API 1 returned {len(rows)} campaigns. Refreshing DB...")
    result = refresh_metrics_last_90_days(conn, rows)

    print(
        f"[DONE] Updated: {result['updated']} existing campaigns | "
        f"Inserted: {result['inserted']} new campaigns"
    )


if __name__ == "__main__":
    main()
