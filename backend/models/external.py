import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class ExternalSnapshot(Base):
    __tablename__ = "external_snapshots"

    id = Column(String, primary_key=True)
    source = Column(String, default="eRaktKosh")
    retrieved_at = Column(DateTime, default=datetime.datetime.utcnow)
    parser_version = Column(String, default="1.0")
    status = Column(String, default="SUCCESS")
    record_count = Column(Integer, default=0)

    records = relationship("ExternalInventoryRecord", back_populates="snapshot")


class ExternalInventoryRecord(Base):
    __tablename__ = "external_inventory_records"

    id = Column(String, primary_key=True)
    snapshot_id = Column(String, ForeignKey("external_snapshots.id"), nullable=False)
    hospital_name = Column(String, nullable=False)
    state = Column(String, nullable=False)
    district = Column(String, nullable=False)
    component_type = Column(String, nullable=False)  # SDP | PC | RDP | UNKNOWN
    reported_quantity = Column(Integer, default=0)
    source_entry_date = Column(DateTime, nullable=True)
    retrieved_at = Column(DateTime, default=datetime.datetime.utcnow)

    snapshot = relationship("ExternalSnapshot", back_populates="records")
