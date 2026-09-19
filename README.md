# PlateletIQ — Predictive Platelet Demand & Inventory Platform

> **Hackathon Track**: DSU DevHack 3.0 | Healthcare + AI/ML Track  
> **Coverage**: 20 eRaktKosh-registered blood centres across Chennai

PlateletIQ is an intelligent, end-to-end clinical platform designed to predict platelet demand, optimize stock levels, prevent expiry wastage, and coordinate regional inter-bank transfers across Indian blood bank networks.

---

## 🌟 Key Features

- **Predictive Demand Forecasting**: Machine Learning model (LASSO v1.4) inferring 7-day quantile forecasts ($q_{50}$, $q_{67}$, $q_{90}$) with uncertainty bounds and weekend adjustments.
- **Deterministic Decision Engine**: Evaluates net inventory position to output actionable operational recommendations (`HOLD`, `PROCURE`, `COLLECT`) with traceable evidence chains.
- **Inter-facility transfers**: Sign in at any registered facility and pull units you are short of, or push units about to expire. The sending facility authorises, reserves stock nearest-expiry-first, and books a courier; custody is verified with a one-time code at each end, and units physically move between the two ledgers. See [docs/TRANSFERS.md](docs/TRANSFERS.md).
- **Live shipment tracking**: Road-routed map (Mapbox or OSRM), moving courier marker, and a scan-by-scan timeline, visible to both facilities from the same source of truth.
- **Regional Network Scraper**: Scrapes and aggregates stock data from 756 hospitals across 32 districts via eRaktKosh integration to flag SDP scarcity and inter-bank transfer opportunities.
- **Inventory Expiry Management**: 5-day shelf-life visual distribution strip, First-In First-Out (FIFO) issuance enforcement, and urgent 24h expiry watch list.
- **WHO Transfusion Guidelines Concordance**: Automated clinical check comparing patient platelet counts and bleeding status against guidelines.

---

## 🏗️ Architecture

PlateletIQ operates on a **Decoupled Two-Track Data Architecture**:
- **Track 1 (Forecasting & Operations)**: Trained LASSO ML model artifact (`ml/plateletiq_model.joblib`) evaluated on 4,018 training days (Aachen hospital dataset 2008–2018) calibrated with WHO India monthly index.
- **Track 2 (Regional Network Scraper)**: Scraped dataset (`eraktkosh.db`) covering 756 hospitals to provide stock visibility without corrupting ML demand models.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS 4, TanStack Query 5, Recharts 3, Framer Motion, Leaflet (OpenStreetMap)
- **Backend**: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0, Uvicorn
- **ML Engine**: `scikit-learn` LASSO regression pipeline
- **Logistics**: Shiprocket courier API; Mapbox Directions or OSRM for road routing
- **Auth**: Google Identity Services, then facility selection
- **Database**: SQLite (`plateletiq.db` local / `eraktkosh.db` scraper) / Supabase PostgreSQL 15 (production)

---

## 🚀 Quick Start

### One command

**Windows** — double-click `start.bat`, or from a Command Prompt:

```cmd
start.bat
```

**macOS / Linux**:

```bash
./start.sh
```

It creates the virtual environment, installs both sets of dependencies,
generates `backend/.env` with fresh secrets, starts the backend, **waits until
the API actually answers**, then starts the frontend and opens the browser.
Re-running it skips whatever is already in place.

Order matters: the UI reads the API's configuration when it loads, so the
backend has to be answering first.

### Or by hand

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # .venv\Scripts\activate on Windows
pip install -r requirements.txt
python ../scripts/bootstrap_env.py  # writes .env with generated secrets
python -m uvicorn main:app --port 8000
```

The facility registry and each facility's opening stock are seeded
automatically on first start. `http://127.0.0.1:8000/api/v1/health` reports
which integrations are actually configured. API docs are at `/docs`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173/`, sign in, then pick which facility you are on
duty at. Everything after that — your inventory, your forecast, and which side
of a transfer you are on — follows from that choice.

---

## 🧪 Running the two-hospital transfer

You need **one backend** and **two browsers** signed in at **different
facilities**. Two profiles or a private window on one machine works; two
laptops on the same network works the same way.

**For two machines**, the second one needs to reach the first. On the machine
running the backend, set in `backend/.env`:

```bash
ALLOWED_ORIGINS=http://localhost:5173,http://192.168.1.42:5173   # your LAN IP
```

and start both servers with `--host 0.0.0.0`:

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000
npm run dev -- --host 0.0.0.0
```

The second laptop opens `http://192.168.1.42:5173`. The frontend derives the
API address from the host the page was served from, so no rebuild is needed.

**The flow:**

| # | Where | What happens |
|---|---|---|
| 1 | Both | Sign in, then choose a facility — say **Laptop A → RGGGH Chennai**, **Laptop B → Apollo Greams Road** |
| 2 | B | **Transfers → Request units**, pick RGGGH, set 12 SDP units, send |
| 3 | A | The request appears under *Needs your action* within ~2.5s. No refresh — both consoles poll the same backend |
| 4 | A | **Authorise and book courier** → units reserve, courier books, and **A's pickup code** appears. It is shown on A only |
| 5 | A | Enter that code under *Confirm pickup* → status goes to **In transit**, and **A's receipt code** for B appears |
| 6 | Both | **Track shipment** — live map, moving marker, shared timeline |
| 7 | A → B | Pass the receipt code to B the way you would in practice (phone, radio) |
| 8 | B | Enter it under *Confirm receipt* → 12 units leave A's ledger and land on B's |

What the server refuses, so the handshake is real rather than decorative: B
cannot authorise its own request, A cannot redeem the receipt code it issued,
and neither console can read a code issued to the other. A code lost off-screen
is recovered by re-issuing it, which invalidates the old one.

### Courier and routing

Without Shiprocket credentials the courier is simulated and says so in the UI
and on `/health`; set `TRANSPORT_MODE=live` plus `SHIPROCKET_EMAIL` /
`SHIPROCKET_PASSWORD` to book real shipments. Routing uses Mapbox when
`MAPBOX_ACCESS_TOKEN` is set, otherwise the public OSRM server, which needs no
key. If both are unreachable the app falls back to a straight-line estimate and
labels it as one rather than passing it off as a road route.

---

## 📊 Performance Benchmarks

| Metric | PlateletIQ | Naive Baseline | Schilling et al. Benchmark |
| :--- | :--- | :--- | :--- |
| **MASE Score** | **0.734** | 0.993 | 0.746 |
| **Wastage Rate** | **3.25%** | 9.61% | — |
| **Annual Savings** | **₹7,20,000 / hospital** | ₹0 | — |
