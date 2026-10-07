#!/usr/bin/env python3
"""
server.py - Rétrocompatibilité : redirige vers app.py (Flask).
Permet d'exécuter indifféremment `python3 app.py`, `python3 server.py`, ou `FLASK_APP=app.py flask run`.
"""

import sys
from app import app, main

def run_server(port: int = 5050, host: str = "0.0.0.0"):
    """Fonction de compatibilité historique."""
    app.run(host=host, port=port, threaded=True, debug=False)

if __name__ == "__main__":
    main()
