"""
Build AI context snapshot from Supabase campaigns data.
Saves to: supabase/functions/ai-insights/context.json

Run: python build_ai_context.py
Re-run whenever new campaigns are added.
"""
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from db.repository import get_db_connection

OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "supabase", "functions", "ai-insights", "context.json"
)


def build():
    client = get_db_connection()

    print("Fetching all campaigns from Supabase...")
    resp = client.table("campaigns").select(
        "campaign_id, label, subject, send_time, send_channel, "
        "open_rate, click_rate, conversion_value, click_to_open_rate, screenshot_path"
    ).not_.is_("send_time", "null").order("send_time").execute()

    rows = resp.data or []
    print(f"  {len(rows)} campaigns fetched")

    # --- Monthly grouping ---
    monthly_map = defaultdict(list)
    for r in rows:
        ym = r["send_time"][:7]  # YYYY-MM
        monthly_map[ym].append(r)

    monthly = {}
    for ym, campaigns in sorted(monthly_map.items()):
        valid_open  = [c for c in campaigns if c["open_rate"] is not None]
        valid_click = [c for c in campaigns if c["click_rate"] is not None]
        top = sorted(valid_open, key=lambda x: x["open_rate"], reverse=True)[:5]

        monthly[ym] = {
            "count": len(campaigns),
            "avg_open_rate":  round(sum(c["open_rate"] or 0 for c in campaigns) / max(len(valid_open), 1), 4),
            "avg_click_rate": round(sum(c["click_rate"] or 0 for c in campaigns) / max(len(valid_click), 1), 4),
            "total_revenue":  round(sum(c["conversion_value"] or 0 for c in campaigns), 2),
            "top_campaigns": [
                {
                    "label":           c.get("label"),
                    "subject":         c.get("subject"),
                    "open_rate":       round(c["open_rate"] or 0, 4),
                    "click_rate":      round(c["click_rate"] or 0, 4),
                    "revenue":         round(c["conversion_value"] or 0, 2),
                    "screenshot_path": c.get("screenshot_path"),
                }
                for c in top
            ],
        }

    # --- Global top 20 lists ---
    def top20(sort_key):
        valid = [r for r in rows if r.get(sort_key) is not None]
        return [
            {
                "campaign_id":   r["campaign_id"],
                "label":         r.get("label"),
                "subject":       r.get("subject"),
                "send_time":     r.get("send_time"),
                "open_rate":     round(r["open_rate"] or 0, 4),
                "click_rate":    round(r["click_rate"] or 0, 4),
                "revenue":       round(r["conversion_value"] or 0, 2),
                "cto_rate":      round(r["click_to_open_rate"] or 0, 4),
                "screenshot_path": r.get("screenshot_path"),
            }
            for r in sorted(valid, key=lambda x: x[sort_key], reverse=True)[:20]
        ]

    # --- All subject lines with metrics (for pattern analysis) ---
    all_subjects = [
        {
            "subject":    r.get("subject"),
            "label":      r.get("label"),
            "open_rate":  round(r["open_rate"] or 0, 4),
            "click_rate": round(r["click_rate"] or 0, 4),
            "revenue":    round(r["conversion_value"] or 0, 2),
            "month":      r["send_time"][:7],
        }
        for r in rows if r.get("subject")
    ]
    all_subjects.sort(key=lambda x: x["open_rate"], reverse=True)

    # --- Build context ---
    send_times = [r["send_time"] for r in rows if r.get("send_time")]
    context = {
        "built_at":        datetime.now(timezone.utc).isoformat(),
        "total_campaigns": len(rows),
        "date_range": {
            "earliest": min(send_times)[:10] if send_times else None,
            "latest":   max(send_times)[:10] if send_times else None,
        },
        "channels": list(set(r["send_channel"] for r in rows if r.get("send_channel"))),
        "months_available": sorted(monthly.keys()),
        "monthly":          monthly,
        "top_by_open_rate": top20("open_rate"),
        "top_by_click_rate": top20("click_rate"),
        "top_by_revenue":    top20("conversion_value"),
        "all_subjects":      all_subjects,
    }

    # --- Save ---
    out_path = os.path.abspath(OUTPUT_PATH)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(context, f, indent=2, ensure_ascii=False)

    size_kb = os.path.getsize(out_path) / 1024
    print(f"\nContext saved to: {out_path}")
    print(f"  Total campaigns : {len(rows)}")
    print(f"  Months covered  : {len(monthly)}")
    print(f"  File size       : {size_kb:.1f} KB")
    print(f"  Built at        : {context['built_at']}")


if __name__ == "__main__":
    build()
