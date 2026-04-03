import os
from dotenv import load_dotenv

load_dotenv()

API_KEY: str = os.getenv("KLAVIYO_API_KEY", "")
BASE_URL: str = "https://a.klaviyo.com/api"
CONVERSION_METRIC_ID: str = "XL5ZiC"
STATISTICS: list = [
    "open_rate",
    "click_rate",
    "conversion_value",
    "click_to_open_rate",
]

# Supabase
SUPABASE_URL: str         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")

# Anthropic
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

def validate_required_settings(require_anthropic: bool = False) -> None:
    if not API_KEY:
        raise ValueError("KLAVIYO_API_KEY is not set. Check your environment variables.")

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in your environment variables.")

    if require_anthropic and not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY is not set.")
