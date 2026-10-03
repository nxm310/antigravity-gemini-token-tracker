"""
config.py - Gestionnaire de configuration locale pour le tracker Antigravity Gemini.
Stocke la clé API de façon sécurisée, les préférences d'affichage et les seuils d'alertes.
"""

import os
import json
from typing import Dict, Any

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
DEFAULT_ANTIGRAVITY_DIR = os.path.expanduser("~/.gemini/antigravity")

DEFAULT_CONFIG: Dict[str, Any] = {
    "gemini_api_key": "",
    "default_model": "gemini-3.8-flash",
    "currency": "EUR",
    "pricing_mode": "google_ai_pro",    # 'google_ai_pro', 'pay_as_you_go' ou 'free_tier'
    "google_ai_pro_active": True,       # Abonnement Google AI Pro actif
    "pro_monthly_cost": 21.99,          # Prix mensuel de l'abonnement (21.99 €)
    "usd_to_eur_rate": 0.92,
    "daily_budget_limit": 5.0,          # Alerte si le coût dépasse ce montant (en devise choisie)
    "alert_threshold_pct": 80,          # Alerte quota à 80%
    "auto_refresh_seconds": 3,          # Intervalle de rafraîchissement temps réel
    "antigravity_dir": DEFAULT_ANTIGRAVITY_DIR
}

def load_config() -> Dict[str, Any]:
    """Charge la configuration depuis le fichier config.json ou l'environnement."""
    cfg = DEFAULT_CONFIG.copy()
    
    # Vérification variable d'environnement GEMINI_API_KEY
    env_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if env_key:
        cfg["gemini_api_key"] = env_key

    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                cfg.update(data)
        except Exception as e:
            print(f"[config] Erreur lors de la lecture de {CONFIG_FILE}: {e}")

    return cfg

def save_config(new_config: Dict[str, Any]) -> Dict[str, Any]:
    """Sauvegarde la configuration dans config.json."""
    current = load_config()
    current.update(new_config)
    
    # Nettoyage clé API (supprime les espaces ou retours à la ligne)
    if "gemini_api_key" in current and isinstance(current["gemini_api_key"], str):
        current["gemini_api_key"] = current["gemini_api_key"].strip()

    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2, ensure_ascii=False)
        # Permissions sécurisées pour le fichier contenant la clé API (lecture/écriture proprio uniquement)
        os.chmod(CONFIG_FILE, 0o600)
    except Exception as e:
        print(f"[config] Erreur lors de la sauvegarde de {CONFIG_FILE}: {e}")
        
    return current

def mask_api_key(key: str) -> str:
    """Retourne une version masquée de la clé API pour l'affichage (ex: AIzaSy...x8Z)."""
    if not key or len(key) < 8:
        return ""
    return f"{key[:6]}...{key[-4:]}"
