#!/usr/bin/env python3
"""
app.py - Application Flask moderne pour Antigravity Pulse (Gemini Token & Cost Tracker).
Fournit les routes API REST et sert les fichiers statiques de l'application web.

Utilisation :
  - Standard     : python3 app.py [--port 5050]
  - Flask CLI    : export FLASK_APP=app.py && flask run --port 5050
"""

import os
import sys
import time
import json
import socket
import argparse
import threading
import webbrowser
import subprocess
import urllib.request
from typing import Dict, Any

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from config import load_config, save_config, mask_api_key
from pricing import GEMINI_MODELS, calculate_cost, format_currency
from gemini_api import validate_api_key, count_tokens
from antigravity_tracker import scan_all_sessions, analyze_transcript_file, get_session_stats

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Initialisation de l'application Flask
app = Flask(__name__, static_folder=None)

# Configuration CORS complète (autorise le réseau privé / PWA / requêtes locales)
CORS(app, resources={r"/*": {"origins": "*"}})

@app.after_request
def add_cors_and_security_headers(response):
    """Ajoute les en-têtes nécessaires pour CORS et Private Network Access."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Requested-With"
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

# --- THREAD DE SYNCHRONISATION EN ARRIÈRE-PLAN ---
_SYNC_THREAD_STARTED = False

def sync_to_homeassistant(scan: Dict[str, Any]):
    """Synchronise directement les métriques avec Home Assistant si configuré."""
    try:
        cfg_path = os.path.expanduser("~/.gemini/config/mcp_config.json")
        host = "http://192.168.50.5:8123"
        token = ""
        if os.path.exists(cfg_path):
            with open(cfg_path, "r", encoding="utf-8") as f:
                d = json.load(f)
                ha = d.get("mcpServers", {}).get("homeassistant", {}).get("env", {})
                host = ha.get("HASS_HOST", host)
                token = ha.get("HASS_TOKEN", token)
        if not token:
            return

        q5 = scan.get("quota_5h", {})
        qw = scan.get("quota_weekly", {})
        rem5 = q5.get("remaining_pct")
        remw = qw.get("remaining_pct")
        reset5 = q5.get("reset_date")
        resetw = qw.get("reset_date")

        def send_ha(endpoint, payload):
            req = urllib.request.Request(
                f"{host}/api/services/{endpoint}",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                pass

        if rem5 is not None:
            send_ha("input_number/set_value", {"entity_id": "input_number.antigravity_quota_5h_restant", "value": float(rem5)})
        if remw is not None:
            send_ha("input_number/set_value", {"entity_id": "input_number.antigravity_quota_semaine_restant", "value": float(remw)})
        if reset5:
            send_ha("input_text/set_value", {"entity_id": "input_text.antigravity_prochain_reset_5h", "value": str(reset5)})
        if resetw:
            send_ha("input_text/set_value", {"entity_id": "input_text.antigravity_reset_semaine", "value": str(resetw)})
    except Exception:
        pass

def background_sync_worker():
    """
    Surveille en continu les métriques d'Antigravity IDE en arrière-plan,
    écrit data.json / static/data.json et synchronise automatiquement
    sur GitHub Pages et Home Assistant dès qu'un changement de quota est détecté.
    """
    last_pushed_rem5 = None
    last_push_time = 0

    while True:
        try:
            time.sleep(20)
            cfg = load_config()
            scan = scan_all_sessions(
                antigravity_dir=cfg["antigravity_dir"],
                selected_model=cfg.get("default_model"),
                pricing_mode=cfg.get("pricing_mode", "google_ai_pro"),
                usd_to_eur=cfg.get("usd_to_eur_rate", 0.92)
            )

            # Synchronisation directe Home Assistant
            sync_to_homeassistant(scan)

            q5 = scan.get("quota_5h", {})
            curr_rem5 = q5.get("remaining_pct")

            now = time.time()
            if curr_rem5 is not None and curr_rem5 != last_pushed_rem5 and (now - last_push_time >= 60):
                last_pushed_rem5 = curr_rem5
                last_push_time = now
                subprocess.run(
                    ["git", "add", "data.json", "static/data.json"],
                    cwd=BASE_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                subprocess.run(
                    ["git", "commit", "-m", f"chore(sync): auto-sync quota snapshot ({curr_rem5}%)"],
                    cwd=BASE_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                subprocess.run(
                    ["git", "push", "origin", "main"],
                    cwd=BASE_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
        except Exception:
            pass

def ensure_background_sync_started():
    global _SYNC_THREAD_STARTED
    if not _SYNC_THREAD_STARTED:
        _SYNC_THREAD_STARTED = True
        t = threading.Thread(target=background_sync_worker, daemon=True)
        t.start()

ensure_background_sync_started()

# --- ROUTES API REST ---

@app.route("/api/status", methods=["GET"])
def api_status():
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

    model_name = cfg.get("default_model", "gemini-3.8-flash")
    model_spec = GEMINI_MODELS.get(model_name, GEMINI_MODELS["gemini-3.8-flash"])

    is_free = cfg.get("pricing_mode") == "free_tier"
    quota_rpm = model_spec["free_rpm"] if is_free else model_spec["paid_rpm"]
    quota_tpm = model_spec["free_tpm"] if is_free else model_spec["paid_tpm"]
    quota_rpd = model_spec["free_rpd"] if is_free else 50_000

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

    is_pro = cfg.get("pricing_mode") == "google_ai_pro" or cfg.get("google_ai_pro_active", False)
    pro_monthly_cost = cfg.get("pro_monthly_cost", 21.99 if currency == "EUR" else 19.99)
    api_val_total = scan["totals"]["api_value_eur"] if currency == "EUR" else scan["totals"]["api_value_usd"]
    api_val_today = scan["today"]["api_value_eur"] if currency == "EUR" else scan["today"]["api_value_usd"]
    roi_pct = round((api_val_total / pro_monthly_cost) * 100, 1) if pro_monthly_cost > 0 else 0

    if is_pro:
        quota_rpm = model_spec["paid_rpm"]
        quota_tpm = model_spec["paid_tpm"]
        quota_rpd = 50_000

    resp_data = {
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
        "sessions": scan.get("sessions", [])[:15],
        "daily_trends": scan.get("daily_trends", {}),
        "monthly_history": scan.get("monthly_history", []),
        "alerts": alerts
    }

    # Sauvegarde automatique locale pour la version web statique
    try:
        json_path = os.path.join(BASE_DIR, "data.json")
        with open(json_path, "w", encoding="utf-8") as jf:
            json.dump(resp_data, jf, ensure_ascii=False, indent=2)
        static_json_path = os.path.join(STATIC_DIR, "data.json")
        with open(static_json_path, "w", encoding="utf-8") as sjf:
            json.dump(resp_data, sjf, ensure_ascii=False, indent=2)
    except Exception:
        pass

    return jsonify(resp_data)

@app.route("/api/sessions", methods=["GET"])
def api_sessions():
    """Retourne la liste de toutes les sessions de code avec métriques."""
    cfg = load_config()
    scan = scan_all_sessions(
        antigravity_dir=cfg["antigravity_dir"],
        selected_model=cfg.get("default_model"),
        pricing_mode=cfg.get("pricing_mode", "pay_as_you_go"),
        usd_to_eur=cfg.get("usd_to_eur_rate", 0.92)
    )
    return jsonify({"sessions": scan["sessions"]})

@app.route("/api/sessions/<conv_id>", methods=["GET"])
def api_session_detail(conv_id):
    """Retourne le détail d'une session / conversation spécifique."""
    cfg = load_config()
    transcript_path = os.path.join(
        cfg["antigravity_dir"], "brain", conv_id, ".system_generated", "logs", "transcript.jsonl"
    )
    if not os.path.exists(transcript_path):
        return jsonify({"error": "Session introuvable"}), 404

    parsed = analyze_transcript_file(transcript_path, default_model=cfg.get("default_model", "gemini-3.8-flash"))
    return jsonify({"id": conv_id, "detail": parsed})

