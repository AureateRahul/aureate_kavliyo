from supabase import Client

# Logical API numbers used throughout the app
API_NUMBERS = [1, 2, 3]

# Run this once in the Supabase SQL Editor to create the table:
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS campaigns (
    id                  BIGSERIAL PRIMARY KEY,
    campaign_id         TEXT NOT NULL UNIQUE,

    -- API 1: Campaign Values Report
    send_channel        TEXT,
    open_rate           DOUBLE PRECISION,
    click_rate          DOUBLE PRECISION,
    conversion_value    DOUBLE PRECISION,
    click_to_open_rate  DOUBLE PRECISION,
    timeframe_start     TEXT,
    timeframe_end       TEXT,

    -- API 2: Campaign Messages
    campaign_message_id TEXT,
    subject             TEXT,
    template_link       TEXT,
    image_link          TEXT,

    -- API 3: Template HTML file
    template_file_path  TEXT,

    -- Tracking flags (0 = pending, 1 = done)
    api_call_1          INTEGER NOT NULL DEFAULT 0,
    api_call_2          INTEGER NOT NULL DEFAULT 0,
    api_call_3          INTEGER NOT NULL DEFAULT 0,

    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


def initialize_db(client: Client) -> None:
    """
    Verifies the campaigns table is reachable.
    The table must already exist in Supabase (created via the SQL editor
    or automatically by migrate_to_supabase.py on first run).
    """
    try:
        client.table("campaigns").select("id").limit(1).execute()
    except Exception as e:
        raise RuntimeError(
            "Cannot reach the 'campaigns' table in Supabase.\n"
            "If this is your first run, execute the SQL in db/schema.py "
            f"inside the Supabase SQL Editor.\nOriginal error: {e}"
        )
