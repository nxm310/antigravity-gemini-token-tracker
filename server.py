"""
server.py - Serveur HTTP Python pour le Dashboard de suivi des tokens et prix Gemini Antigravity.
Gère les routes API REST (JSON) et la distribution des fichiers statiques du tableau de bord.
"""

import os
import json
import mimetypes
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any

from config import load_config, save_config, mask_api_key
from pricing import GEMINI_MODELS, format_currency
from gemini_api import validate_api_key, count_tokens
from antigravity_tracker import scan_all_sessions, analyze_transcript_file, get_session_stats

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

class DashboardRequestHandler(BaseHTTPRequestHandler):
    """Gestionnaire de requêtes HTTP pour le dashboard."""

    def log_message(self, format, *args):
        # Réduit la verbosité des logs dans la console
        pass

    def send_json(self, data: Any, status: int = 200):
        """Envoie une réponse JSON avec en-têtes CORS."""
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        """Gère les requêtes préliminaires CORS."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        """Route les requêtes GET (API ou fichiers statiques)."""
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        if path == "/api/status":
            self.handle_api_status()
        elif path == "/api/sessions":
            self.handle_api_sessions()
        elif path.startswith("/api/sessions/"):
            conv_id = path.replace("/api/sessions/", "").strip()
            self.handle_api_session_detail(conv_id)
        elif path == "/api/history":
            self.handle_api_history()
        elif path == "/api/models":
            self.handle_api_models()
        elif path == "/api/config":
            self.handle_api_get_config()
        else:
            self.serve_static_file(path)

    def do_POST(self):
        """Route les requêtes POST (API)."""
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b"{}"
        
        try:
            body = json.loads(post_data.decode("utf-8")) if post_data else {}
        except Exception:
            body = {}

        if path == "/api/config":
            self.handle_api_post_config(body)
        elif path == "/api/validate_key":
            self.handle_api_validate_key(body)
        elif path == "/api/count_tokens":
            self.handle_api_count_tokens(body)
        else:
            self.send_json({"error": "Endpoint introuvable"}, status=404)

    # --- HANDLERS API ---

    def handle_api_status(self):
        """Retourne l'état complet du tracker pour le tableau de bord."""
        cfg = load_config()
        scan = scan_all_sessions(
            antigravity_dir=cfg["antigravity_dir"],
            selected_model=cfg.get("default_model"),
            pricing_mode=cfg.get("pricing_mode", "pay_as_you_go"),
            usd_to_eur=cfg.get("usd_to_eur_rate", 0.92)
        )

        has_api_key = bool(cfg.get("gemini_api_key"))
        api_key_masked = mask_api_key(cfg.get("gemini_api_key", ""))

        # Modèle actif et spécifications
        model_name = cfg.get("default_model", "gemini-3.8-flash")
        model_spec = GEMINI_MODELS.get(model_name, GEMINI_MODELS["gemini-3.8-flash"])

        # Quotas selon le mode
        is_free = cfg.get("pricing_mode") == "free_tier"
        quota_rpm = model_spec["free_rpm"] if is_free else model_spec["paid_rpm"]
        quota_tpm = model_spec["free_tpm"] if is_free else model_spec["paid_tpm"]
        quota_rpd = model_spec["free_rpd"] if is_free else 50_000

        # Vérification des alertes
        currency = cfg.get("currency", "EUR")
        daily_cost = scan["today"]["cost_eur"] if currency == "EUR" else scan["today"]["cost_usd"]
        budget_limit = cfg.get("daily_budget_limit", 5.0)

        alerts = []
        if daily_cost >= budget_limit:
            alerts.append({
                "type": "warning",
                "message": f"Dépassement de budget : coût du jour ({daily_cost:.2f} {currency}) supérieur au seuil ({budget_limit:.2f} {currency}) !"
            })

        if scan["today"]["calls"] >= (quota_rpd * 0.8):
            alerts.append({
                "type": "warning",
                "message": f"Alerte quota requêtes : {scan['today']['calls']} appels effectués sur {quota_rpd} max/jour !"
            })

        # Informations Abonnement Google AI Pro
        is_pro = cfg.get("pricing_mode") == "google_ai_pro" or cfg.get("google_ai_pro_active", False)
        pro_monthly_cost = cfg.get("pro_monthly_cost", 21.99 if currency == "EUR" else 19.99)
        api_val_total = scan["totals"]["api_value_eur"] if currency == "EUR" else scan["totals"]["api_value_usd"]
        api_val_today = scan["today"]["api_value_eur"] if currency == "EUR" else scan["today"]["api_value_usd"]
        roi_pct = round((api_val_total / pro_monthly_cost) * 100, 1) if pro_monthly_cost > 0 else 0

        # Si abonnement Pro, quotas illimités/étendus
        if is_pro:
            quota_rpm = model_spec["paid_rpm"]
            quota_tpm = model_spec["paid_tpm"]
            quota_rpd = 50_000

        self.send_json({
            "status": "online",
            "has_api_key": has_api_key,
            "api_key_masked": api_key_masked,
            "config": {
                "currency": currency,
                "pricing_mode": cfg.get("pricing_mode", "google_ai_pro"),
                "google_ai_pro_active": is_pro,
                "pro_monthly_cost": pro_monthly_cost,
                "default_model": model_name,
                "daily_budget_limit": budget_limit,
                "auto_refresh_seconds": cfg.get("auto_refresh_seconds", 3)
            },
            "subscription": {
                "is_pro": is_pro,
                "plan_name": "Google AI Pro (Google One AI Premium)",
                "monthly_cost": pro_monthly_cost,
                "api_value_total": api_val_total,
                "api_value_today": api_val_today,
                "roi_pct": roi_pct
            },
            "model_info": model_spec,
            "quotas": {
                "rpm_limit": quota_rpm,
                "tpm_limit": quota_tpm,
                "rpd_limit": quota_rpd,
                "is_free_tier": is_free,
                "is_pro": is_pro
            },
            "totals": scan["totals"],
            "today": scan["today"],
            "quota_5h": scan.get("quota_5h", {}),
            "quota_weekly": scan.get("quota_weekly", {}),
            "active_session": scan["active_session"],
            "alerts": alerts
        })

    def handle_api_sessions(self):
        """Retourne la liste de toutes les sessions avec métriques."""
        cfg = load_config()
        scan = scan_all_sessions(
            antigravity_dir=cfg["antigravity_dir"],
            selected_model=cfg.get("default_model"),
            pricing_mode=cfg.get("pricing_mode", "pay_as_you_go"),
            usd_to_eur=cfg.get("usd_to_eur_rate", 0.92)
        )
        self.send_json({"sessions": scan["sessions"]})

    def handle_api_session_detail(self, conv_id: str):
        """Retourne le détail d'une conversation spécifique."""
        cfg = load_config()
        transcript_path = os.path.join(
            cfg["antigravity_dir"], "brain", conv_id, ".system_generated", "logs", "transcript.jsonl"
        )
        if not os.path.exists(transcript_path):
            self.send_json({"error": "Session introuvable"}, status=404)
            return

        parsed = analyze_transcript_file(transcript_path, default_model=cfg.get("default_model", "gemini-3.8-flash"))
        self.send_json({"id": conv_id, "detail": parsed})

    def handle_api_history(self):
        """Retourne les séries temporelles pour les graphiques."""
        cfg = load_config()
        scan = scan_all_sessions(
            antigravity_dir=cfg["antigravity_dir"],
            selected_model=cfg.get("default_model"),
            pricing_mode=cfg.get("pricing_mode", "pay_as_you_go"),
            usd_to_eur=cfg.get("usd_to_eur_rate", 0.92)
        )
        self.send_json({
            "daily_trends": scan["daily_trends"],
            "workspace_breakdown": scan["workspace_breakdown"]
        })

    def handle_api_models(self):
        """Retourne la liste des modèles Gemini et leurs caractéristiques."""
        self.send_json({"models": GEMINI_MODELS})

    def handle_api_get_config(self):
        """Retourne la configuration actuelle (sans exposer la clé API en clair)."""
        cfg = load_config()
        safe_cfg = cfg.copy()
        safe_cfg["gemini_api_key_masked"] = mask_api_key(cfg.get("gemini_api_key", ""))
        safe_cfg["has_api_key"] = bool(cfg.get("gemini_api_key"))
        del safe_cfg["gemini_api_key"]
        self.send_json(safe_cfg)

    def handle_api_post_config(self, body: Dict[str, Any]):
        """Met à jour les paramètres utilisateur (clé API, devises, modèles)."""
        updated = save_config(body)
        safe_updated = updated.copy()
        safe_updated["gemini_api_key_masked"] = mask_api_key(updated.get("gemini_api_key", ""))
        safe_updated["has_api_key"] = bool(updated.get("gemini_api_key"))
        if "gemini_api_key" in safe_updated:
            del safe_updated["gemini_api_key"]
        self.send_json({"success": True, "config": safe_updated})

    def handle_api_validate_key(self, body: Dict[str, Any]):
        """Valide une clé API directement auprès de Google Gemini."""
        key = body.get("api_key", "").strip()
        save_after = body.get("save", False)
        
        result = validate_api_key(key)
        if result.get("valid") and save_after:
            save_config({"gemini_api_key": key})
            result["saved"] = True
            result["api_key_masked"] = mask_api_key(key)

        self.send_json(result)

    def handle_api_count_tokens(self, body: Dict[str, Any]):
        """Calcule les tokens d'un texte, code, images et documents PDF."""
        text = body.get("text", "")
        files = body.get("files", [])
        model = body.get("model", "gemini-1.5-flash")
        cfg = load_config()
        api_key = cfg.get("gemini_api_key")
        
        res = count_tokens(text=text, files=files, api_key=api_key, model=model)
        
        # Calcul comparatif des coûts sur tous les modèles Gemini
        tot_tok = res.get("total_tokens", 0)
        from pricing import GEMINI_MODELS, calculate_cost
        costs = {}
        for m_key, spec in GEMINI_MODELS.items():
            c = calculate_cost(
                input_tokens=tot_tok,
                output_tokens=0,
                model_key=m_key,
                usd_to_eur=cfg.get("usd_to_eur_rate", 0.92)
            )
            costs[m_key] = {
                "name": spec["name"],
                "cost_usd": c["total_cost_usd"],
                "cost_eur": c["total_cost_eur"]
            }
        res["costs_by_model"] = costs
        self.send_json(res)

    # --- FICHIERS STATIQUES ---

    def serve_static_file(self, path: str):
        """Sert les fichiers statiques (HTML, CSS, JS, icônes)."""
        if path in ("", "/"):
            file_path = os.path.join(STATIC_DIR, "index.html")
        else:
            clean_path = path.lstrip("/")
            file_path = os.path.join(STATIC_DIR, clean_path)

        if not os.path.exists(file_path) or os.path.isdir(file_path):
            file_path = os.path.join(STATIC_DIR, "index.html")

        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = "application/octet-stream"

        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Erreur de lecture du fichier : {e}")

def run_server(port: int = 5050, host: str = "127.0.0.1") -> ThreadingHTTPServer:
    """Démarre le serveur HTTP multithreadé."""
    server_address = (host, port)
    httpd = ThreadingHTTPServer(server_address, DashboardRequestHandler)
    return httpd
