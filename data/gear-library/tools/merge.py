#!/usr/bin/env python3
"""Build gear.json, gear.csv and app-equip.json from sources/*.json.

Usage: python3 tools/merge.py <gear-library dir> <exercises.json>
Validates ids, keeps every existing EQUIP id and name, and links each item
to the exercise library (via `req` plus the researched `linked_exercise_ids`).
"""
import csv, glob, json, os, re, sys

ROOT, EXFILE = sys.argv[1], sys.argv[2]
FIELDS = ["id", "name", "aliases", "category", "subcategory", "app_group", "in_app", "tier", "setting",
          "description", "muscle_focus", "loading", "weight_options", "adjustability", "footprint", "space",
          "price_band", "requires", "substitutes", "signature_exercises", "linked_exercise_ids",
          "buying_tips", "safety", "keywords"]
GROUPS = ["Chest", "Back", "Shoulders", "Arms", "Legs & glutes", "Core", "Full body", "Cardio",
          "Bodyweight & mind-body", "Strongman", "Combat", "Conditioning & agility", "Attachments",
          "Lifting accessories", "Outdoor & everyday"]
SLICE_ORDER = ["bodyweight", "freeweights", "machines", "cables", "cardio", "other"]
ID_RE = re.compile(r"^[a-z0-9]{2,16}$")
# ids researched by more than one slice: which slice's record wins (aliases and links are pooled)
PREFER = {"dowel": "other", "powertower": "bodyweight", "nordicstrap": "cables", "situpbar": "bodyweight",
          "abmat": "bodyweight", "steelmace": "freeweights", "hipthrustbench": "freeweights",
          "neckharness": "cables", "backextm": "machines", "abcoaster": "machines", "loadingpin": "cables"}
# near-duplicates under different ids: dropped id -> kept id
SAME = {"sprintbelt": "sprintharness", "fingerband": "fingerbands", "slantboard": "squatwedge"}

existing = json.load(open(os.path.join(ROOT, "tools", "existing-equip.json")))
old = {}
for gi, g in enumerate(existing):
    for ii, it in enumerate(g["items"]):
        old[it[0]] = {"name": it[1], "kw": it[2], "group": g["g"], "order": (gi, ii)}

exercises = json.load(open(EXFILE))["exercises"]
exids = {e["id"] for e in exercises}

items, errs, slices, dropped = {}, [], {}, []
for path in sorted(glob.glob(os.path.join(ROOT, "sources", "*.json"))):
    data = json.load(open(path))
    for it in data["items"]:
        missing = [f for f in FIELDS if f not in it]
        if missing:
            errs.append(f"{it.get('id')}: missing {missing}")
            continue
        i = it["id"]
        if i in SAME:
            dropped.append(it)
            continue
        if i in items:
            if i not in PREFER:
                errs.append(f"duplicate id {i} ({path})")
                continue
            a, b = (items[i], it) if PREFER[i] == slices[i] else (it, items[i])
            keep = {f: a[f] for f in FIELDS}
            for f in ("aliases", "linked_exercise_ids"):
                keep[f] = list(dict.fromkeys(a[f] + b[f]))
            keep["aliases"] = [x for x in keep["aliases"] if x.lower() != keep["name"].lower()]
            items[i], slices[i] = keep, PREFER[i]
            continue
        if i not in old and not ID_RE.match(i):
            errs.append(f"bad id {i}")
        slices[i] = data["slice"]
        items[i] = {f: it[f] for f in FIELDS}

for it in dropped:  # fold the near-duplicate's name, aliases and links into the kept item
    k = items[SAME[it["id"]]]
    for f, extra in (("aliases", [it["name"]] + it["aliases"]), ("linked_exercise_ids", it["linked_exercise_ids"])):
        k[f] = [x for x in dict.fromkeys(k[f] + extra) if x.lower() != k["name"].lower()]
for i, o in old.items():
    if i not in items:
        errs.append(f"existing id {i} missing")
        continue
    it = items[i]
    it["name"], it["in_app"], it["app_group"] = o["name"], True, o["group"]
    it["keywords"] = o["kw"]  # the app's search words stay exactly as they are
