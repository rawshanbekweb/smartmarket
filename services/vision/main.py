"""SMART MARKET vision service — skeleton.

Modes:
  demo  : random states for pipeline testing (NOT real detection)
  rtsp  : planned Hikvision/RTSP integration (raises NotImplementedError)

The service only reports occupancy and camera health. It has no access to payments.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import time
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone

API = os.environ.get("SMART_MARKET_API", "http://localhost:4000")
KEY = os.environ.get("VISION_API_KEY", "")


def call(method: str, path: str, body: dict | None = None) -> dict | list:
    req = urllib.request.Request(
        f"{API}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", "X-Internal-Api-Key": KEY},
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())


@dataclass
class Zone:
    code: str
    polygon: list | None


class OccupancyDetector:
    """Interface for a real detector. Implement `classify(frame, zone) -> (state, confidence)`."""

    def classify(self, frame, zone: Zone) -> tuple[str, float]:  # pragma: no cover - interface
        raise NotImplementedError


class DemoDetector(OccupancyDetector):
    def classify(self, frame, zone: Zone) -> tuple[str, float]:
        return ("OCCUPIED" if random.random() < 0.75 else "FREE", round(random.uniform(0.8, 0.99), 2))


class RtspSource:
    """Planned: open the stream referenced by streamConfigRef with OpenCV (cv2.VideoCapture)."""

    def __init__(self, stream_config_ref: str | None):
        self.ref = stream_config_ref

    def read(self):
        raise NotImplementedError(
            "RTSP/Hikvision integration is not implemented yet. "
            "Resolve the URL from env var named by streamConfigRef and use cv2.VideoCapture."
        )


def run_once(mode: str) -> None:
    cameras = call("GET", "/api/internal/vision/config")
    detector = DemoDetector()
    now = datetime.now(timezone.utc).isoformat()
    for cam in cameras:
        frame = None
        if mode == "rtsp":
            frame = RtspSource(cam.get("streamConfigRef")).read()
        zones = [Zone(z["zoneCode"], z.get("polygon")) for z in cam["zones"]]
        observations = []
        for z in zones:
            state, conf = detector.classify(frame, z)
            observations.append({"zoneCode": z.code, "state": state, "confidence": conf, "observedAt": now})
        res = call("POST", "/api/internal/vision/observations", {"cameraCode": cam["cameraCode"], "frameAt": now, "observations": observations})
        print(f"{cam['cameraCode']}: accepted={res['accepted']} rejected={len(res['rejected'])}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--mode", choices=["demo", "rtsp"], default="demo")
    p.add_argument("--once", action="store_true")
    p.add_argument("--interval", type=int, default=30)
    a = p.parse_args()
    if not KEY:
        raise SystemExit("VISION_API_KEY is required")
    while True:
        run_once(a.mode)
        if a.once:
            break
        time.sleep(a.interval)


if __name__ == "__main__":
    main()
