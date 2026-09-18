import datetime
from sqlalchemy import Column, String, DateTime, Integer, Float, ForeignKey, Text, Date
from sqlalchemy.orm import relationship
from database import Base


class ForecastRun(Base):
    __tablename__ = "forecast_runs"

    id = Column(String, primary_key=True)
    bank_id = Column(String, ForeignKey("banks.id"), nullable=False)
    model_version = Column(String, nullable=False)
    status = Column(String, default="SUCCEEDED")  # RUNNING | SUCCEEDED | FAILED
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    history_end = Column(String, nullable=True)
    history_days = Column(Integer, default=180)
    error_message = Column(Text, nullable=True)

    forecasts = relationship("Forecast", back_populates="run")
    recommendations = relationship("Recommendation", back_populates="run")


class Forecast(Base):
    __tablename__ = "forecasts"

    id = Column(String, primary_key=True)
    bank_id = Column(String, ForeignKey("banks.id"), nullable=False)
    forecast_run_id = Column(String, ForeignKey("forecast_runs.id"), nullable=False)
    forecast_date = Column(Date, nullable=False)
    horizon_day = Column(Integer, nullable=False)  # 1 to 7
    q50 = Column(Float, nullable=False)
    q67 = Column(Float, nullable=False)
    q90 = Column(Float, nullable=False)
    model_version = Column(String, nullable=False)
    generated_at = Column(DateTime, default=datetime.datetime.utcnow)

    run = relationship("ForecastRun", back_populates="forecasts")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(String, primary_key=True)
    bank_id = Column(String, ForeignKey("banks.id"), nullable=False)
    forecast_run_id = Column(String, ForeignKey("forecast_runs.id"), nullable=True)
    action = Column(String, nullable=False)  # HOLD | PROCURE | COLLECT
    quantity = Column(Integer, default=0)
    reason_summary = Column(Text, nullable=False)
    drivers_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    status = Column(String, default="ACTIVE")  # ACTIVE | CONFIRMED | ADJUSTED | EXPIRED | SUPERSEDED

    run = relationship("ForecastRun", back_populates="recommendations")
