"""
PlateletIQ — Demand Model Adapter
===================================
Drop-in production adapter for the trained LASSO demand model.

Usage
-----
from model_adapter import PlateletDemandModel

model = PlateletDemandModel(path="plateletiq_model.joblib")
result = model.predict(history_series, forecast_dates)

history_series : pd.Series
    Daily platelet units issued.
    Index: pd.DatetimeIndex (daily, no gaps preferred).
    Values: float or int, non-negative.

forecast_dates : list[datetime.date]
    The dates you want forecasts for.
    Typically the next 7 days from today.

Returns
-------
dict with keys:
    model_version   str
    forecast        list of {date, q50, q67, q90}
    generated_at    ISO timestamp
    history_end     last date in history_series
    metadata        provenance dict
    limitations     list of known limitations
"""

from __future__ import annotations
import datetime
import os
import warnings
from typing import Optional

import joblib
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# ─── Holiday calendar (German NRW public holidays) ──────────────────────────
_HOLIDAYS: set[tuple[int, int]] = {
    (1, 1), (5, 1), (10, 3), (10, 31), (11, 1), (12, 25), (12, 26)
}


def _build_features(s: pd.Series, halflife: int = 365) -> pd.DataFrame:
    """
    Reconstruct the exact feature matrix used during training.
    Input s must be a daily pd.Series with DatetimeIndex, values = units issued.
    """
    feats = pd.DataFrame(index=s.index)

    # Day-of-week dummies (0=Mon … 6=Sun)
    for d in range(7):
        feats[f"dow_{d}"] = (s.index.dayofweek == d).astype(int)

    # Month dummies
    for m in range(1, 13):
        feats[f"mon_{m}"] = (s.index.month == m).astype(int)

    # Lag features
    for lag in [1, 2, 3, 4, 5, 6, 7, 14, 21]:
        feats[f"lag_{lag}"] = s.shift(lag)

    # Rolling averages
    for w in [7, 14, 28]:
        feats[f"roll_{w}"] = s.shift(1).rolling(w).mean()

    # Recency-weighted 7-day roll
    def _wroll(x: np.ndarray) -> float:
        if len(x) < 7:
            return float("nan")
        wts = np.exp(-np.arange(len(x)) / (halflife / 365 * 7))[::-1]
        wts = wts / wts.sum()
        return float((x * wts).sum())

    feats["roll_7_w"] = s.shift(1).rolling(7).apply(_wroll, raw=True)

    # Trend (years since first observation in training)
    feats["trend"] = (s.index - s.index[0]).days / 365.25

    # Public holidays
    feats["holiday"] = [
        (m, d) in _HOLIDAYS for m, d in zip(s.index.month, s.index.day)
    ]

    # Weekend + no-delivery flag
    feats["weekend"] = (s.index.dayofweek >= 5).astype(int)
    feats["no_delivery"] = (s.index.dayofweek >= 5).astype(int)

    # Sqrt of previous day's demand
    feats["demand_sqrt"] = np.sqrt(s.shift(1).clip(lower=0))

    return feats.ffill().fillna(0)


class ModelNotLoadedError(RuntimeError):
    """Raised when the model artifact cannot be loaded."""


class InsufficientHistoryError(ValueError):
    """Raised when the history series is too short to build reliable features."""


