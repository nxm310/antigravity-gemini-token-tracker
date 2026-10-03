"""
pricing.py - Modèle de tarification officiel Google Gemini
Supporte les forfaits Pay-as-you-go et Free Tier, avec conversion de devises (USD / EUR).
"""

from typing import Dict, Any, Optional

# Tarifs officiels Gemini (par million de tokens / 1M tokens)
# Référence : Google AI Studio Pricing (https://ai.google.dev/pricing)
GEMINI_MODELS: Dict[str, Dict[str, Any]] = {
    "gemini-3.8-flash": {
        "name": "Gemini 3.8 Flash (High)",
        "description": "Modèle standard rapide avec capacités de raisonnement élevées (Antigravity)",
        "input_cost_standard": 0.075,      # $ / 1M tokens (prompts <= 128k)
        "input_cost_large": 0.15,          # $ / 1M tokens (prompts > 128k)
        "output_cost_standard": 0.30,     # $ / 1M tokens (y compris tokens de thinking)
        "output_cost_large": 0.60,
        "cached_input_cost": 0.01875,      # $ / 1M tokens mis en cache
        "threshold_large": 128_000,
        "max_context": 1_048_576,          # 1M tokens
        "max_output": 8_192,
        "free_rpm": 15,
        "free_rpd": 1500,
        "free_tpm": 1_000_000,
        "paid_rpm": 2000,
        "paid_tpm": 4_000_000,
        "recommended": True
    },
    "gemini-2.5-flash": {
        "name": "Gemini 2.5 Flash",
        "description": "Modèle ultra-performant et économique pour le code et le chat",
        "input_cost_standard": 0.075,
        "input_cost_large": 0.15,
        "output_cost_standard": 0.30,
        "output_cost_large": 0.60,
        "cached_input_cost": 0.01875,
        "threshold_large": 128_000,
        "max_context": 1_048_576,
        "max_output": 8_192,
        "free_rpm": 15,
        "free_rpd": 1500,
        "free_tpm": 1_000_000,
        "paid_rpm": 2000,
        "paid_tpm": 4_000_000,
        "recommended": False
    },
    "gemini-2.0-flash": {
        "name": "Gemini 2.0 Flash",
        "description": "Nouvelle génération Gemini 2.0 multi-modal rapide",
        "input_cost_standard": 0.10,
        "input_cost_large": 0.10,
        "output_cost_standard": 0.40,
        "output_cost_large": 0.40,
        "cached_input_cost": 0.025,
        "threshold_large": 128_000,
        "max_context": 1_048_576,
        "max_output": 8_192,
        "free_rpm": 15,
        "free_rpd": 1500,
        "free_tpm": 1_000_000,
        "paid_rpm": 2000,
        "paid_tpm": 4_000_000,
        "recommended": False
    },
    "gemini-2.0-flash-thinking": {
        "name": "Gemini 2.0 Flash Thinking",
        "description": "Gemini 2.0 avec traçage détaillé du raisonnement (Thinking tokens)",
        "input_cost_standard": 0.10,
        "input_cost_large": 0.10,
        "output_cost_standard": 0.40,
        "output_cost_large": 0.40,
        "cached_input_cost": 0.025,
        "threshold_large": 128_000,
        "max_context": 1_048_576,
        "max_output": 65_536,
        "free_rpm": 10,
        "free_rpd": 1000,
        "free_tpm": 1_000_000,
        "paid_rpm": 1000,
        "paid_tpm": 2_000_000,
        "recommended": False
    },
    "gemini-1.5-flash": {
        "name": "Gemini 1.5 Flash",
        "description": "Modèle léger haute vitesse avec fenêtre de 1M tokens",
        "input_cost_standard": 0.075,
        "input_cost_large": 0.15,
        "output_cost_standard": 0.30,
        "output_cost_large": 0.60,
        "cached_input_cost": 0.01875,
        "threshold_large": 128_000,
        "max_context": 1_048_576,
        "max_output": 8_192,
        "free_rpm": 15,
        "free_rpd": 1500,
        "free_tpm": 1_000_000,
        "paid_rpm": 2000,
        "paid_tpm": 4_000_000,
        "recommended": False
    },
    "gemini-1.5-pro": {
        "name": "Gemini 1.5 Pro",
        "description": "Modèle avancé pour raisonnement complexe et très grands contextes (2M)",
        "input_cost_standard": 1.25,
        "input_cost_large": 2.50,
        "output_cost_standard": 5.00,
        "output_cost_large": 10.00,
        "cached_input_cost": 0.3125,
        "threshold_large": 128_000,
        "max_context": 2_097_152,
        "max_output": 8_192,
        "free_rpm": 2,
        "free_rpd": 50,
        "free_tpm": 32_000,
        "paid_rpm": 360,
        "paid_tpm": 2_000_000,
        "recommended": False
    }
}

