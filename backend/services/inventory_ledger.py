"""
Inventory movements behind a transfer.

A transfer touches real ``InventoryUnit`` rows, not a counter:

  ``reserve_units``  AVAILABLE -> RESERVED on the sending facility, choosing
                     the units closest to expiry first (FEFO) so a transfer
                     drains the stock that would otherwise be wasted.
  ``release_units``  RESERVED -> AVAILABLE when a transfer is declined,
                     cancelled, or the courier dispatch fails.
  ``settle_units``   On delivery, the reserved rows are re-parented to the
                     receiving facility and marked AVAILABLE there.

Every step writes an ``InventoryEvent``, so the two ledgers reconcile and the
audit trail shows which bag went where.
"""

import datetime
import json
import uuid
from typing import Dict, List

from sqlalchemy.orm import Session

from models.inventory import InventoryEvent, InventoryUnit


class InsufficientStock(Exception):
    """Raised when a facility cannot cover a requested transfer."""

    def __init__(self, available: int, requested: int, component_type: str):
        self.available = available
        self.requested = requested
        self.component_type = component_type
        super().__init__(
            f"Only {available} usable {component_type} unit(s) available; {requested} requested."
        )


def _log_event(
    db: Session,
    unit: InventoryUnit,
    bank_id: str,
    event_type: str,
    actor_user_id: str,
    reason: str,
    metadata: Dict,
) -> None:
    db.add(
        InventoryEvent(
            id=str(uuid.uuid4()),
            unit_id=unit.id,
            bank_id=bank_id,
            event_type=event_type,
            actor_user_id=actor_user_id,
            occurred_at=datetime.datetime.utcnow(),
            reason=reason,
            metadata_json=json.dumps(metadata),
        )
    )


def count_available(db: Session, bank_id: str, component_type: str, blood_group: str = None) -> int:
    query = db.query(InventoryUnit).filter(
        InventoryUnit.bank_id == bank_id,
        InventoryUnit.component_type == component_type,
        InventoryUnit.status == "AVAILABLE",
        InventoryUnit.expiry_at > datetime.datetime.utcnow(),
    )
    if blood_group:
        query = query.filter(InventoryUnit.blood_group == blood_group)
    return query.count()


def reserve_units(
    db: Session,
    bank_id: str,
    component_type: str,
    quantity: int,
    transfer_id: str,
    actor_user_id: str,
    blood_group: str = None,
) -> List[str]:
    """
    Lock ``quantity`` usable units, nearest expiry first.

    Raises ``InsufficientStock`` and leaves the ledger untouched if the
    facility cannot cover the request.
    """
    query = db.query(InventoryUnit).filter(
        InventoryUnit.bank_id == bank_id,
        InventoryUnit.component_type == component_type,
        InventoryUnit.status == "AVAILABLE",
        InventoryUnit.expiry_at > datetime.datetime.utcnow(),
    )
    if blood_group:
        query = query.filter(InventoryUnit.blood_group == blood_group)

    candidates = query.order_by(InventoryUnit.expiry_at.asc()).limit(quantity).all()

    if len(candidates) < quantity:
        raise InsufficientStock(len(candidates), quantity, component_type)

    reserved_ids = []
    for unit in candidates:
        unit.status = "RESERVED"
        unit.version = (unit.version or 1) + 1
        reserved_ids.append(unit.id)
        _log_event(
            db, unit, bank_id, "RESERVED", actor_user_id,
            f"Reserved for transfer {transfer_id}",
            {"transfer_id": transfer_id, "bag_id": unit.bag_id},
        )

    db.commit()
    return reserved_ids


def release_units(db: Session, unit_ids: List[str], transfer_id: str, actor_user_id: str, reason: str) -> int:
    """Return reserved units to the sending facility's usable pool."""
    if not unit_ids:
        return 0

    units = db.query(InventoryUnit).filter(
        InventoryUnit.id.in_(unit_ids),
        InventoryUnit.status == "RESERVED",
    ).all()

    for unit in units:
        unit.status = "AVAILABLE"
        unit.version = (unit.version or 1) + 1
        _log_event(
            db, unit, unit.bank_id, "RELEASED", actor_user_id,
            reason,
            {"transfer_id": transfer_id, "bag_id": unit.bag_id},
        )

    db.commit()
    return len(units)


def settle_units(
    db: Session,
    unit_ids: List[str],
    source_bank_id: str,
    destination_bank_id: str,
    transfer_id: str,
    actor_user_id: str,
) -> Dict[str, int]:
    """
    Hand the reserved units over to the receiving facility.

    The same physical bag keeps its id and bag number and simply changes
    custody, so its expiry and provenance survive the move.
    """
    if not unit_ids:
        return {"transferred": 0}

    units = db.query(InventoryUnit).filter(InventoryUnit.id.in_(unit_ids)).all()

    transferred = 0
    for unit in units:
        if unit.status != "RESERVED" or unit.bank_id != source_bank_id:
            # Already settled, or moved by another process — skip rather than
            # double-count it onto the receiving ledger.
            continue

        _log_event(
            db, unit, source_bank_id, "TRANSFERRED_OUT", actor_user_id,
            f"Delivered to {destination_bank_id} under transfer {transfer_id}",
            {"transfer_id": transfer_id, "bag_id": unit.bag_id, "to": destination_bank_id},
        )

        unit.bank_id = destination_bank_id
        unit.status = "AVAILABLE"
        unit.version = (unit.version or 1) + 1
        transferred += 1

        _log_event(
            db, unit, destination_bank_id, "TRANSFERRED_IN", actor_user_id,
            f"Received from {source_bank_id} under transfer {transfer_id}",
            {"transfer_id": transfer_id, "bag_id": unit.bag_id, "from": source_bank_id},
        )

    db.commit()
    return {"transferred": transferred}


def expiring_units(db: Session, bank_id: str, component_type: str, within_hours: int = 24) -> List[InventoryUnit]:
    """Usable units that will expire inside ``within_hours`` — wastage-push candidates."""
    now = datetime.datetime.utcnow()
    return (
        db.query(InventoryUnit)
        .filter(
            InventoryUnit.bank_id == bank_id,
            InventoryUnit.component_type == component_type,
            InventoryUnit.status == "AVAILABLE",
            InventoryUnit.expiry_at > now,
            InventoryUnit.expiry_at <= now + datetime.timedelta(hours=within_hours),
        )
        .order_by(InventoryUnit.expiry_at.asc())
        .all()
    )
