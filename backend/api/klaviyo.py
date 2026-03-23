import os

from api import client
from config import settings
from supabase import create_client as _sb_create

_sb = _sb_create(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

_ROOT        = os.path.dirname(os.path.dirname(__file__))
_SCREENSHOTS = os.path.join(_ROOT, "screenshots")
os.makedirs(_SCREENSHOTS, exist_ok=True)


def _capture_screenshot(html_path: str, campaign_id: str) -> str | None:
    """
    Render the HTML file with Playwright, save a full-page PNG locally,
    and upload it to Supabase Storage screenshots bucket.
    Returns the local PNG path, or None on failure.
    """
    png_path = os.path.join(_SCREENSHOTS, f"{campaign_id}.png")
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 800, "height": 1})
            page.goto(f"file:///{html_path.replace(os.sep, '/')}")
            page.wait_for_timeout(1000)
            page.screenshot(path=png_path, full_page=True)
            browser.close()
        print(f"  [screenshot] saved {png_path}")
    except Exception as e:
        print(f"  [screenshot] failed for {campaign_id}: {e}")
        return None

    # Upload PNG to Supabase Storage
    storage_url = None
    try:
        with open(png_path, "rb") as f:
            _sb.storage.from_("screenshots").upload(
                f"{campaign_id}.png",
                f.read(),
                file_options={"content-type": "image/png", "upsert": "true"},
            )
        storage_url = _sb.storage.from_("screenshots").get_public_url(f"{campaign_id}.png")
        print(f"  [storage] uploaded screenshots/{campaign_id}.png")
    except Exception as e:
        print(f"  [storage] screenshot upload failed for {campaign_id}: {e}")

    # Save public URL to DB
    if storage_url:
        try:
            _sb.table("campaigns").update({"screenshot_path": storage_url}).eq("campaign_id", campaign_id).execute()
        except Exception as e:
            print(f"  [db] screenshot_path update failed for {campaign_id}: {e}")

    return png_path


def _build_campaign_values_payload(timeframe: dict) -> dict:
    return {
        "data": {
            "type": "campaign-values-report",
            "attributes": {
                "statistics": settings.STATISTICS,
                "timeframe": timeframe,
                "conversion_metric_id": settings.CONVERSION_METRIC_ID,
            },
        }
    }


def fetch_campaign_values_report(timeframe: dict) -> list:
    """
    Fetches the Campaign Values Report from Klaviyo.

    Response shape:
        data.attributes.results[]
            .groupings  → send_channel, campaign_id
            .statistics → open_rate, click_rate, conversion_value, click_to_open_rate
        links.next → cursor URL for next page (null when done)

    timeframe examples:
        {"key": "last_30_days"}
        {"start": "2025-01-01T00:00:00", "end": "2025-12-31T23:59:59"}
    """
    url = f"{settings.BASE_URL}/campaign-values-reports"
    payload = _build_campaign_values_payload(timeframe)

    timeframe_start = timeframe.get("start", timeframe.get("key", ""))
    timeframe_end = timeframe.get("end", "")

    rows = []
    first_page = True
    next_url = url

    while next_url:
        if first_page:
            response = client.post(url, payload)
            first_page = False
        else:
            # Subsequent pages: GET with cursor (delay handled inside client.get)
            response = client.get(next_url)

        # data.attributes.results[] holds the actual rows
        results = (
            response.get("data", {})
            .get("attributes", {})
            .get("results", [])
        )

        for result in results:
            groupings = result.get("groupings", {})
            statistics = result.get("statistics", {})

            rows.append({
                "campaign_id": groupings.get("campaign_id", ""),
                "send_channel": groupings.get("send_channel"),
                "open_rate": statistics.get("open_rate"),
                "click_rate": statistics.get("click_rate"),
                "conversion_value": statistics.get("conversion_value"),
                "click_to_open_rate": statistics.get("click_to_open_rate"),
                "timeframe_start": timeframe_start,
                "timeframe_end": timeframe_end,
            })

        # links.next is null when there are no more pages
        links = response.get("links", {})
        next_url = links.get("next") or None

    return rows


def fetch_campaign_messages(campaign_ids: list) -> list:
    """
    For each campaign_id, GETs /api/campaigns/{id}/campaign-messages.

    Response shape: data[] (list) — each item has:
        .id                                          → campaign_message_id
        .relationships.campaign.data.id              → campaign_id
        .attributes.definition.label                 → label
        .attributes.definition.content.subject       → subject
        .relationships.template.links.related        → template_link
        .relationships.image.links.related           → image_link
        links.next                                   → pagination cursor (usually null)

    Returns a flat list of dicts across all campaign_ids.
    """
    rows = []

    for campaign_id in campaign_ids:
        print(f"  [fetch] campaign_messages for {campaign_id}")
        next_url = f"{settings.BASE_URL}/campaigns/{campaign_id}/campaign-messages"

        while next_url:
            response = client.get(next_url)

            for item in response.get("data", []):
                campaign_message_id = item.get("id", "")
                attrs = item.get("attributes", {})
                definition = attrs.get("definition", {})
                label = definition.get("label")
                subject = (
                    definition.get("content", {})
                    .get("subject")
                )
                rels = item.get("relationships", {})
                template_link = (
                    rels.get("template", {})
                    .get("links", {})
                    .get("related")
                )
                image_link = (
                    rels.get("image", {})
                    .get("links", {})
                    .get("related")
                )
                rel_campaign_id = (
                    rels.get("campaign", {})
                    .get("data", {})
                    .get("id", campaign_id)
                )

                rows.append({
                    "campaign_message_id": campaign_message_id,
                    "campaign_id": rel_campaign_id,
                    "label": label,
                    "subject": subject,
                    "template_link": template_link,
                    "image_link": image_link,
                    "send_time": attrs.get("created_at"),
                })

            next_url = response.get("links", {}).get("next") or None

    return rows


def fetch_templates(campaign_messages: list) -> list:
    """
    For each campaign message, GETs the template_link URL and saves the HTML
    to templates/{campaign_id}.html.

    campaign_messages: list of dicts with keys: campaign_id, campaign_message_id, template_link

    Returns a list of dicts: {campaign_id, campaign_message_id, file_path}
    """
    import os

    output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")
    os.makedirs(output_dir, exist_ok=True)

    saved = []

    for msg in campaign_messages:
        campaign_id = msg["campaign_id"]
        campaign_message_id = msg["campaign_message_id"]
        template_link = msg.get("template_link")

        if not template_link:
            print(f"  [skip] No template_link for campaign {campaign_id}")
            continue

        print(f"  [fetch] template for campaign {campaign_id}")
        response = client.get(template_link)

        html = (
            response.get("data", {})
            .get("attributes", {})
            .get("html", "")
        )

        if not html:
            print(f"  [warn] Empty HTML for campaign {campaign_id}")
            continue

        file_path = os.path.join(output_dir, f"{campaign_id}.html")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  [saved] {file_path}")

        # Upload to Supabase Storage so the frontend can serve it without Flask
        try:
            _sb.storage.from_("templates").upload(
                f"{campaign_id}.html",
                html.encode("utf-8"),
                file_options={"content-type": "text/html; charset=utf-8", "upsert": "true"},
            )
            print(f"  [storage] uploaded templates/{campaign_id}.html")
        except Exception as e:
            print(f"  [storage] upload failed for {campaign_id}: {e}")

        _capture_screenshot(file_path, campaign_id)

        saved.append({
            "campaign_id": campaign_id,
            "campaign_message_id": campaign_message_id,
            "file_path": file_path,
        })

    return saved
