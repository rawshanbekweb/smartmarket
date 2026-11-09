# SMART MARKET — Vision service (future-ready skeleton)

**Status: NOT a production AI model.** This folder contains the service boundary and a
runnable stub that talks to the backend through the authenticated internal API.

## Responsibilities
1. Read camera streams (RTSP/ONVIF, Hikvision) — *planned, not connected*.
2. For each configured zone (`Z-A-01` …) decide `FREE` / `OCCUPIED` / `UNKNOWN`.
3. POST results to the backend. The AI **never** creates, confirms or cancels payments.

## Backend contract
All calls require header `X-Internal-Api-Key: $VISION_API_KEY`.

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/internal/vision/config` | Cameras, zone codes and polygons (no credentials) |
| POST | `/api/internal/vision/observations` | `{cameraCode, frameAt?, observations:[{zoneCode, state, confidence?, observedAt?}]}` |
| POST | `/api/internal/vision/heartbeat` | `{cameraCode, status: ONLINE|DEGRADED|OFFLINE, lastFrameAt?, message?}` |

Stream credentials are resolved on the vision host from `streamConfigRef` (an env/secret key name),
e.g. `HIK_CAM_01_RTSP_URL`. They are never stored in the database or sent to browsers.

## Run the stub
```bash
cd services/vision
python -m venv .venv && .venv/Scripts/activate   # Windows (Linux: source .venv/bin/activate)
pip install -r requirements.txt
set SMART_MARKET_API=http://localhost:4000
set VISION_API_KEY=dev-vision-key-change-me
python main.py --mode demo --once        # sends one simulated batch (marked as AI source)
```

`--mode demo` only produces random states for testing the pipeline. Use the dashboard's
DEMO simulator for presentations instead — it is labelled as DEMO everywhere.

## Next steps for real integration
1. Confirm camera models / firmware and RTSP channel paths on site.
2. Capture sample frames per camera; draw zone polygons per trading space (stored in `CameraZone.polygon`).
3. Choose a detector (e.g. YOLO person/goods detection + per-zone occupancy heuristic or a
   small classifier) and validate accuracy on local footage.
4. Add temporal smoothing (state must persist N frames) before reporting `OCCUPIED`.
5. Deploy on a local machine next to the NVR; only outbound HTTPS to the API is needed.
