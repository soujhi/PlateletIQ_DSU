"""
Seeds the facility registry and each facility's opening inventory.

Runs on every startup and is idempotent: existing facilities are refreshed
(address, pincode, contact, coordinates) but their inventory is left alone, so
restarting the API never rewrites a ledger that operators have been moving
units through.
"""

import datetime
import hashlib
import random
import uuid
from typing import Dict, List

from sqlalchemy.orm import Session

from models.bank import Bank
from models.inventory import InventoryEvent, InventoryUnit
from services.facility_registry import CHENNAI_DISTRICT_ID, list_facility_seeds, resolve_coordinates

BLOOD_GROUPS = ["O+", "A+", "B+", "AB+", "O-", "A-", "B-", "AB-"]
# Indian donor distribution, roughly: O+ and B+ dominate.
BLOOD_GROUP_WEIGHTS = [37, 22, 32, 7, 2, 1, 2, 1]

# Platelet shelf life. SDP/RDP are both 5 days from collection at 20-24 C.
PLATELET_SHELF_LIFE_HOURS = 120


def _rng_for(facility_id: str) -> random.Random:
    """
    Deterministic per-facility generator.

    Seeding from the facility id means a rebuilt database reproduces the same
    opening stock, so a demo is repeatable and two laptops pointed at separate
    databases still agree on the starting picture.
    """
    digest = hashlib.sha256(facility_id.encode("utf-8")).hexdigest()
    return random.Random(int(digest[:16], 16))


def _opening_stock(facility_id: str, tier: str) -> Dict[str, int]:
    """
    Opening SDP/RDP counts, scaled by the facility's role in the network.

    Government tertiary centres run large apheresis programmes; standalone
    blood centres hold fewer platelets but turn them over faster.
    """
    rng = _rng_for(facility_id)
    if "Government Tertiary" in tier or "Super-Specialty" in tier:
        return {"SDP": rng.randint(28, 52), "RDP": rng.randint(90, 150)}
    if "Teaching" in tier or "Quaternary" in tier:
        return {"SDP": rng.randint(18, 34), "RDP": rng.randint(60, 110)}
    if "Standalone" in tier or "Non-Profit" in tier:
        return {"SDP": rng.randint(6, 16), "RDP": rng.randint(20, 55)}
    if "Oncology" in tier or "Paediatric" in tier:
        # Heavy platelet consumers — they hold little and request often.
        return {"SDP": rng.randint(4, 12), "RDP": rng.randint(15, 40)}
    return {"SDP": rng.randint(10, 26), "RDP": rng.randint(30, 80)}


def seed_facilities(db: Session) -> Dict[str, int]:
    """Insert or refresh every registry facility. Coordinates are never blanked."""
    created = 0
    refreshed = 0

    for seed in list_facility_seeds():
        bank = db.query(Bank).filter(Bank.id == seed["id"]).first()

        if bank is None:
            coords = resolve_coordinates(seed)
            bank = Bank(
                id=seed["id"],
                name=seed["name"],
                short_name=seed["short_name"],
                code=seed["code"],
                city="Chennai",
                state="Tamil Nadu",
                district=CHENNAI_DISTRICT_ID,
                tier=seed["tier"],
                address=seed["address"],
                pincode=seed["pincode"],
                phone=seed["phone"],
                email=seed["email"],
                latitude=coords["latitude"],
                longitude=coords["longitude"],
                geo_source="nominatim" if coords["latitude"] != seed["latitude"] else "registry",
                active=True,
            )
            db.add(bank)
            created += 1
            continue

        # Refresh descriptive fields; keep whatever coordinates are already set
        # so an operator correction survives a restart.
        bank.name = seed["name"]
        bank.short_name = seed["short_name"]
        bank.code = seed["code"]
        bank.tier = seed["tier"]
        bank.address = seed["address"]
        bank.pincode = seed["pincode"]
        bank.phone = seed["phone"]
        bank.email = seed["email"]
        bank.city = "Chennai"
        bank.state = "Tamil Nadu"
        bank.district = CHENNAI_DISTRICT_ID
        if bank.latitude is None or bank.longitude is None:
            coords = resolve_coordinates(seed)
            bank.latitude = coords["latitude"]
            bank.longitude = coords["longitude"]
            bank.geo_source = "registry"
        refreshed += 1

    db.commit()
    return {"created": created, "refreshed": refreshed}


def seed_inventory_for_facility(db: Session, bank: Bank) -> int:
    """Give a facility its opening platelet stock. No-op if it already has units."""
    if db.query(InventoryUnit).filter(InventoryUnit.bank_id == bank.id).count() > 0:
        return 0

    rng = _rng_for(bank.id)
    now = datetime.datetime.utcnow()
    targets = _opening_stock(bank.id, bank.tier or "")
    created = 0

    for component_type, count in targets.items():
        for index in range(count):
            # Spread collection times across the shelf life so each facility has
            # a realistic mix of fresh units and near-expiry wastage candidates.
            age_hours = rng.uniform(1, PLATELET_SHELF_LIFE_HOURS - 6)
            collection_at = now - datetime.timedelta(hours=age_hours)
            expiry_at = collection_at + datetime.timedelta(hours=PLATELET_SHELF_LIFE_HOURS)

            unit = InventoryUnit(
                id=str(uuid.uuid4()),
                bank_id=bank.id,
                bag_id=f"{bank.code}-{component_type}-{now.strftime('%y%m%d')}-{index:04d}",
                component_type=component_type,
                blood_group=rng.choices(BLOOD_GROUPS, weights=BLOOD_GROUP_WEIGHTS, k=1)[0],
                collection_at=collection_at,
                expiry_at=expiry_at,
                status="AVAILABLE",
                source_type="SEEDED",
                version=1,
            )
            db.add(unit)
            db.add(
                InventoryEvent(
                    id=str(uuid.uuid4()),
                    unit_id=unit.id,
                    bank_id=bank.id,
                    event_type="REGISTERED",
                    actor_user_id="system-seed",
                    occurred_at=collection_at,
                    reason="Opening stock seeded from facility registry",
                    metadata_json=None,
                )
            )
            created += 1

    db.commit()
    return created


def seed_all_inventory(db: Session) -> Dict[str, int]:
    total = 0
    facilities = 0
    for bank in db.query(Bank).filter(Bank.active.is_(True)).all():
        created = seed_inventory_for_facility(db, bank)
        if created:
            facilities += 1
            total += created
    return {"facilities_seeded": facilities, "units_created": total}


def mark_expired_units(db: Session) -> int:
    """Flip anything past its expiry out of the usable pool."""
    now = datetime.datetime.utcnow()
    stale = (
        db.query(InventoryUnit)
        .filter(InventoryUnit.status == "AVAILABLE", InventoryUnit.expiry_at <= now)
        .all()
    )
    for unit in stale:
        unit.status = "EXPIRED"
        unit.version = (unit.version or 1) + 1
        db.add(
            InventoryEvent(
                id=str(uuid.uuid4()),
                unit_id=unit.id,
                bank_id=unit.bank_id,
                event_type="EXPIRED",
                actor_user_id="system",
                occurred_at=now,
                reason="Shelf life elapsed",
            )
        )
    if stale:
        db.commit()
    return len(stale)
