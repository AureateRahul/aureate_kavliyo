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

if not API_KEY:
    raise ValueError("KLAVIYO_API_KEY is not set. Check your .env file.")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
