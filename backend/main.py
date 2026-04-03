import argparse
import sys
from datetime import datetime

from config import settings
from db.schema import initialize_db
from db.repository import (
    get_db_connection,
    upsert_campaign_values,
    update_campaign_messages,
    update_template_paths,
    get_pending_campaign_ids,
    get_pending_campaign_messages,
    is_api_done,
    reset_api_flag,
    get_status_summary,
)
from api.klaviyo import (
    fetch_campaign_values_report,
    fetch_campaign_messages,
    fetch_templates,
)

API_NUMBER_MAP = {
    1: "campaign_values_report",
    2: "campaign_messages",
    3: "fetch_templates",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Klaviyo data crawler — fetches API data and stores it in SQLite."
    )
    parser.add_argument("--start", metavar="YYYY-MM-DD", help="Custom timeframe start date")
    parser.add_argument("--end", metavar="YYYY-MM-DD", help="Custom timeframe end date")
    parser.add_argument(
        "--preset",
        metavar="KEY",
        default="last_365_days",
        help=(
            "Klaviyo timeframe preset key (used for API 1 when --start/--end not given). "
            "Default: last_365_days. "
            "Options: last_365_days, last_12_months, this_year, last_year, "
            "last_90_days, last_30_days, last_7_days, this_month, last_month, today, yesterday"
        ),
    )
    parser.add_argument(
        "--api",
        type=int,
        nargs="+",
        choices=[1, 2, 3],
        metavar="N",
        help="Which API(s) to run: 1=campaign_values, 2=campaign_messages, 3=fetch_templates. Default: all.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Max number of campaign IDs to process in API 2 and 3.",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Reset api_call flags for the selected API(s) before running",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Print current campaign status and exit",
    )
    return parser.parse_args()


def _parse_date(value: str, label: str) -> datetime:
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d")
    except ValueError:
        print(f"[ERROR] Invalid {label} date '{value}'. Expected format: YYYY-MM-DD")
        sys.exit(1)


def build_timeframe(args: argparse.Namespace) -> dict:
    if args.start or args.end:
        start_str = args.start or input("Enter start date (YYYY-MM-DD): ").strip()
        end_str = args.end or input("Enter end date   (YYYY-MM-DD): ").strip()

        start_dt = _parse_date(start_str, "start")
        end_dt = _parse_date(end_str, "end")

        if start_dt > end_dt:
            print("[ERROR] Start date must be on or before end date.")
            sys.exit(1)

        return {
            "start": start_dt.strftime("%Y-%m-%dT00:00:00"),
            "end": end_dt.strftime("%Y-%m-%dT23:59:59"),
        }

    return {"key": args.preset}


def print_status(conn) -> None:
    s = get_status_summary(conn)
    total = s.get("total") or 0
    done_1 = s.get("done_1") or 0
    done_2 = s.get("done_2") or 0
    done_3 = s.get("done_3") or 0

    print(f"\n{'API':<35} {'Done':<10} {'Total'}")
    print("-" * 55)
    print(f"{'1 — campaign_values_report':<35} {done_1:<10} {total}")
    print(f"{'2 — campaign_messages':<35} {done_2:<10} {done_1}")
    print(f"{'3 — fetch_templates':<35} {done_3:<10} {done_2}")
    print()


def run(args: argparse.Namespace) -> None:
    settings.validate_required_settings()
    conn = get_db_connection()
    initialize_db(conn)

    if args.status:
        print_status(conn)
        return

    selected = sorted(args.api) if args.api else [1, 2, 3]

    if args.reset:
        print("[RESET] Resetting api_call flags for API(s):", selected)
        for n in selected:
            reset_api_flag(conn, n)
        print("[RESET] Done.\n")

    timeframe = None
    if 1 in selected:
        timeframe = build_timeframe(args)
        if "key" in timeframe:
            print(f"[INFO] Timeframe: preset={timeframe['key']}\n")
        else:
            print(f"[INFO] Timeframe: {timeframe['start']} → {timeframe['end']}\n")

    if args.limit and any(n in selected for n in [2, 3]):
        print(f"[INFO] Limit: {args.limit} campaigns\n")

    for api_num in selected:
        # --- API 1 ---
        if api_num == 1:
            if is_api_done(conn, 1):
                print("[SKIP] API 1 — already completed. Use --reset --api 1 to re-fetch.")
                continue
            print("[RUN]  API 1 — campaign_values_report...")
            try:
                rows = fetch_campaign_values_report(timeframe)
            except Exception as exc:
                print(f"[FAIL] API 1 — {exc}")
                sys.exit(1)
            upsert_campaign_values(conn, rows)
            print(f"[DONE] API 1 — {len(rows)} campaigns saved\n")

        # --- API 2 ---
        elif api_num == 2:
            campaign_ids = get_pending_campaign_ids(conn, limit=args.limit)
            if not campaign_ids:
                if is_api_done(conn, 2):
                    print("[SKIP] API 2 — all campaigns already have messages. Use --reset --api 2 to re-fetch.")
                else:
                    print("[SKIP] API 2 — no campaigns in DB. Run API 1 first.")
                continue
            print(f"[RUN]  API 2 — campaign_messages ({len(campaign_ids)} pending)...")
            try:
                rows = fetch_campaign_messages(campaign_ids)
            except Exception as exc:
                print(f"[FAIL] API 2 — {exc}")
                sys.exit(1)
            update_campaign_messages(conn, rows)
            print(f"[DONE] API 2 — {len(rows)} campaign messages saved\n")

        # --- API 3 ---
        elif api_num == 3:
            messages = get_pending_campaign_messages(conn, limit=args.limit)
            if not messages:
                if is_api_done(conn, 3):
                    print("[SKIP] API 3 — all templates already saved. Use --reset --api 3 to re-fetch.")
                else:
                    print("[SKIP] API 3 — no campaign messages in DB. Run API 2 first.")
                continue
            print(f"[RUN]  API 3 — fetch_templates ({len(messages)} pending)...")
            try:
                saved = fetch_templates(messages)
            except Exception as exc:
                print(f"[FAIL] API 3 — {exc}")
                sys.exit(1)
            update_template_paths(conn, saved)
            print(f"[DONE] API 3 — {len(saved)} templates saved\n")

    print("--- Status ---")
    print_status(conn)


if __name__ == "__main__":
    args = parse_args()
    run(args)
