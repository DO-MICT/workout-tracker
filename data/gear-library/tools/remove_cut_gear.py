"""One-off (16 Nov 2026): delete the gear cut in launch-trim.json, and the exercises hidden with it, from the repo.
The launch trim only hid them (active = false); Deon decided they go for good. Keeps the 90 `keep` ids.
Also writes the rollback for supabase/migrations/20261116000024_delete_cut_gear.sql from the rows it removes.
usage (from data/gear-library, before the delete is committed): python3 tools/remove_cut_gear.py"""
import csv
import glob
import json
import re
import subprocess

ROLLBACK = "../../supabase/rollbacks/20261116000024_delete_cut_gear.down.sql"
T = json.load(open("launch-trim.json", encoding="utf-8"))
keep = set(T["keep"])
floor = set(T["floor"])
hidden = set(T["hide_exercises"])


def dump(obj, path, compact=False):
    with open(path, "w", encoding="utf-8") as f:
        if compact:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(obj, f, ensure_ascii=False, indent=1)


def ids_in(req):
    return [t for t in re.split(r"[,|]", req or "") if t]


# ---------- exercises ----------
EX = "../exercise-library/"
ex = json.load(open(EX + "exercises.json", encoding="utf-8"))
gone_ex = [e for e in ex["exercises"] if e["id"] in hidden]
assert len(gone_ex) == len(hidden), "hidden exercise missing from exercises.json"
ex["exercises"] = [e for e in ex["exercises"] if e["id"] not in hidden]
ex["count"] = len(ex["exercises"])
for e in ex["exercises"]:
    bad = [g for g in ids_in(e["req"]) if g not in keep | floor]
    assert not bad, (e["id"], bad)
dump(ex, EX + "exercises.json")
exids = {e["id"] for e in ex["exercises"]}

with open(EX + "exercises.csv", encoding="utf-8", newline="") as f:
    rows = list(csv.reader(f))
with open(EX + "exercises.csv", "w", encoding="utf-8", newline="") as f:
    csv.writer(f).writerows([rows[0]] + [r for r in rows[1:] if r[0] not in hidden])

extra = json.load(open(EX + "app-extra.json", encoding="utf-8"))
dump([e for e in extra if e[0] not in hidden], EX + "app-extra.json", compact=True)

for path in glob.glob(EX + "sources/*.json"):
    items = json.load(open(path, encoding="utf-8"))
    dump([e for e in items if e.get("id") not in hidden], path)

lines = open(EX + "tools/gear_ids.tsv", encoding="utf-8").read().splitlines()
open(EX + "tools/gear_ids.tsv", "w", encoding="utf-8").write(
    "\n".join(l for l in lines if l.split("\t")[0] in keep | floor) + "\n")
lines = open(EX + "tools/existing_ids.tsv", encoding="utf-8").read().splitlines()
open(EX + "tools/existing_ids.tsv", "w", encoding="utf-8").write(
    "\n".join(l for l in lines if l.split("\t")[0] not in hidden) + "\n")

# ---------- gear ----------
g = json.load(open("gear.json", encoding="utf-8"))
eq = json.load(open("app-equip.json", encoding="utf-8"))
order = {it[0]: (gi, si) for gi, grp in enumerate(eq) for si, it in enumerate(grp["items"])}
gone_gear = [i for i in g["items"] if i["id"] not in keep]
g["items"] = [i for i in g["items"] if i["id"] in keep]
assert {i["id"] for i in g["items"]} == keep
for i in g["items"]:
    i["requires"] = [r for r in i["requires"] if r in keep]
    i["substitutes"] = [r for r in i["substitutes"] if r in keep]
    i["exercise_ids"] = [x for x in i["exercise_ids"] if x in exids]
    i["exercise_count"] = len(i["exercise_ids"])
g["count"] = len(g["items"])
cats = {}
for i in g["items"]:
    cats[i["category"]] = cats.get(i["category"], 0) + 1
g["categories"] = {c: cats[c] for c in g["categories"] if c in cats}
dump(g, "gear.json")
byid = {i["id"]: i for i in g["items"]}

with open("gear.csv", encoding="utf-8", newline="") as f:
    rows = list(csv.reader(f))
head = rows[0]
out = [head]
for r in rows[1:]:
    if r[0] not in keep:
        continue
    it = byid[r[0]]
    for col in ("requires", "substitutes", "exercise_ids"):
        r[head.index(col)] = "; ".join(it[col])
    r[head.index("exercise_count")] = str(it["exercise_count"])
    out.append(r)