class PlateletDemandModel:
    """
    Production adapter around the trained PlateletIQ LASSO model.

    Invariants
    ----------
    - Predictions are always non-negative.
    - The sqrt target transform is inverted before returning.
    - q50 / q67 / q90 are derived from the point estimate using a
      conservative quantile scale (not from a probabilistic model).
    - The model is never retrained here; it only runs inference.
    """

    # Quantile scale factors derived from simulator at alpha=13 policy
    _Q67_FACTOR = 1.18
    _Q90_FACTOR = 1.40

    def __init__(self, path: str = "plateletiq_model.joblib") -> None:
        if not os.path.exists(path):
            raise ModelNotLoadedError(
                f"Model artifact not found at {path!r}. "
                "Ensure plateletiq_model.joblib is present."
            )
        self._pkg = joblib.load(path)
        self._pipeline = self._pkg["pipeline"]
        self._halflife = self._pkg.get("halflife", 365)
        self._feature_names = self._pkg["feature_names"]
        self.model_version: str = self._pkg["model_version"]
        self._metrics: dict = self._pkg.get("metrics", {})
        self._limitations: list[str] = self._pkg.get("limitations", [])
        self._training_end: str = self._pkg.get("train_end", "2016-12-31")

    # ── Public interface ─────────────────────────────────────────────────────

    def validate_history(self, history: pd.Series) -> dict:
        """
        Validate the history series before inference.

        Returns {"valid": bool, "warnings": [...], "errors": [...]}.
        """
        errors: list[str] = []
        warnings_: list[str] = []

        if not isinstance(history.index, pd.DatetimeIndex):
            errors.append("History must have a DatetimeIndex.")
        if len(history) < 30:
            errors.append(
                f"Need at least 30 days of history; got {len(history)}."
            )
        elif len(history) < 90:
            warnings_.append(
                "Less than 90 days of history — rolling features will "
                "be less reliable. Collect more data before relying on forecasts."
            )

        if (history < 0).any():
            errors.append("History contains negative values.")

        # Check for large gaps
        if isinstance(history.index, pd.DatetimeIndex):
            diffs = history.index.to_series().diff().dt.days.dropna()
            big_gaps = (diffs > 2).sum()
            if big_gaps > 0:
                warnings_.append(
                    f"{big_gaps} gap(s) > 2 days found. "
                    "Forward-fill will be applied, which may reduce accuracy."
                )

        return {"valid": len(errors) == 0, "warnings": warnings_, "errors": errors}

    def predict(
        self,
        history: pd.Series,
        forecast_dates: list,
        *,
        validate: bool = True,
    ) -> dict:
        """
        Run inference for the given forecast dates.

        Parameters
        ----------
        history        : daily pd.Series, DatetimeIndex, units issued
        forecast_dates : list of datetime.date or str "YYYY-MM-DD"
        validate       : run validate_history() first (default True)

        Returns
        -------
        {
            "model_version": str,
            "forecast": [{"date": str, "q50": float, "q67": float, "q90": float}, ...],
            "generated_at": str (ISO),
            "history_end": str,
            "metadata": {...},
            "limitations": [...],
        }
        """
        if validate:
            v = self.validate_history(history)
            if not v["valid"]:
                raise InsufficientHistoryError("; ".join(v["errors"]))

        # Normalise forecast_dates
        fd_dates = [
            datetime.date.fromisoformat(str(d)) if not isinstance(d, datetime.date) else d
            for d in forecast_dates
        ]

        # Build an extended series that includes forecast date rows
        # using the last known value for lag construction
        history = history.copy().asfreq("D").ffill()
        horizon_index = pd.DatetimeIndex(
            [pd.Timestamp(d) for d in fd_dates]
        )
        extended = pd.concat(
            [history, pd.Series(np.nan, index=horizon_index)]
        )
        extended = extended[~extended.index.duplicated(keep="first")]
        extended = extended.sort_index()

        # Build features for the full extended series
        X_full = _build_features(extended, halflife=self._halflife)

        # Align to feature names from training
        for col in self._feature_names:
            if col not in X_full.columns:
                X_full[col] = 0.0
        X_full = X_full[self._feature_names]

        # Predict on horizon rows only
        X_horizon = X_full.loc[horizon_index]
        pred_sqrt = self._pipeline.predict(X_horizon)
        pred_q50 = np.maximum(pred_sqrt, 0.0) ** 2

        forecast = []
        for i, d in enumerate(fd_dates):
            q50 = float(pred_q50[i])
            forecast.append(
                {
                    "date": d.isoformat(),
                    "q50": round(q50, 2),
                    "q67": round(q50 * self._Q67_FACTOR, 2),
                    "q90": round(q50 * self._Q90_FACTOR, 2),
                }
            )

        return {
            "model_version": self.model_version,
            "forecast": forecast,
            "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "history_end": str(history.index.max().date()),
            "metadata": {
                "mase_on_holdout": self._metrics.get("mase"),
                "mape_on_holdout": self._metrics.get("mape"),
                "mae_on_holdout": self._metrics.get("mae"),
                "n_train_days": self._pkg.get("n_train"),
                "training_dataset": self._pkg.get("training_dataset"),
                "training_doi": self._pkg.get("training_doi"),
                "india_calibrated": self._pkg.get("india_calibrated", False),
            },
            "limitations": self._limitations,
        }

    def metadata(self) -> dict:
        """Return static model metadata for the model details drawer."""
        return {
            "model_version": self.model_version,
            "algorithm": "LASSO (L1 regularised linear regression)",
            "target_transform": "sqrt → inverse sqrt",
            "n_features_total": len(self._feature_names),
            "n_features_active": int(
                (self._pipeline.named_steps["lasso"].coef_ != 0).sum()
            ),
            "training_dataset": self._pkg.get("training_dataset"),
            "training_doi": self._pkg.get("training_doi"),
            "training_end_date": self._training_end,
            "holdout_mase": self._metrics.get("mase"),
            "holdout_mape": self._metrics.get("mape"),
            "india_calibrated": self._pkg.get("india_calibrated", False),
            "known_limitations": self._limitations,
            "release_gates": self._pkg.get("release_gates", {}),
        }

    def golden_fixture(self) -> dict:
        """
        Return the expected output for the Antigravity regression test.
        Run this against your adapter output after integration to confirm parity.
        """
        return {
            "model_version": self.model_version,
            "expected_mase_leq": 0.90,
            "training_days": self._pkg.get("n_train", 3214),
            "test_days": self._pkg.get("n_test", 804),
            "note": (
                "Feed the last 60 days of the training CSV as history, "
                "request forecasts for the first 7 days of the test set, "
                "compare q50 to actual values. "
                "MASE on that 7-day window should be < 0.90."
            ),
        }
