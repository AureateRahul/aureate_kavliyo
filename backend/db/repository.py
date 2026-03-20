import time
from supabase import create_client, Client
from config import settings


def get_db_connection() -> Client:
    """Return a Supabase client using the service-role key (bypasses RLS)."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


# ---------------------------------------------------------------------------
# API 1 — Campaign Values
# ---------------------------------------------------------------------------

def upsert_campaign_values(client: Client, rows: list) -> None:
    """
    Inserts API 1 data, updating on conflict with campaign_id.
    Only the provided columns are updated on conflict (api_call_2/3 untouched).
    """
    payload = [
        {
            "campaign_id":        r["campaign_id"],
            "send_channel":       r["send_channel"],
            "open_rate":          r["open_rate"],
            "click_rate":         r["click_rate"],
            "conversion_value":   r["conversion_value"],
            "click_to_open_rate": r["click_to_open_rate"],
            "timeframe_start":    r["timeframe_start"],
            "timeframe_end":      r["timeframe_end"],
            "api_call_1":         1,
        }
        for r in rows
    ]
    client.table("campaigns").upsert(payload, on_conflict="campaign_id").execute()


# ---------------------------------------------------------------------------
# API 2 — Campaign Messages
# ---------------------------------------------------------------------------

def update_campaign_messages(client: Client, rows: list) -> None:
    """
    Updates campaign rows with API 2 data.  One request per row.
    Sets api_call_2=1 for each matched campaign_id.
    """
    for r in rows:
        client.table("campaigns").update({
            "campaign_message_id": r["campaign_message_id"],
            "label":               r.get("label"),
            "subject":             r["subject"],
            "template_link":       r["template_link"],
            "image_link":          r["image_link"],
            "send_time":           r.get("send_time"),
            "api_call_2":          1,
        }).eq("campaign_id", r["campaign_id"]).execute()


def get_pending_campaign_ids(client: Client, limit: int = None) -> list:
    """Returns campaign_ids where api_call_1=1 AND api_call_2=0."""
    q = (
        client.table("campaigns")
        .select("campaign_id")
        .eq("api_call_1", 1)
        .eq("api_call_2", 0)
        .order("campaign_id")
    )
    if limit:
        q = q.limit(limit)
    result = q.execute()
    return [r["campaign_id"] for r in result.data]


# ---------------------------------------------------------------------------
# API 3 — Template HTML
# ---------------------------------------------------------------------------

def update_template_paths(client: Client, saved: list) -> None:
    """
    Updates template_file_path and sets api_call_3=1.
    saved: list of {campaign_id, file_path}
    Retries up to 3 times on transient network errors.
    """
    for s in saved:
        for attempt in range(3):
            try:
                client.table("campaigns").update({
                    "template_file_path": s["file_path"],
                    "api_call_3":         1,
                }).eq("campaign_id", s["campaign_id"]).execute()
                break
            except Exception as e:
                if attempt < 2:
                    print(f"  [retry] DB update failed ({e}), retrying in 5s...")
                    time.sleep(5)
                else:
                    raise


def get_pending_campaign_messages(client: Client, limit: int = None) -> list:
    """Returns rows where api_call_2=1 AND api_call_3=0."""
    q = (
        client.table("campaigns")
        .select("campaign_id, campaign_message_id, template_link")
        .eq("api_call_2", 1)
        .eq("api_call_3", 0)
        .order("campaign_id")
    )
    if limit:
        q = q.limit(limit)
    return q.execute().data


# ---------------------------------------------------------------------------
# Status / tracking helpers
# ---------------------------------------------------------------------------

def is_api_done(client: Client, api_num: int) -> bool:
    """
    API 1: done if any rows exist with api_call_1=1.
    API 2: done if no rows pending (api_call_1=1 AND api_call_2=0).
    API 3: done if no rows pending (api_call_2=1 AND api_call_3=0).
    """
    if api_num == 1:
        r = (client.table("campaigns")
             .select("*", count="exact")
             .eq("api_call_1", 1)
             .limit(1)
             .execute())
        return (r.count or 0) > 0
    elif api_num == 2:
        r = (client.table("campaigns")
             .select("*", count="exact")
             .eq("api_call_1", 1)
             .eq("api_call_2", 0)
             .limit(1)
             .execute())
        return (r.count or 0) == 0
    elif api_num == 3:
        r = (client.table("campaigns")
             .select("*", count="exact")
             .eq("api_call_2", 1)
             .eq("api_call_3", 0)
             .limit(1)
             .execute())
        return (r.count or 0) == 0
    return False


def reset_api_flag(client: Client, api_num: int) -> None:
    """Reset the api_call_N flag to 0 for all rows."""
    (client.table("campaigns")
     .update({f"api_call_{api_num}": 0})
     .gte("id", 1)
     .execute())


def get_status_summary(client: Client) -> dict:
    """Returns counts for status display."""
    total  = _count(client)
    done_1 = _count(client, api_call_1=1)
    done_2 = _count(client, api_call_2=1)
    done_3 = _count(client, api_call_3=1)
    pend_2 = _count(client, api_call_1=1, api_call_2=0)
    pend_3 = _count(client, api_call_2=1, api_call_3=0)
    return {
        "total":     total,
        "done_1":    done_1,
        "pending_2": pend_2,
        "done_2":    done_2,
        "pending_3": pend_3,
        "done_3":    done_3,
    }


def _count(client: Client, **filters) -> int:
    q = client.table("campaigns").select("*", count="exact")
    for col, val in filters.items():
        q = q.eq(col, val)
    return q.limit(1).execute().count or 0
