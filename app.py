#!/usr/bin/env python3
"""
app.py - Point d'entrée principal de l'application Antigravity Gemini Token Tracker.
Lance le serveur HTTP local et ouvre automatiquement le tableau de bord dans le navigateur.
"""

import sys
import time
import argparse
import webbrowser
import threading
from server import run_server
from config import load_config, save_config

def background_sync_worker():
    """
    Surveille en arrière-plan les métriques Antigravity et met à jour automatiquement
    data.json, static/data.json et synchronise sur GitHub Pages pour que la version web
    reste toujours parfaitement alignée avec la version locale.
    """
    import subprocess
    import os
    import json
    from antigravity_tracker import scan_all_sessions
    from config import load_config

    base_dir = os.path.dirname(os.path.abspath(__file__))
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
            q5 = scan.get("quota_5h", {})
            curr_rem5 = q5.get("remaining_pct")

            now = time.time()
            if curr_rem5 is not None and curr_rem5 != last_pushed_rem5 and (now - last_push_time >= 60):
                last_pushed_rem5 = curr_rem5
                last_push_time = now
                subprocess.run(
                    ["git", "add", "data.json", "static/data.json"],
                    cwd=base_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                subprocess.run(
                    ["git", "commit", "-m", f"chore(sync): auto-sync quota snapshot ({curr_rem5}%)"],
                    cwd=base_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                subprocess.run(
                    ["git", "push", "origin", "main"],
                    cwd=base_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
        except Exception:
            pass

def main():
    parser = argparse.ArgumentParser(description="Antigravity Gemini Token & Cost Tracker")
    parser.add_argument("--port", type=int, default=5050, help="Port d'écoute du serveur HTTP (défaut: 5050)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Adresse d'écoute (défaut: 0.0.0.0 pour accès réseau local et smartphone)")
    parser.add_argument("--no-browser", action="store_true", help="Ne pas ouvrir automatiquement le navigateur")
    parser.add_argument("--api-key", type=str, default=None, help="Définir la clé API Gemini")
    parser.add_argument("--model", type=str, default=None, help="Modèle Gemini par défaut")
    args = parser.parse_args()

    # Mise à jour de la configuration si des arguments sont fournis en ligne de commande
    updates = {}
    if args.api_key:
        updates["gemini_api_key"] = args.api_key.strip()
    if args.model:
        updates["default_model"] = args.model.strip()
    if updates:
        save_config(updates)

    cfg = load_config()

    import socket
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
    print(" 🚀 ANTIGRAVITY GEMINI TOKEN & COST TRACKER")
    print("=" * 65)
    print(f" • Dashboard Local     : {url_browser}")
    print(f" • Dashboard Smartphone: {url_mobile} (Wi-Fi)")
    print(f" • Surveillance active : ~/.gemini/antigravity")
    print(f" • Modèle configuré    : {cfg.get('default_model', 'gemini-3.8-flash')}")
    print(f" • Mode tarification   : {cfg.get('pricing_mode', 'pay_as_you_go')}")
    print(f" • Clé API Gemini      : {'Configurée ✅' if cfg.get('gemini_api_key') else 'Non configurée (accessible via UI) ⚠️'}")
    print("=" * 65)
    print("Appuyez sur Ctrl+C pour arrêter l'application.")
    print("-" * 65)

    try:
        httpd = run_server(port=args.port, host=args.host)
    except OSError as e:
        if e.errno == 48: # Address already in use
            print(f"[!] Le port {args.port} est déjà utilisé. Tentative sur le port {args.port + 1}...")
            args.port += 1
            url = f"http://{args.host}:{args.port}"
            httpd = run_server(port=args.port, host=args.host)
        else:
            raise e

    # Ouverture automatique du navigateur dans un thread séparé
    if not args.no_browser:
        def open_browser():
            time.sleep(0.6)
            webbrowser.open(url)
        threading.Thread(target=open_browser, daemon=True).start()

    # Démarrage de la synchronisation automatique en arrière-plan vers GitHub Pages
    threading.Thread(target=background_sync_worker, daemon=True).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du tracker Antigravity... À bientôt !")
        httpd.shutdown()
        sys.exit(0)

if __name__ == "__main__":
    main()
