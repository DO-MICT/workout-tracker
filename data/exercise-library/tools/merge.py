"""Merge researcher outputs into one validated exercise library.
usage (from data/exercise-library): python3 tools/merge.py tools .
Reads sources/*.json plus the reference files in tools/, writes exercises.json, exercises.csv and app-extra.json."""
import csv, glob, json, os, re, sys, urllib.parse
from collections import Counter

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)

TYPES = ["Strength", "Calisthenics", "Core", "Balance", "Power", "Plyometric", "Strongman", "Cardio", "Combat",
         "Mobility", "Stretching", "Recovery", "Yoga", "Pilates"]
MGS = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Glutes", "Core", "Cardio", "Mobility"]
PATTERNS = ["Squat", "Hinge", "Lunge", "Horizontal push", "Vertical push", "Horizontal pull", "Vertical pull", "Carry",
            "Rotation", "Anti-rotation", "Anti-extension", "Anti-lateral flexion", "Flexion", "Extension", "Isolation",
            "Locomotion", "Jump", "Throw", "Hold", "Mobility", "Stretch", "Gait"]
DIFF = ["Beginner", "Intermediate", "Advanced"]
TRACK = ["w", "bw", "cardio", "time", "hold", "count"]
gear = {l.split("\t")[0] for l in open(os.path.join(src, "gear_ids.tsv")) if l.strip()}
existing = {}
for l in open(os.path.join(src, "existing_ids.tsv")):
    if l.strip():
        i, n, _ = l.rstrip("\n").split("\t")
        existing[i] = n
app = json.load(open(os.path.join(src, "app_library.json")))
diagram = {e["id"]: e["f"] for d in app["DEFAULT_DAYS"] for e in d["ex"]}
diagram.update({e[0]: e[4] for e in app["EXTRA"]})

def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())

def pick(v, allowed, default, field, warn):
    if v in allowed:
        return v
    for a in allowed:
        if isinstance(v, str) and v.lower() == a.lower():
            return a
    warn.append(f"{field}={v!r}")
    return default

# near-duplicates spotted across slices: (source file, name) to drop, and clearer ids for same-id clashes
DROP = {("01_bodyweight_strength.json", "Ring biceps curl"), ("09_plyo_agility.json", "Hill sprint"),
        ("10_mobility.json", "Scap push-up"), ("07_core_balance.json", "V-sit hold"),
        ("08_cardio_combat.json", "Cross-body mountain climbers")}
RENAME = {"Neutral-grip lat pulldown": "neutralpulldown", "Cable donkey kickback": "cabledonkeykick",
          "Machine rear delt row": "machreardeltrow"}
items, warnings, dropped = [], [], []
for f in sorted(glob.glob(os.path.join(src, "..", "sources", "*.json"))):
    for e in json.load(open(f)):
        e["_src"] = os.path.basename(f)
        if (e["_src"], e.get("name")) in DROP:
            dropped.append(("near-duplicate", e["name"], e["_src"])); continue
        if e.get("name") in RENAME:
            e["id"] = RENAME[e["name"]]
        items.append(e)

