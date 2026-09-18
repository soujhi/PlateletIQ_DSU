import uuid
import datetime
import random
import json
from sqlalchemy.orm import Session
from database import SessionLocal, Base, engine
from models import (
    Bank,
    BankMembership,
    InventoryUnit,
    InventoryEvent,
    ForecastRun,
    Forecast,
    Recommendation,
    Requisition,
    TransferOpportunity,
)

DEMO_BANK_ID = "TN-GGH-001"
DEMO_USER_ID = "demo-user-001"


def seed_demo_data(db: Session = None):
    close_session = False
    if db is None:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        close_session = True

    try:
        # Check if bank already exists
        existing_bank = db.query(Bank).filter(Bank.id == DEMO_BANK_ID).first()
        if existing_bank:
            print("Demo bank already seeded.")
            return

        print("Seeding demo data for PlateletIQ...")

        # 1. Bank
        bank = Bank(
            id=DEMO_BANK_ID,
            name="Govt. General Hospital Chennai",
            code="TN-GGH-001",
            city="Chennai",
            state="Tamil Nadu",
            district="603",
            latitude=13.0827,
            longitude=80.2707,
            active=True,
        )
        db.add(bank)

        # 2. Bank Membership
        membership = BankMembership(
            id=str(uuid.uuid4()),
            user_id=DEMO_USER_ID,
            bank_id=DEMO_BANK_ID,
            role="OFFICER",
            active=True,
        )
        db.add(membership)

        now = datetime.datetime.utcnow()

        # 3. 48 Seeded Inventory Units
        # Distribution: 9 today (within 24h), 14 in 1d (24-48h), 13 in 2d (48-72h), 12 in 3d (72-96h)
        # 80% RDP, 20% SDP
        blood_groups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
        
        bands = [
            (9, 3, 20),     # 9 units expiring in 3-20h (Today)
            (14, 25, 44),   # 14 units expiring in 25-44h (1d)
            (13, 49, 68),   # 13 units expiring in 49-68h (2d)
            (12, 73, 92),   # 12 units expiring in 73-92h (3d)
        ]

        unit_counter = 1
        for count, min_h, max_h in bands:
            for _ in range(count):
                comp_type = "SDP" if random.random() < 0.20 else "RDP"
                bg = random.choice(blood_groups)
                hours = random.randint(min_h, max_h)
                exp_at = now + datetime.timedelta(hours=hours)
                coll_at = exp_at - datetime.timedelta(days=5)

                bag_id = f"{comp_type}-{8000 + unit_counter}"
                unit_counter += 1

                unit = InventoryUnit(
                    id=str(uuid.uuid4()),
                    bank_id=DEMO_BANK_ID,
                    bag_id=bag_id,
                    component_type=comp_type,
                    blood_group=bg,
                    collection_at=coll_at,
                    expiry_at=exp_at,
                    status="AVAILABLE",
                    source_type="SEEDED",
                )
                db.add(unit)

                event = InventoryEvent(
                    id=str(uuid.uuid4()),
                    unit_id=unit.id,
                    bank_id=DEMO_BANK_ID,
                    event_type="COLLECTED",
                    actor_user_id="demo-user-001",
                    occurred_at=coll_at,
                    metadata_json=json.dumps({
                        "bag_id": bag_id,
                        "component_type": comp_type,
                        "blood_group": bg,
                        "source": "SEEDED_DEMO",
                    }),
                )
                db.add(event)

        # 4. Forecast Run + 7 Forecast Rows
        run = ForecastRun(
            id="seed-run-001",
            bank_id=DEMO_BANK_ID,
            model_version="LASSO v1.4",
            status="SUCCEEDED",
            started_at=now,
            completed_at=now,
            history_days=180,
        )
        db.add(run)

        q50_base = [21.0, 24.0, 29.0, 27.0, 25.0, 20.0, 31.0]
        today_date = datetime.date.today()
        for i in range(7):
            f_date = today_date + datetime.timedelta(days=i + 1)
            q50 = q50_base[i]
            fc = Forecast(
                id=str(uuid.uuid4()),
                bank_id=DEMO_BANK_ID,
                forecast_run_id=run.id,
                forecast_date=f_date,
                horizon_day=i + 1,
                q50=q50,
                q67=round(q50 * 1.18, 2),
                q90=round(q50 * 1.40, 2),
                model_version="LASSO v1.4",
            )
            db.add(fc)

        # 5. Recommendation (HOLD / PROCURE 18)
        rec = Recommendation(
            id="rec-demo-001",
            bank_id=DEMO_BANK_ID,
            forecast_run_id=run.id,
            action="HOLD",
            quantity=0,
            reason_summary="Current inventory covers expected near-term demand. No immediate collection required.",
            drivers_json=json.dumps([
                "7-day projected demand: 177.0 units (q50 point estimate)",
                "Usable available inventory: 48 units",
                "Safety stock buffer target: 15 units (alpha=13)",
                "Net position: +41 units surplus over 7 days",
            ]),
            status="ACTIVE",
        )
        db.add(rec)

        # 6. 3 Requisitions
        req1 = Requisition(
            id=str(uuid.uuid4()),
            bank_id=DEMO_BANK_ID,
            request_ref="REQ-8021A",
            ward="ICU - Bed 12",
            priority="URGENT",
            clinical_indication="Severe Thrombocytopenia",
            platelet_count=12.0,
            bleeding_status=False,
            units_requested=2,
            component_requested="RDP",
            status="PENDING",
            concordance_flag=True,
            guideline_note="Request falls within WHO prophylactic threshold (<20 × 10⁹/L).",
            submitted_at=now - datetime.timedelta(hours=2),
        )
        req2 = Requisition(
            id=str(uuid.uuid4()),
            bank_id=DEMO_BANK_ID,
            request_ref="REQ-7984B",
            ward="Ward 4B - Oncology",
            priority="ROUTINE",
            clinical_indication="Chemotherapy support",
            platelet_count=45.0,
            bleeding_status=False,
            units_requested=1,
            component_requested="RDP",
            status="PENDING",
            concordance_flag=False,
            guideline_note="Request falls outside WHO prophylactic (<20) and therapeutic (<50 with bleeding) thresholds. Review recommended.",
            submitted_at=now - datetime.timedelta(hours=5),
        )
        req3 = Requisition(
            id=str(uuid.uuid4()),
            bank_id=DEMO_BANK_ID,
            request_ref="REQ-7910C",
            ward="Emergency OR",
            priority="EMERGENCY",
            clinical_indication="Active trauma hemorrhage",
            platelet_count=18.0,
            bleeding_status=True,
            units_requested=4,
            component_requested="SDP",
            status="FULFILLED",
            concordance_flag=True,
            guideline_note="Request falls within WHO therapeutic threshold (<50 × 10⁹/L with active bleeding).",
            submitted_at=now - datetime.timedelta(hours=12),
        )
        db.add_all([req1, req2, req3])

        # 7. Transfer Opportunities
        opp1 = TransferOpportunity(
            id="opp-001",
            source_bank_id="BLR-URB-001",
            source_bank_name="Bangalore Urban",
            destination_bank_id=DEMO_BANK_ID,
            component_type="SDP",
            potential_quantity=60,
            source_freshness_hours=12.0,
            reason_summary="Bangalore Urban has 60 SDP units with zero expected local deficit. Chennai projected shortage in 4 days.",
            status="OPEN",
        )
        opp2 = TransferOpportunity(
            id="opp-002",
            source_bank_id="MUM-CTY-001",
            source_bank_name="Mumbai City",
            destination_bank_id=DEMO_BANK_ID,
            component_type="SDP",
            potential_quantity=25,
            source_freshness_hours=14.0,
            reason_summary="Mumbai City surplus stock available for intra-regional balancing.",
            status="OPEN",
        )
        db.add_all([opp1, opp2])

        db.commit()
        print("Demo data seeded successfully!")
    finally:
        if close_session:
            db.close()


if __name__ == "__main__":
    import json
    seed_demo_data()
