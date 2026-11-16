"""Apply launch-trim.json to the library data files, then rebuild the SQL loads.
Renames kept gear, swaps removed duplicates in exercise gear (req) and records the exercises that are hidden at launch.
Safe to run again. usage (from data/gear-library): python3 tools/apply_launch_trim.py
The live databases get the same change from supabase/migrations/20261115000023_launch_gear_trim.sql (active flags are
not part of the seed files, so a re-seed never brings hidden gear or exercises back)."""
import json
import subprocess

T = json.load(open("launch-trim.json"))
ex_path = "../exercise-library/exercises.json"
ex = json.load(open(ex_path))
for e in ex["exercises"]:
    u = T["req_updates"].get(e["id"])
    if u and e["req"] in (u["old"], u["new"]):
        e["req"] = u["new"]
json.dump(ex, open(ex_path, "w"), ensure_ascii=False, indent=1)

g = json.load(open("gear.json"))
for it in g["items"]:
    r = T["renames"].get(it["id"])
    if r:
        it["name"] = r["name"]
        if r.get("keywords") and r["keywords"] not in it["keywords"]:
            it["keywords"] = (it["keywords"] + " " + r["keywords"]).strip()
json.dump(g, open("gear.json", "w"), ensure_ascii=False, indent=1)

eq = json.load(open("app-equip.json"))
for grp in eq:
    for it in grp["items"]:
        r = T["renames"].get(it[0])
        if r:
            it[1] = r["name"]
            if r.get("keywords") and r["keywords"] not in it[2]:
                it[2] = (it[2] + " " + r["keywords"]).strip()
json.dump(eq, open("app-equip.json", "w"), ensure_ascii=False, separators=(",", ":"))

ups = json.load(open("exercise-req-updates.json"))
final = {e["id"]: e["req"] for e in ex["exercises"]}
hidden = set(T["hide_exercises"])
for u in ups["updates"]:
    if u["id"] not in hidden and u["id"] in T["req_updates"]:
        u["new_req"] = final[u["id"]]
json.dump(ups, open("exercise-req-updates.json", "w"), ensure_ascii=False, indent=1)

subprocess.check_call(["python3", "tools/to_sql.py"])
subprocess.check_call(["python3", "tools/to_sql.py"], cwd="../exercise-library")
