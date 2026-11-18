"""Extract actual aligned cable-car columns from the operator's timetable PDF.

Usage: python scripts/extract-hakone-cable-timetable.py SOURCE.pdf
No headway expansion or inferred station arrival times.
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import pdfplumber

source = Path(sys.argv[1])
names = ["強羅", "公園下", "公園上", "中強羅", "上強羅", "早雲山"]
result = {"outbound": {}, "inbound": {}}
pages = []
with pdfplumber.open(source) as doc:
    for page_no, page in enumerate(doc.pages):
        text = page.extract_text()
        calendar = "SaturdayHoliday" if "土休日" in text else "Weekday" if "平日" in text else None
        if not calendar:
            raise ValueError(f"Calendar missing on page {page_no + 1}")
        for table in page.extract_tables():
            for row_no in range(len(table) - 5):
                rows = table[row_no:row_no + 6]
                labels = [(row[0] or "").strip() for row in rows]
                direction = "outbound" if labels == names else "inbound" if labels == names[::-1] else None
                if not direction:
                    continue
                for col in range(2, len(rows[0])):
                    values = [re.sub(r"\s+", "", row[col] or "") for row in rows]
                    if not any(values):
                        continue
                    if not all(re.fullmatch(r"\d{1,2}:\d{2}", value) for value in values):
                        raise ValueError(f"Incomplete cable column: {page_no + 1}/{col}: {values}")
                    times = [f"{int(v.split(':')[0]):02}:{v.split(':')[1]}" for v in values]
                    minutes = [int(v[:2]) * 60 + int(v[3:]) for v in times]
                    if minutes[-1] - minutes[0] != 11 or minutes != sorted(minutes):
                        raise ValueError("Unexpected official cable travel column")
                    result[direction].setdefault(calendar, []).append({"page": page_no + 1, "column": col + 1, "stations": labels, "times": times})
                    pages.append(page_no + 1)
for direction, calendars in result.items():
    for calendar, rows in calendars.items():
        rows.sort(key=lambda r: r["times"][0])
        if len({r["times"][0] for r in rows}) != len(rows) or len(rows) < 20:
            raise ValueError(f"Missing or duplicate departures: {direction}/{calendar}")
output = {"source": "https://www.hakonenavi.jp/_wp/wp-content/uploads/2026/02/dea7e989e1d5e7a7dd432f62889824d8.pdf", "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(), "checkedAt": "2026-11-05", "revision": "2026-03-16", "pages": sorted(set(pages)), "timeBasis": "Official station-row times; only the origin is assigned a departure event, other rows remain source time events.", "directions": result}
target = Path(__file__).with_name("hakone-cable-timetable.json")
target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({direction: {calendar: len(rows) for calendar, rows in calendars.items()} for direction, calendars in result.items()}))