seen_id, seen_name, out = {}, {}, []
for e in items:
    w = []
    name = (e.get("name") or "").strip()
    if not name:
        dropped.append(("no name", e.get("id"))); continue
    nk = norm(name)
    if nk in seen_name:
        dropped.append(("duplicate name", name, e["_src"], seen_name[nk])); continue
    eid = re.sub(r"[^a-z0-9]", "", (e.get("id") or nk).lower())[:24] or nk[:24]
    if eid in existing and norm(existing[eid]) != nk and eid in seen_id:
        eid = nk[:24]
    base, k = eid, 2
    while eid in seen_id:
        eid = f"{base[:22]}{k}"; k += 1
    req = (e.get("req") or "").replace(" ", "")
    groups = [g for g in req.split(",") if g]
    clean = []
    for g in groups:
        ids = [i for i in g.split("|") if i in gear]
        bad = [i for i in g.split("|") if i and i not in gear]
        if bad:
            w.append(f"unknown gear {bad}")
        if ids:
            clean.append("|".join(ids))
    rec = {
        "id": eid,
        "name": name,
        "aliases": e.get("aliases") or [],
        "training_type": pick(e.get("training_type"), TYPES, "Strength", "training_type", w),
        "tags": sorted(set(e.get("tags") or [])),
        "muscle_group": pick(e.get("muscle_group"), MGS, "Core", "muscle_group", w),
        "primary_muscles": e.get("primary_muscles") or [],
        "secondary_muscles": e.get("secondary_muscles") or [],
        "movement_pattern": pick(e.get("movement_pattern"), PATTERNS, "Isolation", "movement_pattern", w),
        "equipment": e.get("equipment") or [],
        "req": ",".join(clean),
        "equipment_tier": int(e.get("equipment_tier") or 0) if str(e.get("equipment_tier", 0)).isdigit() else 0,
        "difficulty": pick(e.get("difficulty"), DIFF, "Intermediate", "difficulty", w),
        "tracking": pick(e.get("tracking"), TRACK, "w", "tracking", w),
        "unilateral": bool(e.get("unilateral")),
        "sets": int(e.get("sets") or 3),
        "reps": str(e.get("reps") or "10").replace("-", "–"),
        "form_cues": e.get("form_cues") or [],
        "common_mistakes": e.get("common_mistakes") or [],
        "regressions": e.get("regressions") or [],
        "progressions": e.get("progressions") or [],
        "safety": e.get("safety") or "",
        "video": e.get("video") if isinstance(e.get("video"), str) and e["video"].startswith("https://") else None,
        "video_search": "https://www.youtube.com/results?search_query=" + urllib.parse.quote_plus(name + " exercise form"),
        "diagram": diagram.get(eid, ""),
        "in_app": eid in existing,
        "notes": e.get("notes") or "",
    }
    rec["equipment_tier"] = max(0, min(3, rec["equipment_tier"]))
    if rec["training_type"] not in rec["tags"]:
        rec["tags"] = sorted(set(rec["tags"]) | {rec["training_type"]})
    if len(rec["form_cues"]) < 2:
        w.append("few cues")
    if w:
        warnings.append((eid, e["_src"], w))
    seen_id[eid] = name
    seen_name[nk] = e["_src"]
    out.append(rec)

order = {t: i for i, t in enumerate(TYPES)}
out.sort(key=lambda r: (order[r["training_type"]], r["equipment_tier"], MGS.index(r["muscle_group"]), r["name"].lower()))

json.dump({"version": 1, "count": len(out), "exercises": out}, open(os.path.join(dst, "exercises.json"), "w"),
          ensure_ascii=False, indent=1)
# app-ready: same tuple shape as EXTRA in src/js/library.js -> [id, name, muscle group, req, diagram, sets, reps, measure, cues]
json.dump([[r["id"], r["name"], r["muscle_group"], r["req"], r["diagram"], r["sets"], r["reps"], r["tracking"], r["form_cues"]]
           for r in out], open(os.path.join(dst, "app-extra.json"), "w"), ensure_ascii=False, separators=(",", ":"))
cols = ["id", "name", "training_type", "tags", "muscle_group", "primary_muscles", "secondary_muscles", "movement_pattern",
        "equipment", "req", "equipment_tier", "difficulty", "tracking", "unilateral", "sets", "reps", "form_cues",
        "common_mistakes", "regressions", "progressions", "safety", "video", "video_search", "aliases", "in_app", "notes"]
with open(os.path.join(dst, "exercises.csv"), "w", newline="", encoding="utf-8") as fh:
    wr = csv.writer(fh)
    wr.writerow(cols)
    for r in out:
        wr.writerow(["; ".join(r[c]) if isinstance(r[c], list) else ("" if r[c] is None else r[c]) for c in cols])

print("total", len(out), "dropped", len(dropped), "warnings", len(warnings))
print(Counter(r["training_type"] for r in out))
print(Counter(r["equipment_tier"] for r in out), Counter(r["difficulty"] for r in out))
print("in_app", sum(r["in_app"] for r in out), "videos", sum(bool(r["video"]) for r in out))
json.dump({"dropped": dropped, "warnings": warnings}, open(os.path.join(src, "merge_report.json"), "w"), indent=1)
