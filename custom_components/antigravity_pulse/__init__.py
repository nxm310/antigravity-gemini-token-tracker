"""Intégration Antigravity Pulse pour Home Assistant."""

from __future__ import annotations

import logging
from datetime import timedelta
import aiohttp
import async_timeout

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import DOMAIN, CONF_URL, DEFAULT_URL, CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL

_LOGGER = logging.getLogger(__name__)
PLATFORMS: list[Platform] = [Platform.SENSOR]

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Configuration de l'entrée Antigravity Pulse depuis l'interface utilisateur."""
    hass.data.setdefault(DOMAIN, {})

    url = entry.data.get(CONF_URL, DEFAULT_URL)
    scan_interval = entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
    session = async_get_clientsession(hass)

    async def async_update_data():
        """Récupère les dernières données JSON depuis GitHub ou le serveur local."""
        try:
            async with async_timeout.timeout(15):
                async with session.get(url, headers={"Cache-Control": "no-cache"}) as response:
                    if response.status != 200:
                        raise UpdateFailed(f"Erreur HTTP {response.status} lors de la lecture des données")
                    return await response.json(content_type=None)
        except Exception as err:
            raise UpdateFailed(f"Impossible de joindre le flux Antigravity : {err}") from err

    coordinator = DataUpdateCoordinator(
        hass,
        _LOGGER,
        name=DOMAIN,
        update_method=async_update_data,
        update_interval=timedelta(seconds=scan_interval),
    )

    await coordinator.async_config_entry_first_refresh()
    hass.data[DOMAIN][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Déchargement de l'entrée."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok
