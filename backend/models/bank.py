import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class Bank(Base):
    """An eRaktKosh-registered blood centre able to send or receive transfers."""

    __tablename__ = "banks"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    short_name = Column(String, nullable=True)
    code = Column(String, unique=True, nullable=False)  # eRaktKosh registration code
    city = Column(String, nullable=False)
    state = Column(String, nullable=False)
    district = Column(String, nullable=True)
    tier = Column(String, nullable=True)
    address = Column(String, nullable=True)
    pincode = Column(String, nullable=True)  # courier serviceability lookups
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    timezone = Column(String, default="Asia/Kolkata")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    geo_source = Column(String, nullable=True)  # nominatim | registry
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    memberships = relationship("BankMembership", back_populates="bank")

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "short_name": self.short_name or self.name,
            "code": self.code,
            "city": self.city,
            "state": self.state,
            "district": self.district,
            "tier": self.tier,
            "address": self.address,
            "pincode": self.pincode,
            "phone": self.phone,
            "email": self.email,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "geo_source": self.geo_source,
            "active": self.active,
        }


class BankMembership(Base):
    """Binds an authenticated (Google) user to a facility with a role."""

    __tablename__ = "bank_memberships"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    email = Column(String, nullable=True)
    bank_id = Column(String, ForeignKey("banks.id"), nullable=False)
    role = Column(String, default="OFFICER")  # TECHNICIAN | OFFICER | COMMITTEE | ADMIN
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    bank = relationship("Bank", back_populates="memberships")
