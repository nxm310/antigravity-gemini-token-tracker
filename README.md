# 🚀 Antigravity Gemini Token & Cost Tracker (Web App & PWA)

Application web moderne, fluide et sans installation pour suivre en temps réel vos **tokens**, **quotas (5h et semaine en %)** et **coûts Google Gemini** lorsque vous développez avec **Google Antigravity**.

🌐 **Accéder directement à l'application en ligne :**  
👉 **[https://nxm310.github.io/antigravity-gemini-token-tracker/](https://nxm310.github.io/antigravity-gemini-token-tracker/)**

---

## ⚡ 1 Clic : Zéro Installation, 100% Sécurisé & Local

- **Aucune commande de terminal requise** : Ouvrez simplement l'URL dans votre navigateur préféré (Chrome, Arc, Edge, Safari, Firefox).
- **Confidentialité absolue (100% Client-Side)** : Vos fichiers de code et logs de sessions Antigravity sont analysés **exclusivement dans la mémoire de votre navigateur** via l'API *HTML5 File System Access*. Aucune ligne de code ni aucun log n'est transmis à un serveur distant.
- **Installable dans le Dock macOS (PWA)** : En un clic, transformez l'application en une application native macOS intégrée dans votre Dock.

---

## 🌟 Fonctionnalités Majeures

### 1. ⏱️ Limite sur 5 Heures & Limite sur la Semaine (en %)
- **Limite sur 5 heures (Fenêtre glissante Antigravity)** :
  - Pourcentage d'utilisation précis (`%`) avec barre de progression dynamique.
  - Décompte en temps réel de réinitialisation (`dans Xh Ym`).
  - Nombre d'appels et tokens consommés sur les 5 dernières heures.
- **Limite sur la semaine (7 jours consécutifs)** :
  - Suivi hebdomadaire de votre consommation globale.
  - Indicateur de statut visuel (*Quota optimal*, *Modéré*, *Critique*).

### 2. 👑 Abonnement Google AI PRO (Google One AI Premium)
- Mode dédié **Google AI Pro** :
  - Coût facturé affiché : **Inclus (0,00 €)** dans votre abonnement (21,99 €/mois).
  - **Valeur marchande API calculée** : Visualisez l'équivalent monétaire exact de ce que vous auriez payé avec l'API Gemini standard.
  - **Taux de Rentabilité (ROI)** : Calcule automatiquement l'amortissement de votre forfait mensuel (ex: *Rentabilisé à 230%*).
  - Quotas prioritaires (250 appels / 5h, 1 500 appels / 7 jours).

### 3. 📂 Connexion Directe au Dossier Antigravity (`~/.gemini/antigravity`)
- Cliquez sur **« Sélectionner le dossier Antigravity »** ou **glissez-déposez le dossier `antigravity`** sur la fenêtre.
- **Astuce macOS pour afficher `.gemini`** : Dans la boîte de dialogue du Finder, appuyez sur <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>.</kbd> pour afficher les dossiers cachés.
- Synchronisation continue automatique : Les nouvelles requêtes et tokens s'affichent en temps réel pendant que vous codez.

### 4. 🧮 Simulateur de Tokens Multimodal (Texte, Images & Documents)
- Glissez-déposez vos **images** (PNG, JPG, WEBP) : calcul de la résolution et découpage automatique en tuiles Gemini (258 tokens par tuile de 768px).
- Importez vos **fichiers PDF & bureautique** : calcul des pages visuelles et tokens de texte.
- Collez vos prompts ou extraits de code pour estimation instantanée.
- **Grille comparative** des coûts sur tous les modèles Gemini (**3.8 Flash**, **2.5 Flash**, **2.0 Flash Thinking**, **1.5 Pro**).
- Bouton **« Compter via API Gemini »** pour vérifier le volume exact avec l'API officielle Google AI Studio.

### 5. 💻 Installation dans le Dock macOS (Progressive Web App)
- **Sur Chrome / Arc / Edge (Mac)** : Cliquez sur le bouton **« 💻 Installer dans le Dock »** dans la barre supérieure ou dans la barre d'adresse pour installer l'application en standalone.
- **Sur Safari (macOS Sonoma et supérieur)** : Menu *Fichier* > *Ajouter au Dock...*.

---

## 🛠️ Utilisation Locale avec Python (Optionnel)

Si vous préférez exécuter le serveur Python en local :

```bash
# 1. Cloner le projet
git clone https://github.com/nxm310/antigravity-gemini-token-tracker.git
cd antigravity-gemini-token-tracker

# 2. Lancer l'application
python3 app.py
```

Le tableau de bord s'ouvrira immédiatement sur [http://127.0.0.1:5050](http://127.0.0.1:5050).

---

## 🔒 Sécurité et Clé API Google AI Studio

- Votre clé API Gemini (optionnelle, pour le comptage officiel) est enregistrée **uniquement dans votre `localStorage` de navigateur** (ou dans `config.json` en local).
- Le fichier `config.json` est strictement exclu de Git via `.gitignore`.
- Aucune information personnelle ni aucun extrait de votre code source n'est partagé ou conservé.

---

## 📄 Licence

Projet open-source distribué sous licence MIT.