DEFAULT_MODEL = "gemini-3.8-flash"
DEFAULT_USD_TO_EUR = 0.92

def get_model_spec(model_key: Optional[str] = None) -> Dict[str, Any]:
    """Retourne les caractéristiques d'un modèle (avec fallback)."""
    if not model_key:
        return GEMINI_MODELS[DEFAULT_MODEL]
    
    # Nettoyage clé (ex: 'gemini-3.8-flash (High)' -> 'gemini-3.8-flash')
    clean_key = model_key.lower().strip()
    for key, spec in GEMINI_MODELS.items():
        if key in clean_key or clean_key in key:
            return spec
        if spec["name"].lower() in clean_key:
            return spec
            
    return GEMINI_MODELS[DEFAULT_MODEL]

def calculate_cost(
    input_tokens: int,
    output_tokens: int,
    thinking_tokens: int = 0,
    cached_tokens: int = 0,
    model_key: Optional[str] = None,
    pricing_mode: str = "pay_as_you_go",
    usd_to_eur: float = DEFAULT_USD_TO_EUR
) -> Dict[str, Any]:
    """
    Calcule le coût détaillé en USD et EUR pour un volume de tokens donné.
    Si pricing_mode == 'free_tier', le coût financier est de 0.0.
    """
    spec = get_model_spec(model_key)
    
    # En mode Free Tier, coût nul
    if pricing_mode == "free_tier":
        return {
            "mode": "free_tier",
            "input_cost_usd": 0.0,
            "output_cost_usd": 0.0,
            "thinking_cost_usd": 0.0,
            "cached_cost_usd": 0.0,
            "total_cost_usd": 0.0,
            "total_cost_eur": 0.0,
            "model_used": spec["name"]
        }
    
    threshold = spec.get("threshold_large", 128_000)
    
    # Détermination du palier d'entrée (standard ou > 128k)
    if input_tokens > threshold:
        rate_input = spec["input_cost_large"]
        rate_output = spec["output_cost_large"]
    else:
        rate_input = spec["input_cost_standard"]
        rate_output = spec["output_cost_standard"]
        
    rate_cached = spec.get("cached_input_cost", rate_input / 4)
    
    # Les tokens en cache sont soustraits des tokens d'entrée standards
    regular_input = max(0, input_tokens - cached_tokens)
    
    # Calculs (tarifs par million de tokens)
    input_cost = (regular_input / 1_000_000.0) * rate_input
    cached_cost = (cached_tokens / 1_000_000.0) * rate_cached
    
    # Total output comprend les tokens de réponse générés et les thinking tokens
    total_output = output_tokens + thinking_tokens
    output_cost = (total_output / 1_000_000.0) * rate_output
    thinking_cost = (thinking_tokens / 1_000_000.0) * rate_output
    
    total_usd = input_cost + cached_cost + output_cost
    total_eur = total_usd * usd_to_eur

    # Mode Abonnement Google AI Pro (Inclus dans le forfait mensuel)
    if pricing_mode == "google_ai_pro":
        return {
            "mode": "google_ai_pro",
            "input_cost_usd": 0.0,
            "cached_cost_usd": 0.0,
            "output_cost_usd": 0.0,
            "thinking_cost_usd": 0.0,
            "total_cost_usd": 0.0,
            "total_cost_eur": 0.0,
            "api_value_usd": round(total_usd, 6),
            "api_value_eur": round(total_eur, 6),
            "model_used": spec["name"],
            "rate_input_per_m": rate_input,
            "rate_output_per_m": rate_output,
            "included_in_subscription": True
        }
    
    return {
        "mode": "pay_as_you_go",
        "input_cost_usd": round(input_cost, 6),
        "cached_cost_usd": round(cached_cost, 6),
        "output_cost_usd": round(output_cost, 6),
        "thinking_cost_usd": round(thinking_cost, 6),
        "total_cost_usd": round(total_usd, 6),
        "total_cost_eur": round(total_eur, 6),
        "api_value_usd": round(total_usd, 6),
        "api_value_eur": round(total_eur, 6),
        "model_used": spec["name"],
        "rate_input_per_m": rate_input,
        "rate_output_per_m": rate_output,
        "included_in_subscription": False
    }

def format_currency(value: float, currency: str = "EUR") -> str:
    """Formate une valeur monétaire avec précision adaptée aux micro-coûts."""
    if currency.upper() == "EUR":
        if value == 0:
            return "0,0000 €"
        if value < 0.01:
            return f"{value:.4f} €".replace(".", ",")
        return f"{value:.3f} €".replace(".", ",")
    else:
        if value == 0:
            return "$0.0000"
        if value < 0.01:
            return f"${value:.4f}"
        return f"${value:.3f}"
