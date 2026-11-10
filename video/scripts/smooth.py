#!/usr/bin/env python3
"""Rebuild a screencast list so every content change is interpolated over at most HOLD seconds:
each frame that holds longer than HOLD gets a duplicate placed HOLD before the next frame.
usage: smooth.py in_list out_list [hold]"""
import sys, re
src, dst = sys.argv[1], sys.argv[2]; hold = float(sys.argv[3]) if len(sys.argv) > 3 else 0.17
lines = open(src).read().splitlines()
ents = []; cur = None
for l in lines:
    if l.startswith("file "): cur = [l, None]; ents.append(cur)
    elif l.startswith("duration ") and cur: cur[1] = float(l.split()[1])
out = []
for f, d in ents:
    if d is None: out.append(f); continue
    if d > hold + 0.05:
        out += [f, f"duration {d - hold:.4f}", f, f"duration {hold:.4f}"]
    else:
        out += [f, f"duration {d:.4f}"]
open(dst, "w").write("\n".join(out) + "\n")