for i, it in items.items():
    for f in ("requires", "substitutes"):
        it[f] = list(dict.fromkeys(SAME.get(r, r) for r in it[f]))
    if i not in old:
        it["in_app"] = False
    if it["app_group"] not in GROUPS:
        errs.append(f"{i}: bad app_group {it['app_group']}")
    if it["tier"] not in (0, 1, 2, 3):
        errs.append(f"{i}: bad tier {it['tier']}")
    for f in ("requires", "substitutes"):
        bad = [r for r in it[f] if r not in items]
        if bad:
            print(f"warn {i}.{f}: dropping unknown ids {bad}")
            it[f] = [r for r in it[f] if r in items and r != i]
    bad = [x for x in it["linked_exercise_ids"] if x not in exids]
    if bad:
        print(f"warn {i}: dropping unknown exercise ids {bad}")
        it["linked_exercise_ids"] = [x for x in it["linked_exercise_ids"] if x in exids]

if errs:
    sys.exit("ERRORS:\n" + "\n".join(errs))

# link exercises: every exercise whose req names the id, plus researched links
by_req = {}
for e in exercises:
    if not e["req"]:
        by_req.setdefault("calisthenics", []).append(e["id"])  # no-equipment moves
    for g in set(t for t in re.split(r"[,|]", e["req"]) if t):
        by_req.setdefault(g, []).append(e["id"])
unknown_req = sorted(g for g in by_req if g not in items)
if unknown_req:
    sys.exit(f"exercise req ids with no gear item: {unknown_req}")
# proposed exact req strings for exercises that used a stand-in id
updates = json.load(open(os.path.join(ROOT, "tools", "req-updates.json")))
exbyid = {e["id"]: e for e in exercises}
upd_out = []
for x, req in updates.items():
    bad = [g for g in re.split(r"[,|]", req) if g and g not in items]
    if x not in exbyid or bad:
        sys.exit(f"req update {x}: unknown exercise or gear {bad}")
    upd_out.append({"id": x, "name": exbyid[x]["name"], "old_req": exbyid[x]["req"], "new_req": req})
    for g in set(t for t in re.split(r"[,|]", req) if t):
        by_req.setdefault(g, []).append(x)
json.dump({"note": "Proposed req values for exercises that used the nearest gear id because the exact kit had no id. "
                   "Apply to exercises.json / app-extra.json when these gear ids go into EQUIP.",
           "count": len(upd_out), "updates": upd_out},
          open(os.path.join(ROOT, "exercise-req-updates.json"), "w"), indent=1, ensure_ascii=False)
exname = {e["id"]: e["name"] for e in exercises}
for i, it in items.items():
    ids = sorted(set(by_req.get(i, [])) | set(it.pop("linked_exercise_ids")), key=lambda x: exname[x].lower())
    it["exercise_ids"] = ids
    it["exercise_count"] = len(ids)

def sort_key(i):
    it = items[i]
    return (GROUPS.index(it["app_group"]), old[i]["order"] if i in old else (99, 0), it["tier"], it["name"].lower())
order = sorted(items, key=sort_key)
out = [items[i] for i in order]

cats = {}
for it in out:
    cats.setdefault(it["category"], 0)
    cats[it["category"]] += 1
json.dump({"version": 1, "count": len(out), "categories": cats, "items": out},
          open(os.path.join(ROOT, "gear.json"), "w"), indent=1, ensure_ascii=False)

cols = [f for f in FIELDS if f != "linked_exercise_ids"] + ["exercise_count", "exercise_ids"]
with open(os.path.join(ROOT, "gear.csv"), "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh)
    w.writerow(cols)
    for it in out:
        row = []
        for c in cols:
            v = it[c]
            if isinstance(v, list): v = "; ".join(v)
            elif isinstance(v, dict): v = "x".join(str(v[k]) for k in ("length_cm", "width_cm", "height_cm"))
            elif v is None: v = ""
            elif isinstance(v, bool): v = "true" if v else "false"
            row.append(v)
        w.writerow(row)

# EQUIP-shaped app data: existing groups, items and order untouched, new items appended
app = []
for g in GROUPS:
    rows = [[it["id"], it["name"], it["keywords"]] for it in out if it["app_group"] == g]
    if rows:
        app.append({"g": g, "items": rows})
json.dump(app, open(os.path.join(ROOT, "app-equip.json"), "w"), ensure_ascii=False, separators=(",", ":"))

print(f"{len(out)} items, {len(out) - len(old)} new, {len(cats)} categories")
for s in SLICE_ORDER:
    print(f"  {s}: {sum(1 for v in slices.values() if v == s)}")
print("exercises with at least one gear link:",
      len({x for it in out for x in it["exercise_ids"]}), "of", len(exercises))
