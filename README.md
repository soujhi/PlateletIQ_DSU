# PlateletIQ

**Platelets expire in five days. One hospital discards them the same week another turns a patient away.**

PlateletIQ forecasts platelet demand per hospital, and when a shortage is coming, moves units from a facility that has them — with custody verified by one-time code at both ends, a booked courier, and a live map.

> DSU DevHack 3.0 · Healthcare + AI/ML
> 20 eRaktKosh-registered blood centres across Chennai

---

## The problem

A platelet concentrate has a **five-day shelf life** and must be held at 20–24 °C under constant agitation. It cannot be frozen, cannot be stockpiled, and cannot be produced on demand — a single-donor apheresis unit takes about 90 minutes of a donor's time.

That creates a problem no individual hospital can solve alone:

- A tertiary centre finishing a week under its forecast **discards** usable units.
- A hospital 3 km away, hit by an unexpected dengue admission, **has none**.
- Neither can see the other's stock, and there is no operational path to move a unit between them even when both would benefit.

eRaktKosh publishes national stock data, but as a **directory, not a workflow**. It tells you a facility reported 14 SDP units at some point. It does not tell you whether they are still usable, it cannot reserve them, and it cannot get a box across a city with custody intact.

PlateletIQ is the missing workflow.

---

## What it does

**Forecasts demand** — a LASSO quantile model produces a 7-day forecast (q50/q67/q90) per facility, and a deterministic decision engine turns that into one of three actions: `HOLD`, `PROCURE`, or `COLLECT`, each with its evidence chain.

**Finds the counterparty** — ranks every other registered facility by road distance and by what they *currently* hold, so a request goes to somebody who can actually fill it.

**Moves the units** — a transfer reserves real inventory rows nearest-expiry-first, books a courier, and settles onto the receiving facility's ledger only when the receiver redeems the sender's code.

**Tracks the shipment** — road-routed map, courier marker, and a scan-by-scan timeline, visible to both facilities from one source of truth.

---

## The part that matters: verified custody

Blood products are a controlled, traceable medical product. "Trust the courier scan" is not an acceptable chain of custody. So the handshake is enforced server-side, not decorated in the UI.

Every transfer row names a **sender** and a **receiver**. Who opened it depends on direction:

| Direction | Opened by | Sender | Receiver |
|---|---|---|---|
| `SHORTAGE_PULL` | the facility that is short | the counterparty | the opener |
| `WASTAGE_PUSH` | the facility holding near-expiry units | the opener | the counterparty |

Either way, **the sender authorises and issues both codes; the receiver redeems the second one.**

```
REQUESTED
   │  sender authorises: reserves stock, books courier, issues pickup code
   ▼
UNITS_RESERVED ──► SHIPMENT_CREATED ──► AWB_ASSIGNED ──► PICKUP_OTP_REQUIRED
                                                                │
                                          sender confirms pickup code
                                                                ▼
                                                          IN_TRANSIT
                                                                │
                                        courier scan (optional) ▼
                                                             ARRIVED
                                                                │
                                   receiver redeems receipt code
                                                                ▼
                                                     TRANSFER_COMPLETED
```

What the server **refuses**, with a 403 rather than a silent no-op:

- the receiver cannot authorise its own request
- the sender cannot redeem the receipt code it issued
- neither console can read a code issued to the other
- a courier webhook reading `DELIVERED` moves the row to `ARRIVED` and **cannot** settle stock

Codes are 6 digits from a CSPRNG, stored only as HMAC-SHA256 digests, returned exactly once to the issuer, single-use, expiring, attempt-capped, and rate-limited. A wrong-facility attempt is rejected *without* burning an attempt, so one console cannot lock another out.

Full detail: **[docs/TRANSFERS.md](docs/TRANSFERS.md)**

---

## Inventory actually moves

Not a counter — real `InventoryUnit` rows.

- **Authorise** reserves units **nearest expiry first**, so a transfer drains exactly the stock that would otherwise be wasted. Insufficient stock returns 409 and changes nothing.
- **Courier dispatch failure** rolls the reservation back before returning 502, so a logistics outage never strands usable units.
- **Receipt** re-parents those exact bags to the receiver. The bag keeps its id, bag number and expiry, so provenance survives the move.

Every step writes an `InventoryEvent` on both sides plus an `AuditLog` entry.

---

## Try it in two minutes

**Windows** — double-click `start.bat`. **macOS / Linux** — `./start.sh`.

It creates the virtual environment, installs both dependency sets, generates secrets, starts the backend, **waits until the API actually answers**, then starts the frontend and opens the browser. Re-running skips whatever is already in place.

### The two-hospital demo

One backend, two browser sessions signed in at **different facilities**. An incognito window is enough; two laptops on a LAN work identically.

| # | Where | What happens |
|---|---|---|
| 1 | Both | Sign in, choose a facility — **A → RGGGH Chennai**, **B → Apollo Greams Road** |
| 2 | B | **Transfers → Request units** → pick RGGGH → 12 SDP units → send |
| 3 | A | Appears under *Needs your action* in ~2.5s. No refresh — both consoles poll one backend |
| 4 | A | **Authorise and book courier** → stock reserves, courier books, **A's pickup code** appears |
| 5 | A | Enter that code → **In transit**, and **A's receipt code for B** appears |
| 6 | Both | **Track shipment** — live map, moving marker, shared timeline |
| 7 | A → B | Pass the receipt code across, as you would by phone in practice |
| 8 | B | Enter it → 12 units leave A's ledger and land on B's |

Worth trying: have B attempt step 4, or A attempt step 8. Both get a plain 403.

---

## Architecture

