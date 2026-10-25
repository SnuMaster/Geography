#!/usr/bin/env python3
"""Build public flight-reference geometry from recorded map observations.

The input contains public Flightradar24 playback-map pixels and calibration
metadata. The output contains only those historical flight references and
their derived geometry. No other application data is read or modified.
The screenshots themselves are inspection evidence and are not redistributed.
The geometry is not an original GPS export and contains no recorded timing.

Run from any directory:
    python tools/import-flight-reference-tracks.py
    python tools/import-flight-reference-tracks.py --check
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "japan-2027/assets/routes/flight-route-sources.json"
OUTPUT = ROOT / "japan-2027/flight-route-overrides.json"
EARTH_RADIUS_M = 6_371_008.8
MANIFEST_FIELDS = {
    "version", "retrievedAt", "provider", "basis", "isOriginalGPSExport",
    "description", "reproduction", "flights",
}
PUBLIC_FLIGHT_FIELDS = {
    "id", "flightNumber", "sourceFlightId", "referenceDate", "registration",
    "route", "aircraft", "retrievedAt", "sourceUrl", "referenceRole",
    "airportReferenceCoordinates", "endpointCoverage", "geometryNotice",
    "captures", "pathSections",
}


def distance_m(a: list[float], b: list[float]) -> float:
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlat = lat2 - lat1
    dlon = math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def simplify_pixels(points: list[list[float]], tolerance: float) -> list[list[float]]:
    """Ramer–Douglas–Peucker within the declared screenshot-pixel tolerance."""
    if len(points) <= 2:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    vx, vy = bx - ax, by - ay
    norm = vx * vx + vy * vy
    maximum, split = 0.0, 0
    for index, (x, y) in enumerate(points[1:-1], 1):
        t = max(0.0, min(1.0, ((x - ax) * vx + (y - ay) * vy) / norm)) if norm else 0.0
        d = math.hypot(x - ax - t * vx, y - ay - t * vy)
        if d > maximum:
            maximum, split = d, index
    if maximum > tolerance:
        return simplify_pixels(points[: split + 1], tolerance)[:-1] + simplify_pixels(points[split:], tolerance)
    return [points[0], points[-1]]


def finite_pair(value: object) -> bool:
    return isinstance(value, list) and len(value) == 2 and all(
        isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n)
        for n in value
    )


def validate_source(flight: dict) -> None:
    """Require an identified public historical source and valid calibration."""
    if set(flight) != PUBLIC_FLIGHT_FIELDS:
        raise ValueError("Flight manifest fields do not match the public-reference schema")
    if not re.fullmatch(r"[a-z0-9-]+", flight["id"]):
        raise ValueError("Invalid public reference ID")
    if not re.fullmatch(r"[A-Z0-9]{2,3}[0-9]{1,4}", flight["flightNumber"]):
        raise ValueError(f"{flight['id']}: invalid flight number")
    if not re.fullmatch(r"[0-9a-f]+", flight["sourceFlightId"]):
        raise ValueError(f"{flight['id']}: invalid source flight ID")
    source = urlsplit(flight["sourceUrl"])
    if (
        source.scheme != "https"
        or source.netloc != "www.flightradar24.com"
        or source.path != f"/data/flights/{flight['flightNumber'].lower()}"
        or source.fragment != flight["sourceFlightId"]
        or source.query
    ):
        raise ValueError(f"{flight['id']}: source URL does not identify the declared public flight")
    if dt.date.fromisoformat(flight["referenceDate"]) > dt.date.fromisoformat(flight["retrievedAt"]):
        raise ValueError(f"{flight['id']}: source date is after its retrieval date")
    if flight["referenceRole"] not in {"same-flight-number", "same-airport-pair"}:
        raise ValueError(f"{flight['id']}: unsupported reference role")
    if len(flight["route"]) != 2 or not all(re.fullmatch(r"[A-Z]{3}", a) for a in flight["route"]):
        raise ValueError(f"{flight['id']}: invalid public airport pair")
    airports = flight["airportReferenceCoordinates"]
    if len(airports) != 2 or not all(
        finite_pair(p) and -85 <= p[0] <= 85 and -180 <= p[1] <= 180 for p in airports
    ):
        raise ValueError(f"{flight['id']}: invalid airport reference coordinates")
    limits = flight["endpointCoverage"]["maximumAirportDistanceM"]
    if not finite_pair(limits) or not all(0 < n <= 10000 for n in limits):
        raise ValueError(f"{flight['id']}: invalid endpoint coverage limits")
    captures = flight["captures"]
    if not captures or len({c["id"] for c in captures}) != len(captures):
        raise ValueError(f"{flight['id']}: missing or duplicate capture IDs")
    for capture in captures:
        if not re.fullmatch(r"[0-9a-f]{64}", capture["sourceImageSha256"]):
            raise ValueError(f"{flight['id']}: missing capture checksum")
        for field in ("imageSize", "viewportSize"):
            if not finite_pair(capture[field]) or not all(n > 0 for n in capture[field]):
                raise ValueError(f"{flight['id']}: invalid capture dimensions")
        if not finite_pair(capture["worldPixelOrigin"]) or not isinstance(capture["zoom"], int) or not 0 <= capture["zoom"] <= 22:
            raise ValueError(f"{flight['id']}: invalid map calibration")


def pixel_to_coordinate(point: list[float], capture: dict) -> list[float]:
    # The browser screenshot is uniformly resized; its height is rounded.
    scale = capture["imageSize"][0] / capture["viewportSize"][0]
    x = point[0] / scale + capture["worldPixelOrigin"][0]
    y = point[1] / scale + capture["worldPixelOrigin"][1]
    world_size = 256 * 2 ** capture["zoom"]
    latitude = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / world_size))))
    longitude = x / world_size * 360 - 180
    if not (-85 <= latitude <= 85 and -180 <= longitude <= 180):
        raise ValueError("Observed pixel projects outside the supported map")
    return [round(latitude, 6), round(longitude, 6)]


def build_coordinates(flight: dict) -> list[list[float]]:
    validate_source(flight)
    captures = {c["id"]: c for c in flight["captures"]}
    output = []
    for section in flight["pathSections"]:
        capture = captures[section["captureId"]]
        pixels = section["pixels"]
        if len(pixels) < 2 or not all(
            finite_pair(p) and 0 <= p[0] < capture["imageSize"][0]
            and 0 <= p[1] < capture["imageSize"][1] for p in pixels
        ):
            raise ValueError(f"{flight['id']}: invalid displayed path observations")
        tolerance = section.get("simplifyTolerancePixels", 1.0)
        if not isinstance(tolerance, (int, float)) or not math.isfinite(tolerance) or not 0 < tolerance <= 2:
            raise ValueError(f"{flight['id']}: invalid simplification tolerance")
        coordinates = [pixel_to_coordinate(p, capture) for p in simplify_pixels(pixels, tolerance)]
        if output:
            join_distance = distance_m(output[-1], coordinates[0])
            if join_distance > section.get("maximumJoinDistanceM", 0):
                raise ValueError(f"{flight['id']}: unsupported gap between displayed sections ({join_distance:.0f} m)")
        for coordinate in coordinates:
            if not output or coordinate != output[-1]:
                output.append(coordinate)
    if len(output) < 3:
        raise ValueError(f"{flight['id']}: insufficient observed trajectory")
    start_distance = distance_m(output[0], flight["airportReferenceCoordinates"][0])
    end_distance = distance_m(output[-1], flight["airportReferenceCoordinates"][1])
    limits = flight["endpointCoverage"]["maximumAirportDistanceM"]
    if start_distance > limits[0] or end_distance > limits[1]:
        raise ValueError(f"{flight['id']}: observed endpoints fail the declared airport/direction check")
    return output


def build_reference(flight: dict) -> dict:
    coordinates = build_coordinates(flight)
    length = round(sum(distance_m(a, b) for a, b in zip(coordinates, coordinates[1:])))
    return {
        "id": flight["id"],
        "flightNumber": flight["flightNumber"],
        "referenceDate": flight["referenceDate"],
        "airportReferenceCoordinates": flight["airportReferenceCoordinates"],
        "coords": coordinates,
        "distanceM": length,
        "geometrySource": (
            f"Flightradar24 {flight['referenceDate']} {flight['flightNumber']} 공개 재생 지도에서 판독한 참고 항로. "
            "원본 GPS 좌표 파일이 아니며, 화면 해상도와 기호 가림에 따른 오차·생략이 있습니다."
        ),
        "geometryNotice": flight["geometryNotice"],
        "flightTrack": {
            "status": "screen-reference",
            "flightNumber": flight["flightNumber"],
            "referenceDate": flight["referenceDate"],
            "sourceUrl": flight["sourceUrl"],
            "sourceFlightId": flight["sourceFlightId"],
            "registration": flight["registration"],
            "retrievedAt": flight["retrievedAt"],
            "coverage": "displayed-trail",
            "method": "공개 재생 지도에서 판독한 참고 항로",
            "precisionNote": "원본 GPS 좌표가 아닌 공개 지도 표시선 기준. 활주·기호 아래 구간은 정밀 복원하지 않았습니다.",
            "endpointNotice": flight["endpointCoverage"]["notice"],
            "referenceRole": flight["referenceRole"],
            "hasRecordedTimestamps": False,
            "playbackBasis": "distance-proportional",
            "coordinateCount": len(coordinates),
            "sourceManifest": "assets/routes/flight-route-sources.json",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the public reference output without changing files")
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if set(manifest) != MANIFEST_FIELDS or manifest["basis"] != "screen-reference" or manifest["isOriginalGPSExport"] is not False:
        raise SystemExit("Manifest is not the supported public map-reference schema")
    if not manifest["flights"] or len({f["id"] for f in manifest["flights"]}) != len(manifest["flights"]):
        raise SystemExit("Manifest has missing or duplicate flight references")
    output = {"version": manifest["version"], "flights": [build_reference(f) for f in manifest["flights"]]}
    if args.check:
        if not OUTPUT.is_file() or json.loads(OUTPUT.read_text(encoding="utf-8")) != output:
            raise SystemExit("Public flight reference output differs from its observation manifest")
    else:
        OUTPUT.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    report = [{
        "id": flight["id"], "points": len(flight["coords"]), "distanceM": flight["distanceM"],
        "startAirportDistanceM": round(distance_m(flight["coords"][0], flight["airportReferenceCoordinates"][0])),
        "endAirportDistanceM": round(distance_m(flight["coords"][-1], flight["airportReferenceCoordinates"][1])),
    } for flight in output["flights"]]
    print(json.dumps({"check": args.check, "flights": report}, ensure_ascii=False))


if __name__ == "__main__":
    main()
