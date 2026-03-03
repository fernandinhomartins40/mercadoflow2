import time
import hmac
import hashlib
import json
from typing import Dict
import requests


class APITransmitter:
    def __init__(self, base_url: str, api_key: str, market_id: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.market_id = market_id

    def get_agent_profile(self) -> Dict:
        headers = {
            "X-API-Key": self.api_key,
        }
        response = requests.get(
            f"{self.base_url}/api/v1/agent/me",
            headers=headers,
            timeout=20,
        )
        response.raise_for_status()
        return response.json()

    def check_invoice_presence(self, chaves_nfe: list[str]) -> Dict:
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
        }
        response = requests.post(
            f"{self.base_url}/api/v1/agent/invoices/presence",
            headers=headers,
            json={"chavesNFe": chaves_nfe},
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json() or {}
        return {
            "present": payload.get("present") or [],
            "missing": payload.get("missing") or [],
        }

    def send_invoice(self, payload: Dict) -> bool:
        body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        timestamp = str(int(time.time()))
        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
            "X-Agent-Version": "1.0.0",
            "X-Request-Timestamp": timestamp,
            "X-Signature": self._generate_signature(body),
        }
        if self.market_id:
            headers["X-Market-ID"] = self.market_id

        last_exception = None
        for attempt in range(5):
            try:
                response = requests.post(
                    f"{self.base_url}/api/v1/ingest/invoice",
                    data=body,
                    headers=headers,
                    timeout=30,
                )
                if not response.ok:
                    detail = response.text.strip()
                    raise requests.exceptions.HTTPError(
                        f"HTTP {response.status_code}: {detail or response.reason}",
                        response=response,
                    )

                try:
                    payload = response.json()
                except ValueError:
                    return True

                status = str(payload.get("status") or "").upper()
                if status in {"SUCCESS", "DUPLICATE"}:
                    return True

                message = str(payload.get("message") or response.text or "Unknown ingest error").strip()
                raise RuntimeError(f"Ingest rejected with status={status or 'UNKNOWN'}: {message}")
                return True
            except (requests.exceptions.RequestException, RuntimeError) as exc:
                last_exception = exc
                # Avoid sleeping after the final attempt.
                if attempt < 4:
                    time.sleep(2 ** attempt)

        if last_exception is not None:
            raise last_exception
        return False

    def send_heartbeat(self) -> bool:
        headers = {
            "X-API-Key": self.api_key,
        }
        try:
            response = requests.post(
                f"{self.base_url}/api/v1/agent/heartbeat",
                headers=headers,
                timeout=10,
            )
            response.raise_for_status()
            return True
        except requests.exceptions.RequestException:
            return False

    def _generate_signature(self, body: bytes) -> str:
        digest = hmac.new(self.api_key.encode("utf-8"), body, hashlib.sha256).hexdigest()
        return digest
