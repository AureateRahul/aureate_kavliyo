import time
from supabase import create_client, Client
from config import settings


def _to_float(value, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def apply_cost_roas(rows: list, per_email_cost: float) -> list:
    """
    Adds derived fields for each API 1 row:
      - total_sent (from recipients)
      - cost       = total_sent * per_email_cost
      - roas       = conversion_value / cost  (None when cost <= 0)
    """
    computed = []
    cost_per_email = _to_float(per_email_cost, 0.0)

    for r in rows:
        total_sent = _to_int(r.get("total_sent"), 0)
        conversion_value = _to_float(r.get("conversion_value"), 0.0)
        total_cost = total_sent * cost_per_email
        roas = (conversion_value / total_cost) if total_cost > 0 else None

        out = dict(r)
        out["total_sent"] = total_sent
        out["cost"] = total_cost
        out["roas"] = roas
        computed.append(out)

    return computed


def get_db_connection() -> Client:
    """Return a Supabase client using the service-role key (bypasses RLS)."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise RuntimeError("Supabase environment variables are not configured")
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def get_user_per_email_cost(client: Client, user_id: str = "") -> float | None:
    """
    Reads global per_email_cost from user_profiles singleton row (id=1).
    Returns None if missing or unavailable.
    """
    data = None

    try:
        result = (
            client.table("user_profiles")
            .select("per_email_cost")
            .eq("id", 1)
            .limit(1)
            .execute()
        )
        data = result.data
    except Exception:
        data = None

    if not data:
        try:
            # Last fallback: first available row
            result = client.table("user_profiles").select("per_email_cost").order("id").limit(1).execute()
            data = result.data
        except Exception:
            data = None

    if not data:
        return None
    return _to_float(data[0].get("per_email_cost"), 0.0)


def set_user_per_email_cost(client: Client, user_id: str = "", per_email_cost: float = 0.0) -> float:
    """
    Updates global per_email_cost in user_profiles singleton row (id=1).
    Returns the normalized saved value.
    """
    value = _to_float(per_email_cost, 0.0)

    client.table("user_profiles").upsert(
        {"id": 1, "per_email_cost": str(value)},
        on_conflict="id"
    ).execute()

    return value


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
            "total_sent":         r.get("total_sent"),
            "cost":               r.get("cost"),
            "roas":               r.get("roas"),
            "timeframe_start":    r["timeframe_start"],
            "timeframe_end":      r["timeframe_end"],
            "api_call_1":         1,
        }
        for r in rows
    ]
    client.table("campaigns").upsert(payload, on_conflict="campaign_id").execute()


def refresh_metrics_last_90_days(client: Client, rows: list) -> dict:
    """
    For each row returned by API 1 (last_90_days):
      - Existing campaign_id → UPDATE only the 4 metrics columns.
      - New campaign_id      → INSERT full row with api_call_1=1.

    Returns {"updated": int, "inserted": int}.
    """
    if not rows:
        return {"updated": 0, "inserted": 0}

    # Fetch all existing campaign_ids in one query
    incoming_ids = [r["campaign_id"] for r in rows if r.get("campaign_id")]
    existing = set()
    # Supabase `in_` filter; chunk to avoid URL-length limits
    chunk_size = 200
    for i in range(0, len(incoming_ids), chunk_size):
        chunk = incoming_ids[i : i + chunk_size]
        result = (
            client.table("campaigns")
            .select("campaign_id")
            .in_("campaign_id", chunk)
            .execute()
        )
        for rec in result.data:
            existing.add(rec["campaign_id"])

    to_update = [r for r in rows if r.get("campaign_id") in existing]
    to_insert = [r for r in rows if r.get("campaign_id") not in existing]

    # UPDATE — only the 4 metrics + updated_at (leave all other columns untouched)
    for r in to_update:
        client.table("campaigns").update({
            "open_rate":          r["open_rate"],
            "click_rate":         r["click_rate"],
            "conversion_value":   r["conversion_value"],
            "click_to_open_rate": r["click_to_open_rate"],
            "total_sent":         r.get("total_sent"),
        }).eq("campaign_id", r["campaign_id"]).execute()

        # Keep historical cost snapshots stable, but backfill old rows missing cost.
        if r.get("cost") is not None:
            try:
                (
                    client.table("campaigns")
                    .update({"cost": r.get("cost"), "roas": r.get("roas")})
                    .eq("campaign_id", r["campaign_id"])
                    .is_("cost", "null")
                    .execute()
                )
            except Exception:
                pass

    # INSERT — full row for brand-new campaigns
    if to_insert:
        insert_payload = [
            {
                "campaign_id":        r["campaign_id"],
                "send_channel":       r["send_channel"],
                "open_rate":          r["open_rate"],
                "click_rate":         r["click_rate"],
                "conversion_value":   r["conversion_value"],
                "click_to_open_rate": r["click_to_open_rate"],
                "total_sent":         r.get("total_sent"),
                "cost":               r.get("cost"),
                "roas":               r.get("roas"),
                "timeframe_start":    r["timeframe_start"],
                "timeframe_end":      r["timeframe_end"],
                "api_call_1":         1,
            }
            for r in to_insert
        ]
        client.table("campaigns").insert(insert_payload).execute()

    return {
        "updated": len(to_update),
        "inserted": len(to_insert),
        "new_campaign_ids": [r["campaign_id"] for r in to_insert if r.get("campaign_id")],
    }


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
            "template_created":    r.get("template_created"),
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


def get_null_send_time_ids(client: Client, campaign_ids: list) -> list:
    """
    Returns the subset of campaign_ids that currently have send_time IS NULL.
    Used to backfill send_time after a scheduled campaign has actually been sent.
    """
    if not campaign_ids:
        return []
    found = []
    chunk_size = 200
    for i in range(0, len(campaign_ids), chunk_size):
        chunk = campaign_ids[i : i + chunk_size]
        result = (
            client.table("campaigns")
            .select("campaign_id")
            .in_("campaign_id", chunk)
            .is_("send_time", "null")
            .execute()
        )
        found.extend(r["campaign_id"] for r in result.data)
    return found


def update_send_times(client: Client, rows: list) -> int:
    """
    Updates send_time (and template_created if present) for each row that has a non-null send_time.
    Only overwrites if the DB value is still NULL to avoid clobbering good data.
    Returns the count of rows updated.
    """
    updated = 0
    for r in rows:
        if not r.get("send_time"):
            continue
        payload = {"send_time": r["send_time"]}
        if r.get("template_created"):
            payload["template_created"] = r["template_created"]
        result = (
            client.table("campaigns")
            .update(payload)
            .eq("campaign_id", r["campaign_id"])
            .is_("send_time", "null")
            .execute()
        )
        if result.data:
            updated += len(result.data)
    return updated


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
