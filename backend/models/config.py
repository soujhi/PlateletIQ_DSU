import datetime
from sqlalchemy import Column, String, Text, DateTime
from database import Base


class SystemConfig(Base):
    __tablename__ = "system_config"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)
    unit = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    updated_by = Column(String, nullable=True, default="system")
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
