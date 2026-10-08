# 🛰️ Antigravity Pulse pour Home Assistant

Intégration et capteurs Home Assistant pour suivre vos quotas d'utilisation **Google Antigravity** (Gemini Pro / Flash) :
- **Quota 5 Heures** restant (%) avec reset automatique à 100% dès expiration.
- **Quota Semaine** restant (%).
- **Heures de réinitialisation** (5h et semaine).
- **Tokens consommés aujourd'hui**.
- **Valeur brute API Google**.

---

## ⚡ Pourquoi cette solution ne dépend PAS de votre Mac allumé 24/7 ?

Google Antigravity gère ses quotas locaux via un processus interne sur votre Mac (`language_server`). Il n'existe pas d'API REST cloud publique Google One pour ces quotas.

Pour que votre **Home Assistant continue de fonctionner 24h/24** même si votre Mac est en veille ou éteint :
1. Chaque fois que votre Mac est allumé et que vous utilisez Antigravity, les quotas sont synchronisés sur votre dépôt GitHub public :  
   `https://raw.githubusercontent.com/nxm310/antigravity-gemini-token-tracker/main/data.json`
2. **Home Assistant lit directement ce lien GitHub.**
3. **Reset dynamique autonome :** Si votre Mac est éteint et que l'heure de reset (ex: 13:44) est dépassée, Home Assistant recalcule automatiquement le quota restant à **100%** sans attendre que le Mac se rallume !

---

## 🚀 Méthode 1 : Installation par YAML (La plus rapide, 2 minutes)

Aucun plugin complexe à installer, utilise l'intégration native `rest` de Home Assistant.

### 1. Activer les packages dans votre `configuration.yaml` (si pas déjà fait)
Assurez-vous que votre `configuration.yaml` contient :
```yaml
homeassistant:
  packages: !include_dir_named packages
```

### 2. Copier le fichier
Copiez le fichier [`homeassistant/antigravity_pulse.yaml`](./antigravity_pulse.yaml) dans votre dossier Home Assistant :
`/config/packages/antigravity_pulse.yaml`

### 3. Recharger Home Assistant
- Allez dans **Outils de développement** > onglet **YAML**.
- Cliquez sur **Recharger la configuration REST** et **Recharger les entités de modèle**.

---

## 🧩 Méthode 2 : Intégration Custom Component (Interface Graphique)

Si vous préférez ajouter l'intégration directement depuis l'interface utilisateur de Home Assistant :

1. Copiez le dossier [`custom_components/antigravity_pulse`](../custom_components/antigravity_pulse) dans le dossier `/config/custom_components/` de votre Home Assistant.
2. Redémarrez Home Assistant.
3. Allez dans **Paramètres** > **Appareils et services** > **Ajouter une intégration**.
4. Cherchez **Antigravity Pulse**.
5. L'URL GitHub par défaut est pré-remplie (`https://raw.githubusercontent.com/nxm310/antigravity-gemini-token-tracker/main/data.json`). Validez !

---

## 📊 Cartes Lovelace (Tableau de bord)

Ouvrez un tableau de bord, cliquez sur **Ajouter une carte** > **Manuel** (tout en bas) et collez le contenu du fichier [`homeassistant/lovelace_card.yaml`](./lovelace_card.yaml) :

```yaml
type: vertical-stack
title: 🤖 Antigravity Quota Tracker
cards:
  - type: horizontal-stack
    cards:
      - type: gauge
        entity: sensor.antigravity_quota_5h_restant
        name: Quota 5h
        unit: '%'
        min: 0
        max: 100
        needle: true
        severity:
          red: 0
          yellow: 25
          green: 60
      - type: gauge
        entity: sensor.antigravity_quota_semaine_restant
        name: Quota Semaine
        unit: '%'
        min: 0
        max: 100
        needle: true
        severity:
          red: 0
          yellow: 20
          green: 50
  - type: entities
    title: Détails & Réinitialisations
    show_header_toggle: false
    entities:
      - entity: sensor.antigravity_reset_5h
        name: Prochain reset (5h)
      - entity: sensor.antigravity_reset_semaine
        name: Reset hebdomadaire
      - entity: sensor.antigravity_tokens_aujourd_hui
        name: Tokens consommés (24h)
      - entity: sensor.antigravity_valeur_api
        name: Économie API Google
```

---

## 🔔 Exemple d'automatisation : Alerte Quota Faible

Pour recevoir une notification sur votre téléphone si votre quota 5h passe sous la barre des 15% :

```yaml
alias: "Alerte Quota Antigravity Faible"
description: "Alerte si le quota 5h descend sous 15%"
trigger:
  - platform: numeric_state
    entity_id: sensor.antigravity_quota_5h_restant
    below: 15
condition: []
action:
  - service: notify.notify
    data:
      title: "⚠️ Quota Antigravity presque épuisé"
      message: >
        Il ne vous reste que {{ states('sensor.antigravity_quota_5h_restant') }}% de quota 5h.
        Prochain reset : {{ states('sensor.antigravity_reset_5h') }}.
mode: single
```
