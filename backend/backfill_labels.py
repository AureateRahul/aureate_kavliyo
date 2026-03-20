"""
Backfill script: fetch label for campaigns where api_call_2=1 but label IS NULL.
Hits the campaign-messages endpoint for each campaign and updates label in Supabase.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from db.repository import get_db_connection
from api.klaviyo import fetch_campaign_messages

def main():
    client = get_db_connection()

    # Get campaigns that have api_call_2 done but label not yet populated
    resp = (
        client.table("campaigns")
        .select("campaign_id")
        .eq("api_call_2", 1)
        .is_("label", "null")
        .execute()
    )
    rows = resp.data or []

    if not rows:
        print("No campaigns need label backfill.")
        return

    campaign_ids = [r["campaign_id"] for r in rows]
    print(f"Backfilling label for {len(campaign_ids)} campaign(s)...\n")

    messages = fetch_campaign_messages(campaign_ids)

    updated = 0
    for msg in messages:
        if not msg.get("label"):
            continue
        client.table("campaigns").update({
            "label": msg["label"]
        }).eq("campaign_id", msg["campaign_id"]).execute()
        print(f"  [updated] {msg['campaign_id']} : {msg['label']}")
        updated += 1

    print(f"\nDone: {updated} row(s) updated.")

if __name__ == "__main__":
    main()
