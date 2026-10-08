"""Capteurs Home Assistant pour Antigravity Pulse."""

from __future__ import annotations

from datetime import datetime, timezone
import logging
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import (
    CoordinatorEntity,
    DataUpdateCoordinator,
)

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Création des entités capteurs Antigravity Pulse."""
    coordinator: DataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]

    device_info = DeviceInfo(
        identifiers={(DOMAIN, entry.entry_id)},
        name="Antigravity Pulse",
        manufacturer="Google DeepMind / Antigravity",
        model="Gemini Quota & Token Tracker",
        sw_version=coordinator.data.get("config", {}).get("version", "1.7.4") if coordinator.data else "1.7.4",
    )

    sensors = [
        Antigravity5hQuotaSensor(coordinator, entry, device_info),
        AntigravityWeeklyQuotaSensor(coordinator, entry, device_info),
        AntigravityReset5hSensor(coordinator, entry, device_info),
        AntigravityResetWeeklySensor(coordinator, entry, device_info),
        AntigravityTodayTokensSensor(coordinator, entry, device_info),
        AntigravityTodayCallsSensor(coordinator, entry, device_info),
        AntigravitySavedValueSensor(coordinator, entry, device_info),
    ]

    async_add_entities(sensors)


class BaseAntigravitySensor(CoordinatorEntity, SensorEntity):
    """Classe de base pour les capteurs Antigravity Pulse."""

    def __init__(
        self,
        coordinator: DataUpdateCoordinator,
        entry: ConfigEntry,
        device_info: DeviceInfo,
        key: str,
        name: str,
    ) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._attr_device_info = device_info
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_has_entity_name = True
        self._attr_translation_key = key
        self._attr_name = name


class Antigravity5hQuotaSensor(BaseAntigravitySensor):
    """Capteur Quota 5 Heures avec calcul dynamique de réinitialisation."""

    def __init__(self, coordinator, entry, device_info):
        super().__init__(coordinator, entry, device_info, "quota_5h", "Quota 5 Heures")
        self._attr_native_unit_of_measurement = "%"
        self._attr_state_class = SensorStateClass.MEASUREMENT
        self._attr_icon = "mdi:timer-sand"

    @property
    def native_value(self) -> float:
        data = self.coordinator.data or {}
        q = data.get("quota_5h", {})
        rem = float(q.get("remaining_pct", 100.0))
        iso = q.get("reset_time_iso")

        if iso:
            try:
                dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
                if dt <= datetime.now(timezone.utc):
                    return 100.0
            except Exception:
                pass
        return rem

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = self.coordinator.data or {}
        q = data.get("quota_5h", {})
        return {
            "reset_in": q.get("reset_in", "Prêt"),
            "reset_date": q.get("reset_date", "Prêt"),
            "calls": q.get("calls", 0),
            "tokens": q.get("tokens", 0),
            "used_pct": q.get("used_pct", 0.0),
        }


class AntigravityWeeklyQuotaSensor(BaseAntigravitySensor):
    """Capteur Quota Semaine avec calcul dynamique de réinitialisation."""

    def __init__(self, coordinator, entry, device_info):
        super().__init__(coordinator, entry, device_info, "quota_weekly", "Quota Semaine")
        self._attr_native_unit_of_measurement = "%"
        self._attr_state_class = SensorStateClass.MEASUREMENT
        self._attr_icon = "mdi:calendar-week"

    @property
    def native_value(self) -> float:
        data = self.coordinator.data or {}
        qw = data.get("quota_weekly", {})
        rem = float(qw.get("remaining_pct", 100.0))
        iso = qw.get("reset_time_iso")

        if iso:
            try:
                dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
                if dt <= datetime.now(timezone.utc):
                    return 100.0
            except Exception:
                pass
        return rem

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = self.coordinator.data or {}
        qw = data.get("quota_weekly", {})
        return {
            "reset_in": qw.get("reset_in", "Prêt"),
            "reset_date": qw.get("reset_date", "Prêt"),
            "calls": qw.get("calls", 0),
            "tokens": qw.get("tokens", 0),
            "used_pct": qw.get("used_pct", 0.0),
        }


class AntigravityReset5hSensor(BaseAntigravitySensor):
    """Capteur libellé reset 5 heures."""

    def __init__(self, coordinator, entry, device_info):
        super().__init__(coordinator, entry, device_info, "reset_5h_text", "Prochain Reset 5h")
        self._attr_icon = "mdi:clock-start"

    @property
    def native_value(self) -> str:
        data = self.coordinator.data or {}
        q = data.get("quota_5h", {})
        iso = q.get("reset_time_iso")
        if iso:
            try:
                dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
                if dt <= datetime.now(timezone.utc):
                    return "Prêt (100%)"
            except Exception:
                pass
        return str(q.get("reset_date") or q.get("reset_in") or "Prêt")


class AntigravityResetWeeklySensor(BaseAntigravitySensor):
    """Capteur libellé reset semaine."""

    def __init__(self, coordinator, entry, device_info):
        super().__init__(coordinator, entry, device_info, "reset_weekly_text", "Prochain Reset Semaine")
        self._attr_icon = "mdi:calendar-clock"

    @property
    def native_value(self) -> str:
        data = self.coordinator.data or {}
        qw = data.get("quota_weekly", {})
        iso = qw.get("reset_time_iso")
        if iso:
            try:
                dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
                if dt <= datetime.now(timezone.utc):
                    return "Prêt (100%)"
            except Exception:
                pass
        return str(qw.get("reset_date") or qw.get("reset_in") or "Prêt")


class AntigravityTodayTokensSensor(BaseAntigravitySensor):
    """Capteur tokens du jour."""

    def __init__(self, coordinator, entry, device_info):
        super().__init__(coordinator, entry, device_info, "tokens_today", "Tokens Aujourd'hui")
        self._attr_native_unit_of_measurement = "tok"
        self._attr_state_class = SensorStateClass.TOTAL
        self._attr_icon = "mdi:counter"

    @property
    def native_value(self) -> int:
        data = self.coordinator.data or {}
        return int(data.get("today", {}).get("total_tokens", 0))


class AntigravityTodayCallsSensor(BaseAntigravitySensor):
    """Capteur requêtes / appels du jour."""

    def __init__(self, coordinator, entry, device_info):
        super().__init__(coordinator, entry, device_info, "calls_today", "Requêtes Aujourd'hui")
        self._attr_native_unit_of_measurement = "appels"
        self._attr_state_class = SensorStateClass.TOTAL
        self._attr_icon = "mdi:api"

    @property
    def native_value(self) -> int:
        data = self.coordinator.data or {}
        return int(data.get("today", {}).get("calls", 0))


class AntigravitySavedValueSensor(BaseAntigravitySensor):
    """Capteur valeur financière API économisée."""

    def __init__(self, coordinator, entry, device_info):
        super().__init__(coordinator, entry, device_info, "saved_value", "Valeur API Économisée")
        self._attr_native_unit_of_measurement = "€"
        self._attr_device_class = SensorDeviceClass.MONETARY
        self._attr_icon = "mdi:currency-eur"

    @property
    def native_value(self) -> float:
        data = self.coordinator.data or {}
        val = data.get("today", {}).get("api_value_eur", 0.0)
        return round(float(val), 2)
