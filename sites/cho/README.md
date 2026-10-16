# Cho — website rebuild (prototype)

Static, dependency-free rebuild of https://cho.restaurant/.

Run locally:

    python3 -m http.server 8080 --directory sites/cho
    # open http://localhost:8080

All hours, menus, prices and booking rules live in `CONFIG` at the top of `app.js`.

Needs confirming with the restaurant before going live: dinner tier names and course
descriptions, last-seating times, max party size, WhatsApp number, and photography.
