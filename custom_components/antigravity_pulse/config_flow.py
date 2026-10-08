"""Gestionnaire de flux de configuration pour Antigravity Pulse."""

from __future__ import annotations

import logging
from typing import Any
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, CONF_URL, DEFAULT_URL, CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL

_LOGGER = logging.getLogger(__name__)

class AntigravityPulseConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Flux de configuration pour Antigravity Pulse."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        """Étape initiale de configuration utilisateur."""
        errors: dict[str, str] = {}

        if user_input is not None:
            url = user_input.get(CONF_URL, DEFAULT_URL).strip()
            session = async_get_clientsession(self.hass)

            try:
                async with session.get(url, headers={"Cache-Control": "no-cache"}) as resp:
                    if resp.status == 200:
                        data = await resp.json(content_type=None)
                        if isinstance(data, dict) and ("quota_5h" in data or "totals" in data):
                            return self.async_create_entry(
                                title="Antigravity Pulse",
                                data=user_input
                            )
                        else:
                            errors["base"] = "invalid_data_format"
                    else:
                        errors["base"] = "cannot_connect"
            except Exception:
                errors["base"] = "cannot_connect"

        data_schema = vol.Schema({
            vol.Required(CONF_URL, default=DEFAULT_URL): str,
            vol.Optional(CONF_SCAN_INTERVAL, default=DEFAULT_SCAN_INTERVAL): int,
        })

        return self.async_show_form(
            step_id="user",
            data_schema=data_schema,
            errors=errors
        )
