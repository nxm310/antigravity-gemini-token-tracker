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

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du tracker Antigravity... À bientôt !")
        httpd.shutdown()
        sys.exit(0)

if __name__ == "__main__":
    main()
