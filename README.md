# ProjectT

Red vs. Blue 3D battle simulation. See ROADMAP.md.

## Phase 1: run the offline engine
No install needed. From this folder:

    python -m http.server 8000

Open http://localhost:8000 and use the debug panel to spawn units.
`window.battle.spawn(team, name, count)` is the hook the Phase 2 event bridge will call (team 0 = red, 1 = blue).
