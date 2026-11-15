# Mobile demo (one-page, offline)

Builds a single `index.html` from the real app's screens so anyone can open the demo on a phone, tablet or computer
without a server (for sales meetings, sharing a link, or an artifact page).

1. Run the API and web app with demo data (`apps/api/scripts/demo-data.mjs`), web on http://localhost:3000.
2. `npm i puppeteer-core` here and set the Chrome path in `capture.mjs` (`executablePath`).
3. `node capture.mjs` → writes `views.json` and `app.css` (32 screens: executive dashboard in four periods and both tabs,
   staff portal, tenant app, technician app).
4. `python3 build.py` → writes `index.html` (about 0.5 MB). Navigation, menus, tabs and period buttons work; saving is off.
