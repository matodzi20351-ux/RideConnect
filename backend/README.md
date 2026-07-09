# RideConnect Backend

Node.js/Express + MongoDB + Socket.IO backend for RideConnect, a custom ride-hailing platform.

## 1. Setup

```bash
cd rideconnect-backend
npm install
cp .env.example .env
# edit .env: set MONGO_URI and a strong JWT_SECRET
npm run dev        # requires nodemon (in devDependencies)
# or: npm start
```

Then create your first admin account:

```bash
node seedAdmin.js
```

This logs an admin email/password — log in with it via `POST /api/auth/login`, then change the password (add a "change password" route later, or update directly in the DB for now).

## 2. Project structure

```
rideconnect-backend/
├── server.js                 # Express + Socket.IO entry point
├── config/db.js              # MongoDB connection
├── models/
│   ├── User.js                # customers, drivers, admins (shared schema, role field)
│   ├── DriverProfile.js       # license, vehicle, approval status, live location, earnings
│   ├── Trip.js                # full ride lifecycle
│   ├── ChatMessage.js         # in-trip chat history
│   ├── PricingConfig.js       # admin-adjustable fare settings
│   └── Complaint.js           # admin complaint queue
├── middleware/
│   ├── auth.js                 # JWT verification (protect)
│   └── roleCheck.js            # role-based access control (authorize)
├── routes/
│   ├── auth.js                 # register, login, /me
│   ├── customer.js             # fare estimate, request ride, cancel, history, rate driver
│   ├── driver.js               # go online/offline, nearby requests, accept/decline, trip progression, earnings
│   ├── admin.js                 # driver approval, user management, live trips, pricing, complaints
│   └── trip.js                  # shared: view trip, chat history, file complaint
├── sockets/socketHandler.js    # real-time ride matching, live location, chat
└── utils/
    ├── fareCalculator.js       # Haversine distance + fare formula
    └── generateToken.js        # JWT signing
```

## 3. Auth

Every protected route expects:

```
Authorization: Bearer <token>
```

Get a token from `POST /api/auth/register` or `POST /api/auth/login`.

## 4. Key REST endpoints

### Auth
| Method | Route | Access |
|---|---|---|
| POST | /api/auth/register | Public — pass `role: "customer"` or `"driver"` (drivers also need `driverDetails`) |
| POST | /api/auth/login | Public |
| GET | /api/auth/me | Any logged-in user |

### Customer
| Method | Route | Notes |
|---|---|---|
| POST | /api/customer/fare-estimate | `{ pickup: {coordinates}, destination: {coordinates} }` |
| POST | /api/customer/request-ride | Creates the trip record |
| PATCH | /api/customer/trips/:id/cancel | Before trip is ongoing/completed |
| GET | /api/customer/trips | Trip history |
| POST | /api/customer/trips/:id/rate-driver | `{ rating: 1-5 }` |

### Driver
| Method | Route | Notes |
|---|---|---|
| GET | /api/driver/profile | License/vehicle/approval status |
| PATCH | /api/driver/status | `{ isOnline, coordinates }` — requires admin approval |
| PATCH | /api/driver/location | Live GPS fallback (prefer Socket.IO for this) |
| GET | /api/driver/nearby-requests | Geospatial query, `?radiusKm=5` |
| PATCH | /api/driver/trips/:id/accept | Atomic — prevents double-accept |
| PATCH | /api/driver/trips/:id/{arrived,start,complete} | Trip lifecycle |
| POST | /api/driver/trips/:id/rate-customer | |
| GET | /api/driver/earnings | |

### Admin
| Method | Route | Notes |
|---|---|---|
| GET | /api/admin/drivers?status=pending | |
| PATCH | /api/admin/drivers/:id/approve \| /reject | |
| GET | /api/admin/customers | |
| PATCH | /api/admin/users/:id/suspend \| /unsuspend | |
| GET | /api/admin/trips/live | Trips currently in progress |
| GET | /api/admin/reports/summary | Dashboard stats |
| GET/PUT | /api/admin/pricing | Fare configuration |
| GET/PATCH | /api/admin/complaints | |

### Shared trip routes
| Method | Route |
|---|---|
| GET | /api/trips/:id |
| GET/POST | /api/trips/:id/messages |
| POST | /api/trips/:id/complaint |

## 5. Socket.IO events

Connect with the JWT in the handshake:

```js
const socket = io('http://localhost:5000', { auth: { token } });
```

| Event (emit) | Payload | Who |
|---|---|---|
| driver:locationUpdate | `{ coordinates, tripId? }` | driver |
| ride:requested | `{ tripId }` | customer, after REST-creating the trip |
| ride:accepted | `{ tripId }` | driver, after REST-accepting |
| trip:statusChanged | `{ tripId, status }` | driver |
| chat:send | `{ tripId, message }` | customer/driver |

| Event (listen) | Payload | Who |
|---|---|---|
| ride:newRequest | `{ trip }` | nearby drivers |
| ride:noDriversFound | `{ tripId }` | customer |
| ride:driverAssigned | `{ tripId, driver }` | customer |
| driver:locationUpdated | `{ tripId, coordinates }` | customer |
| trip:statusUpdated | `{ tripId, status }` | the other participant |
| chat:message | `{ tripId, message, sender, createdAt }` | both participants |

## 6. Coordinate format

All coordinates follow GeoJSON convention: **`[longitude, latitude]`** — not `[lat, lng]`. This trips people up constantly, so double-check it in your frontend's GPS calls.

## 7. Next steps (not yet built)

- File upload handling for driver's license / vehicle photos (currently expects a URL string — wire up multer + cloud storage, e.g. Cloudinary or S3)
- Payment gateway integration (Trip model already has `paymentStatus`/`paymentMethod` fields ready)
- Push notifications (FCM/APNs) for background ride alerts
- Refresh tokens / password reset flow
- Rate limiting on auth routes