```
  React 19 + Vite            FastAPI + SQLAlchemy           External
  ───────────────            ────────────────────           ────────
  Facility picker  ─────►    /auth/select-facility
  Transfers        ─────►    /transfers/*          ─────►   Shiprocket (courier)
  Live tracking    ─────►    /transfers/{id}/track ─────►   Mapbox │ OSRM (routing)
  Forecast         ─────►    /forecast/*                    OpenStreetMap (tiles)
                             LASSO model (joblib)
                             SQLite │ PostgreSQL
                                   ▲
                             /webhooks/shiprocket ◄─────    courier scans
```

**Auth is two-stage.** Google establishes identity; the JWT carries **no facility**. A second screen binds the session to a registered facility and re-issues the token with `bank_id`. Every stock-touching endpoint reads the facility off the token — so two browsers running one build are two different hospitals purely because each chose differently. There is no ambient default facility; an unbound session gets a 403 telling it to choose.

**Facility registry.** 20 Chennai blood centres with eRaktKosh codes, addresses, pincodes and coordinates, seeded on first start with opening stock spread realistically across the 5-day shelf life. Coordinates resolve through OpenStreetMap Nominatim when `GEOCODE_FACILITIES=1`, otherwise from the curated registry.

---

## What is real, and what is not

Judges deserve this plainly.

| Component | Status |
|---|---|
| Transfer pipeline, role enforcement, OTP crypto | **Real.** Fully implemented and server-enforced. |
| Inventory reservation and settlement | **Real.** Actual rows move between facilities. |
| Road routing and ETA | **Real.** Mapbox with a token, otherwise public OSRM. Falls back to a straight-line estimate and **says so in the UI** when both are unreachable. |
| Map | **Real.** Leaflet on OpenStreetMap, no key required. |
| Shiprocket courier | **Adapter is real** (auth, serviceability, adhoc order, AWB, pickup, tracking, webhooks). Without credentials it runs simulated, and the UI and `/health` both say `simulated`. |
| Courier GPS position | **Honest.** With no live feed, the marker is projected along the routed polyline from elapsed time and labelled *"Projected along the route from elapsed time — not a GPS fix"*. The simulated adapters return **no** coordinates rather than inventing one. |
| Facility coordinates | Curated from public addresses. eRaktKosh does not publish lat/long; optional Nominatim geocoding is built in. |
| Demand model | Trained on the Aachen hospital dataset (2008–2018, 4,018 days), calibrated with a WHO India monthly index. It is **not** trained on Chennai data — the adapter reports its own limitations through `/analytics/model-health`. |
| Opening inventory | Seeded, deterministic per facility. Real operation would ingest from the facility's LIS. |

`GET /api/v1/health` reports which integrations are genuinely configured, so nothing has to be taken on trust.

---

## Model performance

| Metric | PlateletIQ | Naive baseline | Schilling et al. |
|---|---|---|---|
| MASE | **0.734** | 0.993 | 0.746 |
| Wastage rate | **3.25 %** | 9.61 % | — |

Measured on the training dataset's holdout, not on Chennai operations. The adapter ships its own `known_limitations` and exposes them through the API rather than hiding them behind a headline number.

---

## Tech stack

**Frontend** — React 19, TypeScript, Vite 8, Tailwind 4, TanStack Query 5, Recharts, Leaflet
**Backend** — Python, FastAPI, Pydantic v2, SQLAlchemy 2.0, Uvicorn
**ML** — scikit-learn LASSO quantile pipeline
**Logistics** — Shiprocket API; Mapbox Directions or OSRM
**Auth** — Google Identity Services → facility binding, HS256 JWT
**Data** — SQLite locally, PostgreSQL in production

---

## Configuration

`backend/.env.example` documents every setting. The ones that matter:

| Variable | Why |
|---|---|
| `JWT_SECRET`, `OTP_SECRET` | **Must be set and stable.** Otherwise every session and live OTP dies on restart. |
| `ALLOW_DEV_SIGNIN` | Passwordless local sign-in for testing. **Leave off anywhere real** — anyone reaching the port could sign in as any facility. |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google sign-in. ID tokens are verified against the `aud` claim. |
| `TRANSPORT_MODE=live` + `SHIPROCKET_*` | Book real shipments instead of simulating. |
| `SHIPROCKET_WEBHOOK_TOKEN` | Webhook intake is **refused entirely** until set. |
| `MAPBOX_ACCESS_TOKEN` | Traffic-aware routing; OSRM is used without it. |
| `ALLOWED_ORIGINS` | Add the LAN address to run the two consoles on two machines. |

---

## Known limitations

- Opening inventory is seeded; there is no LIS ingestion yet.
- Consoles poll every 2.5s rather than using websockets — fine at this scale, not at national scale.
- The forecast model is trained on German data; Indian seasonality is applied as a calibration index, not learned.
- One backend serves both facilities. A real deployment would federate per-facility instances behind a registry.
- Cold-chain temperature is an instruction to the courier, not telemetry. No IoT sensor is integrated, and the UI does not claim one.

---

## Repository

```
backend/
  routers/        auth · facilities · transfers · webhooks · forecast · inventory
  services/       otp · inventory_ledger · routing · courier_tracking · facility_registry
  services/transport/   shiprocket · porter · beckn · internal (one interface)
  models/         SQLAlchemy schema
frontend/src/
  screens/        LoginScreen · FacilitySelectScreen · TransfersScreen · TransferTrackingScreen
  components/     RouteMap (Leaflet) · OtpPanels
  api/            typed client, dynamic facility scoping
docs/TRANSFERS.md the transfer pipeline in detail
start.bat / start.sh
```

---

*Built for DSU DevHack 3.0. Facility data from the eRaktKosh national blood bank registry, Ministry of Health & Family Welfare.*