@app.route("/api/history", methods=["GET"])
def api_history():
    """Retourne l'historique et les tendances temporelles."""
    cfg = load_config()
    scan = scan_all_sessions(
        antigravity_dir=cfg["antigravity_dir"],
        selected_model=cfg.get("default_model"),
        pricing_mode=cfg.get("pricing_mode", "pay_as_you_go"),
        usd_to_eur=cfg.get("usd_to_eur_rate", 0.92)
    )
    return jsonify({
        "daily_trends": scan["daily_trends"],
        "workspace_breakdown": scan["workspace_breakdown"]
    })

@app.route("/api/models", methods=["GET"])
def api_models():
    """Retourne la liste des modèles Gemini et leurs spécifications tarifaires."""
    return jsonify({"models": GEMINI_MODELS})

@app.route("/api/config", methods=["GET", "POST"])
def api_config():
    """Récupère ou met à jour la configuration de l'application."""
    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        updated = save_config(body)
        safe_updated = updated.copy()
        safe_updated["gemini_api_key_masked"] = mask_api_key(updated.get("gemini_api_key", ""))
        safe_updated["has_api_key"] = bool(updated.get("gemini_api_key"))
        if "gemini_api_key" in safe_updated:
            del safe_updated["gemini_api_key"]
        return jsonify({"success": True, "config": safe_updated})
    else:
        cfg = load_config()
        safe_cfg = cfg.copy()
        safe_cfg["gemini_api_key_masked"] = mask_api_key(cfg.get("gemini_api_key", ""))
        safe_cfg["has_api_key"] = bool(cfg.get("gemini_api_key"))
        if "gemini_api_key" in safe_cfg:
            del safe_cfg["gemini_api_key"]
        return jsonify(safe_cfg)

