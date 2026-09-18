import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class Bank(Base):
    __tablename__ = "banks"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    city = Column(String, nullable=False)
    state = Column(String, nullable=False)
    district = Column(String, nullable=True)
    timezone = Column(String, default="Asia/Kolkata")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    memberships = relationship("BankMembership", back_populates="bank")


class BankMembership(Base):
    __tablename__ = "bank_memberships"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    bank_id = Column(String, ForeignKey("banks.id"), nullable=False)
    role = Column(String, default="OFFICER")  # TECHNICIAN | OFFICER | COMMITTEE | ADMIN
    active = Column(Boolean, default=True)

    bank = relationship("Bank", back_populates="memberships")
