import random
import time

import requests

from config import settings

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 11.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
]

_session = requests.Session()


def _random_delay(min_s: float = 1.0, max_s: float = 5.0) -> None:
    delay = random.uniform(min_s, max_s)
    print(f"  [delay] Waiting {delay:.1f}s before request...")
    time.sleep(delay)


def _base_headers(include_content_type: bool = True) -> dict:
    headers = {
        "revision": "2026-01-15",
        "Accept": "application/vnd.api+json",
        "Authorization": f"Klaviyo-API-Key {settings.API_KEY}",
        "User-Agent": random.choice(USER_AGENTS),
    }
    if include_content_type:
        headers["Content-Type"] = "application/vnd.api+json"
    return headers


def post(url: str, payload: dict, *, min_delay: float = 1.0, max_delay: float = 5.0) -> dict:
    _random_delay(min_delay, max_delay)
    headers = _base_headers(include_content_type=True)
    response = _session.post(url, json=payload, headers=headers)
    response.raise_for_status()
    return response.json()


def get(url: str, *, min_delay: float = 1.0, max_delay: float = 5.0) -> dict:
    _random_delay(min_delay, max_delay)
    headers = _base_headers(include_content_type=False)
    response = _session.get(url, headers=headers)
    response.raise_for_status()
    return response.json()
