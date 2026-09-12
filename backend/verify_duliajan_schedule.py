# -*- coding: utf-8 -*-
"""Independent verification of the generated schedule JSON."""
import json
from datetime import date, timedelta

data = json.load(open(r"c:\Users\tcgxu\OneDrive\Desktop\SIH 2026\duliajan_p6_schedule.json", encoding="utf-8"))
print("records:", len(data))
keys = ["activity_id","wbs_path","wbs_level","description","discipline","tag",
        "planned_start","planned_finish","planned_qty","uom","predecessors","calendar"]
assert all(list(r.keys()) == keys for r in data), "key mismatch"
ids = {r["activity_id"] for r in data}
assert len(ids) == len(data), "duplicate ids"
idx = {r["activity_id"]: r for r in data}

LO, HI = date(2026, 3, 1), date(2027, 3, 31)
errs = 0
for r in data:
    s = date.fromisoformat(r["planned_start"]); f = date.fromisoformat(r["planned_finish"])
    assert LO <= s <= HI and LO <= f <= HI, "date bound: " + r["activity_id"]
    if r["wbs_level"] == 6:
        assert len(r["wbs_path"]) == 6
    else:
        assert len(r["wbs_path"]) == 5
    for p in r["predecessors"]:
        assert set(p.keys()) == {"activity_id","rel","lag_days"}
        assert p["rel"] in ("FS","SS","FF","SF")
        q = idx[p["activity_id"]]
        qs = date.fromisoformat(q["planned_start"]); qf = date.fromisoformat(q["planned_finish"])
        if p["rel"] == "FS" and s < qf + timedelta(days=p["lag_days"] + 1):
            errs += 1; print("FS violation:", r["activity_id"], "<-", p["activity_id"])
        if p["rel"] == "SS" and s < qs + timedelta(days=p["lag_days"]):
            errs += 1; print("SS violation:", r["activity_id"], "<-", p["activity_id"])
        if p["rel"] == "FF" and f < qf + timedelta(days=p["lag_days"]):
            errs += 1; print("FF violation:", r["activity_id"], "<-", p["activity_id"])
print("relationship violations:", errs)
print("levels:", {l: sum(1 for r in data if r["wbs_level"] == l) for l in (5, 6)})
print("calendars:", {c: sum(1 for r in data if r["calendar"] == c) for c in ("6-day", "7-day")})
print("phases:", sorted({r["wbs_path"][1] for r in data}))
print()
print("sample L6  :", json.dumps(data[5], ensure_ascii=False)[:380])
print("sample MS  :", json.dumps([r for r in data if r["activity_id"] == "HSE-HDO-1554"][0], ensure_ascii=False)[:380])
print("sample tag :", json.dumps([r for r in data if r["activity_id"] == "PIP-ERC-1311"][0], ensure_ascii=False)[:380])
print("prose sample:", json.dumps([r for r in data if r["activity_id"] == "CIV-SRV-1001"][0], ensure_ascii=False)[:380])
print("OK")