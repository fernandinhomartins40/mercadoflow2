"""Configuração local (chave e câmeras, cifradas pelo Windows) e conversa com o MercadoFlow."""
from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

API = os.environ.get("MERCADOFLOW_API", "https://mercadoflow.com/api/v1")
HOME = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "MercadoFlowCameras")


def _dpapi(data: bytes, encrypt: bool) -> bytes:
    """A chave da loja e a senha das câmeras só abrem nesta conta deste Windows."""
    import ctypes
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    src = Blob(len(data), ctypes.cast(ctypes.create_string_buffer(data, len(data)), ctypes.POINTER(ctypes.c_char)))
    out = Blob()
    fn = ctypes.windll.crypt32.CryptProtectData if encrypt else ctypes.windll.crypt32.CryptUnprotectData
    if not fn(ctypes.byref(src), None, None, None, None, 0, ctypes.byref(out)):
        raise OSError("Não foi possível abrir os dados protegidos deste computador.")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out.pbData)


def protect(text: str) -> str:
    if sys.platform != "win32":  # shortcut: só o desenvolvimento roda fora do Windows
        return text
    return base64.b64encode(_dpapi(text.encode(), True)).decode()


def unprotect(text: str) -> str:
    if sys.platform != "win32":
        return text
    return _dpapi(base64.b64decode(text), False).decode()


class Config:
    def __init__(self, home: str = HOME):
        self.home = home
        os.makedirs(home, exist_ok=True)
        self.path = os.path.join(home, "config.json")
        self.data = {"secret": "", "accepted_notice": False, "cameras": []}
        if os.path.exists(self.path):
            with open(self.path, encoding="utf-8") as f:
                self.data.update(json.load(f))
        self.cameras = [dict(c, source=unprotect(c["source"])) for c in self.data["cameras"]]

    @property
    def key(self) -> str:
        return unprotect(self.data["secret"]) if self.data["secret"] else ""

    @key.setter
    def key(self, value: str) -> None:
        self.data["secret"] = protect(value.strip())

    def add_camera(self, name: str, source: str) -> dict:
        cam = {"id": uuid.uuid4().hex[:12], "name": name.strip(), "source": source.strip(), "image_points": [], "plan_points": []}
        self.cameras.append(cam)
        return cam

    def save(self) -> None:
        self.data["cameras"] = [dict(c, source=protect(c["source"])) for c in self.cameras]
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.data, f)
        os.replace(tmp, self.path)

    def state_path(self, cam_id: str) -> str:
        return os.path.join(self.home, f"movimento-{cam_id}.json")


class ApiError(Exception):
    pass


def _call(method: str, path: str, key: str, body=None):
    req = urllib.request.Request(
        API + path, method=method, data=None if body is None else json.dumps(body).encode(),
        headers={"X-API-Key": key, "Content-Type": "application/json", "User-Agent": "MercadoFlowCameras/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise ApiError("A chave não foi aceita. Gere outra em Vender → Planta e prateleiras → Movimento.") from e
        raise ApiError(f"O MercadoFlow respondeu com erro ({e.code}).") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ApiError("Sem conexão com o MercadoFlow. Os números ficam guardados e saem depois.") from e


def fetch_plan(key: str) -> dict | None:
    return _call("GET", "/agent/store-traffic/plan", key).get("plan")


def upload(key: str, camera_id: str, buckets: list) -> None:
    _call("POST", "/agent/store-traffic", key, {"cameraId": camera_id, "buckets": buckets})