with open("gear.csv", "w", encoding="utf-8", newline="") as f:
    csv.writer(f).writerows(out)

eq = [{**grp, "items": [it for it in grp["items"] if it[0] in keep]} for grp in eq]
dump([grp for grp in eq if grp["items"]], "app-equip.json", compact=True)

for path in glob.glob("sources/*.json"):
    d = json.load(open(path, encoding="utf-8"))
    d["items"] = [i for i in d["items"] if i["id"] in keep]
    dump(d, path)

old = json.load(open("tools/existing-equip.json", encoding="utf-8"))
old = [{**grp, "items": [it for it in grp["items"] if it[0] in keep]} for grp in old]
dump([grp for grp in old if grp["items"]], "tools/existing-equip.json")

final = {e["id"]: e["req"] for e in ex["exercises"]}
ru = json.load(open("tools/req-updates.json", encoding="utf-8"))
ru = {x: (r if all(t in keep | floor for t in ids_in(r)) else final[x]) for x, r in ru.items() if x in exids}
dump(ru, "tools/req-updates.json")
ups = json.load(open("exercise-req-updates.json", encoding="utf-8"))
ups["updates"] = [u for u in ups["updates"] if u["id"] in exids]
ups["count"] = len(ups["updates"])
dump(ups, "exercise-req-updates.json")

# ---------- rollback: put the deleted rows back, hidden (as the launch trim left them) ----------
gcols = ["id", "name", "aliases", "keywords", "category", "subcategory", "app_group", "group_order", "sort_order", "tier",
         "setting", "description", "muscle_focus", "loading", "weight_options", "adjustability", "footprint", "space",
         "price_band", "requires", "substitutes", "signature_exercises", "exercise_ids", "buying_tips", "safety"]
gtypes = {c: "text[]" for c in ["aliases", "muscle_focus", "requires", "substitutes", "signature_exercises", "exercise_ids"]}
gtypes.update({"group_order": "smallint", "sort_order": "smallint", "tier": "smallint", "footprint": "jsonb"})
grows = []
for i in gone_gear:
    r = {c: i.get(c) for c in gcols}
    r["group_order"], r["sort_order"] = order[i["id"]]
    for c in gcols:
        if r[c] is None and c not in ("footprint", "space", "price_band"):
            r[c] = [] if gtypes.get(c) == "text[]" else ""
    grows.append(r)
ecols = ["id", "name", "aliases", "training_type", "tags", "muscle_group", "primary_muscles", "secondary_muscles",
         "movement_pattern", "equipment", "req", "equipment_tier", "difficulty", "tracking", "unilateral", "sets", "reps",
         "form_cues", "common_mistakes", "regressions", "progressions", "safety", "video", "diagram", "notes"]
etypes = {c: "text[]" for c in ["aliases", "tags", "primary_muscles", "secondary_muscles", "equipment", "form_cues",
                                "common_mistakes", "regressions", "progressions"]}
etypes.update({"equipment_tier": "smallint", "sets": "smallint", "unilateral": "boolean"})
erows = [{c: e[c] for c in ecols} for e in gone_ex]


def insert(table, cols, types, rows, tag):
    chunk = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    assert f"${tag}$" not in chunk
    rec = ", ".join(f"{c} {types.get(c, 'text')}" for c in cols)
    return (f"insert into public.{table} ({', '.join(cols)}, active)\n"
            f"select {', '.join(cols)}, false from jsonb_to_recordset(${tag}${chunk}${tag}$::jsonb)\n"
            f"  as r({rec})\non conflict (id) do nothing;")


open(ROLLBACK, "w", encoding="utf-8").write("\n\n".join([
    "-- Rollback for 20261116000024_delete_cut_gear: puts back the %d gear items and %d exercises it deleted," % (
        len(grows), len(erows)),
    "-- hidden (active = false) as the launch trim (20261115000023) left them. Generated by"
    " data/gear-library/tools/remove_cut_gear.py.",
    insert("gear", gcols, gtypes, grows, "gear"),
    insert("exercises", ecols, etypes, erows, "ex"),
]) + "\n")

print(len(g["items"]), "gear kept,", len(gone_gear), "deleted;", len(ex["exercises"]), "exercises kept,",
      len(gone_ex), "deleted")
