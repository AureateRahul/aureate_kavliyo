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

from db.repository import (
    get_db_connection,
    refresh_metrics_last_90_days,
    get_user_per_email_cost,
    apply_cost_roas,
    get_null_send_time_ids,
    update_send_times,
)
from db.schema import initialize_db
from api.klaviyo import fetch_campaign_values_report, fetch_campaign_messages

TIMEFRAME = {"key": "last_90_days"}


def _backfill_send_times(conn, all_campaign_ids: list) -> None:
    """
    Re-fetches API 2 (campaign-messages) for any campaign that was touched by
    the metrics refresh but still has send_time IS NULL in the DB.

    This handles the case where a campaign was first stored while still
    scheduled (no send_time yet) and has since been sent.
    """
    null_ids = get_null_send_time_ids(conn, all_campaign_ids)
    if not null_ids:
        return

    print(f"[INFO] {len(null_ids)} campaign(s) have null send_time — backfilling via API 2...")
    try:
        messages = fetch_campaign_messages(null_ids)
    except Exception as exc:
        print(f"[WARN] API 2 backfill error: {exc}")
        return

    updated = update_send_times(conn, messages)
    print(f"[INFO] Backfilled send_time for {updated} campaign(s).")


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

    per_email_cost = get_user_per_email_cost(conn)
    if per_email_cost:
        print(f"[INFO] per_email_cost = {per_email_cost} — computing cost & ROAS")
        rows = apply_cost_roas(rows, per_email_cost)
    else:
        print("[WARN] per_email_cost not set — cost & ROAS will be NULL")

    print(f"[INFO] API 1 returned {len(rows)} campaigns. Refreshing DB...")
    result = refresh_metrics_last_90_days(conn, rows)

    print(
        f"[DONE] Updated: {result['updated']} existing campaigns | "
        f"Inserted: {result['inserted']} new campaigns"
    )

    # Backfill send_time for any campaigns that were scheduled when first stored
    all_touched_ids = [r["campaign_id"] for r in rows if r.get("campaign_id")]
    _backfill_send_times(conn, all_touched_ids)


if __name__ == "__main__":
    main()
