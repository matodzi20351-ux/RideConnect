# RideConnect

A complete ride-hailing platform — customer app, driver app, admin dashboard, and the backend that powers all three.

## Project structure

```
rideconnect/
├── backend/            Node.js/Express + MongoDB + Socket.IO API (see backend/README.md)
├── customer-app/       Book rides, track drivers, chat, rate (open in browser)
├── driver-app/         Go online, accept trips, navigate, earn (open in browser)
└── admin-dashboard/    Approve drivers, monitor trips, set pricing, handle complaints
```

## 1. Start the backend first

```bash
cd backend
npm install
cp .env.example .env       # then edit MONGO_URI and JWT_SECRET
npm run dev                 # runs on http://localhost:5000
node seedAdmin.js           # creates your first admin login (run once)
```

Keep this running — all three frontends talk to `http://localhost:5000/api`.

## 2. Open the three apps

Each frontend is plain HTML/CSS/JS — no build step needed. Easiest way to run them locally (avoids browser CORS/file:// issues, especially for geolocation which most browsers block on `file://`):

```bash
# from inside customer-app/, driver-app/, or admin-dashboard/
npx serve .
# or: python3 -m http.server 8000
```

Then open each in its own browser tab/window:
- **Customer app** → register as a customer, allow location access, book a ride
- **Driver app** → register as a driver (upload license + vehicle photo), then...
- **Admin dashboard** → log in with the seeded admin account, go to **Drivers**, and **Approve** the new driver
- Back in the **driver app**, refresh — you can now go online
- Back in the **customer app**, request a ride — it'll appear in the driver app in real time via Socket.IO

## 3. Typical demo flow

1. Admin logs in → approves the driver you just registered
2. Driver logs in → flips "Online"
3. Customer logs in → sets pickup (auto via GPS) → types/taps a destination → sees fare estimate → requests ride
4. Driver gets a live pop-up request → accepts → drives through Arrived → Start → Complete
5. Customer sees live driver location on the map + can chat throughout
6. Customer rates the driver after completion
7. Admin dashboard → **Live Trips** shows it on the map while in progress, **Overview** updates revenue/trip counts afterward

## 4. Notes & known limitations

- **Coordinates are `[longitude, latitude]`** everywhere (GeoJSON convention) — double-check this if you extend anything.
- License/vehicle photos are stored as base64 data URLs directly in MongoDB for simplicity — fine for a coursework/demo project, but swap for real file upload (multer + S3/Cloudinary) before this goes anywhere near production, since base64-in-Mongo doesn't scale.
- Address search uses OpenStreetMap's free Nominatim API — no API key needed, but it's rate-limited, so don't hammer it in a tight loop.
- Payment is a placeholder (`cash` works end-to-end; `card`/`wallet` are UI-only for now — the Trip model already has the fields ready for when you wire up a gateway).
- No push notifications — the driver app relies on the browser tab being open and Socket.IO connected to receive ride requests.
- CORS is wide open (`origin: '*'`) in the backend for ease of local development — restrict this before deploying anywhere public.