@app.route("/api/validate_key", methods=["POST"])
def api_validate_key():
    """Valide une clé API directement auprès de Google Gemini."""
    body = request.get_json(silent=True) or {}
    key = body.get("api_key", "").strip()
    save_after = body.get("save", False)

    result = validate_api_key(key)
    if result.get("valid") and save_after:
        save_config({"gemini_api_key": key})
        result["saved"] = True
        result["api_key_masked"] = mask_api_key(key)

    return jsonify(result)

@app.route("/api/count_tokens", methods=["POST"])
def api_count_tokens():
    """Calcule les tokens d'un texte, code, images ou PDF via l'API Gemini."""
    body = request.get_json(silent=True) or {}
    text = body.get("text", "")
    files = body.get("files", [])
    model = body.get("model", "gemini-1.5-flash")
    cfg = load_config()
    api_key = cfg.get("gemini_api_key")

    res = count_tokens(text=text, files=files, api_key=api_key, model=model)

    tot_tok = res.get("total_tokens", 0)
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
    return jsonify(res)

# --- DISTRIBUTION DES FICHIERS STATIQUES ---

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_static_files(path):
    """Sert index.html, css, js, icons, manifest.json, sw.js et data.json."""
    if path.startswith("api/"):
        return jsonify({"error": "Endpoint introuvable"}), 404

    if not path or path == "index.html":
        return send_from_directory(BASE_DIR, "index.html")

    root_file = os.path.join(BASE_DIR, path)
    if os.path.exists(root_file) and not os.path.isdir(root_file):
        return send_from_directory(BASE_DIR, path)

    static_file = os.path.join(STATIC_DIR, path)
    if os.path.exists(static_file) and not os.path.isdir(static_file):
        return send_from_directory(STATIC_DIR, path)

    return send_from_directory(BASE_DIR, "index.html")


# --- POINT D'ENTRÉE CLI (python3 app.py) ---

def main():
    parser = argparse.ArgumentParser(description="Antigravity Pulse - Gemini Token & Cost Tracker (Flask)")
    parser.add_argument("--port", type=int, default=5050, help="Port d'écoute HTTP (défaut: 5050)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Adresse d'écoute (défaut: 0.0.0.0 pour Wi-Fi local)")
    parser.add_argument("--no-browser", action="store_true", help="Ne pas ouvrir automatiquement le navigateur")
    parser.add_argument("--api-key", type=str, default=None, help="Définir la clé API Gemini")
    parser.add_argument("--model", type=str, default=None, help="Modèle Gemini par défaut")
    args = parser.parse_args()

    updates = {}
    if args.api_key:
        updates["gemini_api_key"] = args.api_key.strip()
    if args.model:
        updates["default_model"] = args.model.strip()
    if updates:
        save_config(updates)

    cfg = load_config()

    local_ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    url_browser = f"http://localhost:{args.port}"
    url_mobile = f"http://{local_ip}:{args.port}"

    print("=" * 65)
    print(" 🚀 ANTIGRAVITY PULSE (FLASK BACKEND)")
    print("=" * 65)
    print(f" • Dashboard Local     : {url_browser}")
    print(f" • Dashboard Smartphone: {url_mobile} (Wi-Fi)")
    print(f" • Surveillance active : ~/.gemini/antigravity")
    print(f" • Modèle configuré    : {cfg.get('default_model', 'gemini-3.8-flash')}")
    print(f" • Mode tarification   : {cfg.get('pricing_mode', 'google_ai_pro')}")
    print(f" • Clé API Gemini      : {'Configurée ✅' if cfg.get('gemini_api_key') else 'Non configurée (accessible via UI) ⚠️'}")
    print("=" * 65)
    print("Appuyez sur Ctrl+C pour arrêter.")
    print("-" * 65)

    if not args.no_browser:
        def open_browser():
            time.sleep(0.6)
            webbrowser.open(url_browser)
        threading.Thread(target=open_browser, daemon=True).start()

    # Lancement du serveur Flask multithreadé
    app.run(host=args.host, port=args.port, threaded=True, debug=False)

if __name__ == "__main__":
    main()
