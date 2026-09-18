# PlateletIQ — Predictive Platelet Demand & Inventory Platform

> **Hackathon Track**: DSU DevHack 3.0 | Healthcare + AI/ML Track  
> **Facility Focus**: Govt. General Hospital Chennai (`TN-GGH-001`)

PlateletIQ is an intelligent, end-to-end clinical platform designed to predict platelet demand, optimize stock levels, prevent expiry wastage, and coordinate regional inter-bank transfers across Indian blood bank networks.

---

## 🌟 Key Features

- **Predictive Demand Forecasting**: Machine Learning model (LASSO v1.4) inferring 7-day quantile forecasts ($q_{50}$, $q_{67}$, $q_{90}$) with uncertainty bounds and weekend adjustments.
- **Deterministic Decision Engine**: Evaluates net inventory position to output actionable operational recommendations (`HOLD`, `PROCURE`, `COLLECT`) with traceable evidence chains.
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

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS 4, TanStack Query 5, Recharts 3, Framer Motion 11, `react-globe.gl`
- **Backend**: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0, Uvicorn
- **ML Engine**: `scikit-learn` LASSO regression pipeline
- **Database**: SQLite (`plateletiq.db` local / `eraktkosh.db` scraper) / Supabase PostgreSQL 15 (production)

---

## 🚀 Quick Start

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Or .venv\Scripts\activate on Windows
pip install -r requirements.txt
python seed.py
python -m uvicorn main:app --port 8000
```
API Documentation will be available at `http://127.0.0.1:8000/docs`.

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173/` in your browser and click **Continue as demo user**.

---

## 📊 Performance Benchmarks

| Metric | PlateletIQ | Naive Baseline | Schilling et al. Benchmark |
| :--- | :--- | :--- | :--- |
| **MASE Score** | **0.734** | 0.993 | 0.746 |
| **Wastage Rate** | **3.25%** | 9.61% | — |
| **Annual Savings** | **₹7,20,000 / hospital** | ₹0 | — |
