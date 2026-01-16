import time
import hmac
import hashlib
import json
from typing import Dict
import requests


class APITransmitter:
    def __init__(self, base_url: str, api_token: str, market_id: str, hmac_secret: str):
        self.base_url = base_url.rstrip("/")
        self.api_token = api_token
        self.market_id = market_id
        self.hmac_secret = hmac_secret

    def send_invoice(self, payload: Dict) -> bool:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_token}",
            "X-Agent-Version": "1.0.0",
            "X-Market-ID": self.market_id,
            "X-Signature": self._generate_signature(payload),
        }

        for attempt in range(5):
            try:
                response = requests.post(
                    f"{self.base_url}/api/v1/ingest/invoice",
                    json=payload,
                    headers=headers,
                    timeout=30,
                )
                response.raise_for_status()
                return True
            except requests.exceptions.RequestException:
                time.sleep(2 ** attempt)

        return False

    def _generate_signature(self, payload: Dict) -> str:
        body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        digest = hmac.new(self.hmac_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        return digest
