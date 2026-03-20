"""
Backfill script: generate PNG screenshots for templates already saved locally
and upload them to Supabase Storage screenshots bucket.

Run once after the initial data migration to cover campaigns where api_call_3=1
but no screenshot PNG exists yet.
"""
import os
import glob

# Add project root to path so we can import api.klaviyo
import sys
sys.path.insert(0, os.path.dirname(__file__))

from api.klaviyo import _capture_screenshot

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")

def main():
    html_files = glob.glob(os.path.join(TEMPLATES_DIR, "*.html"))
    if not html_files:
        print("No HTML templates found in", TEMPLATES_DIR)
        return

    print(f"Found {len(html_files)} template(s). Generating screenshots...\n")
    ok = 0
    fail = 0
    for html_path in html_files:
        campaign_id = os.path.splitext(os.path.basename(html_path))[0]
        print(f"[{campaign_id}]")
        result = _capture_screenshot(html_path, campaign_id)
        if result:
            ok += 1
        else:
            fail += 1

    print(f"\nDone: {ok} succeeded, {fail} failed.")

if __name__ == "__main__":
    main()
