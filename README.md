# 🚀 Antigravity Gemini Token & Cost Tracker

Application Python moderne de suivi en temps réel des **tokens**, **coûts** et **quotas** de l'API Google Gemini lorsque vous codez avec **Antigravity**.

---

## 🌟 Fonctionnalités Clés

1. **Prise en charge de l'Abonnement Google AI PRO (Google One AI Premium) :**
   - Mode dédié **👑 Google AI Pro** : vos requêtes Antigravity sont couvertes par votre abonnement mensuel (21,99 € / mois).
   - Coût additionnel direct : **0,00 €** (inclus dans votre forfait).
   - **Calcul de Rentabilité & Valeur API Délivrée** : visualisez la valeur réelle des tokens consommés par Antigravity par rapport au coût de votre abonnement (ex: *Rentabilisé à 93.4% ce mois-ci*).
   - Quotas Pro débloqués : fenêtres de contexte jusqu'à **2 millions de tokens**, cadences élevées (jusqu'à **2 000 requêtes/min**).

2. **Simulateur de Tokens Multimodal (Texte, Images & Documents) :**
   - Glissez-déposez ou uploadez vos **images** (PNG, JPG, WEBP, GIF, SVG...).
   - Importez vos **documents PDF** (extraction du texte et calcul des pages visuelles à 258 tokens/page).
   - Déposez vos fichiers de code source ou texte (.py, .js, .csv, .json, .md...).
   - Tableau comparatif immédiat des coûts sur tous les modèles Gemini (**3.8 Flash**, **2.5 Flash**, **2.0 Flash**, **1.5 Pro**).

3. **Surveillance en Direct d'Antigravity :**
   - Synchronisation automatique avec `~/.gemini/antigravity`.
   - Détection en temps réel de votre session de code active et de votre workspace.
   - Suivi de la taille du contexte actif (sur 1M ou 2M tokens).

4. **Comptage Précis des Tokens :**
   - **Tokens d'Entrée (Input Context)** : historique du dialogue, fichiers et retours d'outils envoyés au modèle à chaque tour.
   - **Tokens de Sortie (Output)** : code généré, réponses et appels d'outils (*tool calls*).
   - **Tokens de Réflexion (Thinking)** : tokens de raisonnement (Chain-of-Thought) générés par Gemini 3.8 Flash / 2.0 Flash Thinking.

5. **Calculateur de Coûts & Grille Tarifaire Officielle :**
   - Tarifs officiels Google Gemini (par million de tokens).
   - Prise en charge des modèles : **Gemini 3.8 Flash**, **Gemini 2.5 Flash**, **Gemini 2.0 Flash**, **Gemini 1.5 Pro**, etc.
   - Conversion en direct **EUR (€)** et **USD ($)**.
   - Bascule immédiate entre les modes : **Google AI Pro** (Abonnement), **Pay-as-you-go** (facturation réelle) et **Free Tier** ($0 avec alertes quotas).

4. **Gestion de la Clé API Google AI Studio :**
   - Interface intégrée pour saisir et tester votre clé API Gemini en un clic.
   - Validation directe auprès des serveurs Google Gemini (`generativelanguage.googleapis.com`).
   - Stockage local sécurisé dans `config.json` (avec permissions restreintes `0600`).

5. **Alertes de Budget & Quotas :**
   - Suivi du nombre de requêtes quotidiennes (RPD), RPM et TPM.
   - Seuil de budget paramétrable (ex: alerte à 5,00 €).
   - Jauge visuelle de consommation du quota quotidien.

6. **Graphiques & Simulateur Intégré :**
   - Histogramme temporel de la consommation par date.
   - Diagramme circulaire de répartition des tokens (Entrée / Sortie / Thinking).
   - Simulateur de tokens : collez un extrait de code pour obtenir instantanément son nombre de tokens et son coût estimé.

---

## 🚀 Démarrage Rapide

### Option 1 : Lancement direct
```bash
python3 app.py
```
*Le tableau de bord s'ouvre automatiquement dans votre navigateur à l'adresse [http://127.0.0.1:5050](http://127.0.0.1:5050).*

### Option 2 : Script rapide
```bash
./start.sh
```

---

## ⚙️ Options en Ligne de Commande

```bash
python3 app.py --port 5050        # Choisir un autre port
python3 app.py --no-browser       # Ne pas ouvrir automatiquement le navigateur
python3 app.py --api-key AIza...  # Définir directement la clé API Gemini
python3 app.py --model gemini-3.8-flash # Définir le modèle par défaut
```

---

## 📁 Structure du Projet

```
tracker token price/
├── app.py                  # Point d'entrée de l'application
├── server.py               # Serveur HTTP REST multithreadé
├── antigravity_tracker.py  # Analyseur temps réel des logs Antigravity
├── gemini_api.py           # Client API Gemini (validation clé & comptage)
├── pricing.py              # Grille tarifaire officielle et calcul des coûts
├── config.py               # Gestionnaire de configuration locale
├── static/
│   ├── index.html          # Interface utilisateur moderne Glassmorphism
│   ├── css/style.css       # Thème sombre pour développeurs
│   └── js/app.js           # Client temps réel et graphiques interactifs
├── start.sh                # Script de démarrage en 1 clic
└── requirements.txt        # Dépendances optionnelles
```

---

## 🔒 Sécurité & Confidentialité
- Vos conversations et votre clé API restent **100% locales** sur votre machine.
- Aucune donnée n'est transmise à des serveurs tiers, à l'exception des vérifications directes auprès de l'API officielle Google AI Studio.
