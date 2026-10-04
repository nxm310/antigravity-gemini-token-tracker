---
name: changelog-popup
description: >-
  Guides the implementation, design, and automation of a modern "What's New" / Changelog modal pop-up
  in any web application (Vanilla JS, React, Vue, Tailwind, etc.). Use this skill whenever the user wants
  to add a release notes pop-up, show new features on app startup, track seen versions in localStorage,
  or build an interactive version history modal.
---

# Skill : Pop-up Nouveautés & Historique des Versions (What's New Modal)

Ce guide fournit une solution prête à l'emploi, robuste et universelle pour implémenter un **pop-up de nouveautés (Changelog)** dans n'importe quel projet web.

---

## 🎯 Architecture & Principe de Fonctionnement

Le système repose sur **3 piliers fondamentaux** :

1. **Une constante de version sémantique** : `CURRENT_APP_VERSION = "1.5.0"`.
2. **Une persistance locale (`localStorage`)** : Clé `tracker_last_seen_version` (ou `<app>_last_seen_version`).
   - Au chargement de l'application, on compare la version enregistrée avec `CURRENT_APP_VERSION`.
   - Si la version est différente ou inexistante, le pop-up s'ouvre **automatiquement** après un léger délai (500–800 ms) pour une transition fluide.
   - La version est alors enregistrée dans `localStorage` pour ne plus déranger l'utilisateur jusqu'à la prochaine mise à jour.
3. **Un déclencheur manuel permanent** :
   - Un bouton (ex: `✨ Nouveautés` ou `v1.5.0`) placé dans le menu ou l'en-tête permet à l'utilisateur de réouvrir le pop-up quand il le souhaite.

```
┌────────────────────────────────────────────────────────┐
│               Chargement de l'Application              │
└───────────────────────────┬────────────────────────────┘
                            │
              localStorage.getItem(VERSION_KEY)
                            │
               ┌────────────┴────────────┐
       Différent de CURRENT       Identique à CURRENT
               │                         │
      Attente 600ms (UX fluide)   Ne rien faire
               │
      Ouverture automatique
               │
      Enregistrement CURRENT
```

---

## 🚀 Implémentation Rapide (Vanilla HTML/CSS/JS)

### 1. Structure HTML (Modal + Déclencheur)

Insérez ce bloc à la fin de votre `<body>` (avant les balises `<script>`) :

```html
<!-- Bouton déclencheur manuel (dans l'en-tête ou le menu) -->
<button id="openChangelogBtn" class="btn-changelog" title="Voir l'historique des versions">
  ✨ Nouveautés <span class="badge-version">v1.0.0</span>
</button>

<!-- Modal Pop-up Nouveautés -->
<div id="changelogModal" class="modal-overlay" aria-hidden="true" role="dialog" aria-modal="true">
  <div class="modal-box modal-box-large">
    <!-- En-tête du Modal -->
    <div class="modal-header">
      <div class="modal-title-group">
        <span class="modal-icon">✨</span>
        <div>
          <h3 class="modal-title">
            Nouveautés & Historique des Versions
            <span class="version-tag">v1.0.0</span>
          </h3>
          <p class="modal-subtitle">Journal des changements, améliorations et évolutions de l'application</p>
        </div>
      </div>
      <button class="close-btn" id="closeChangelogBtn" aria-label="Fermer la fenêtre">&times;</button>
    </div>

    <!-- Timeline des versions défilable -->
    <div class="changelog-timeline">
      <!-- Version Actuelle (Mise en avant) -->
      <div class="changelog-item current-version">
        <div class="changelog-badge current">v1.0.0 • Actuelle (04 Octobre 2026)</div>
        <h4 class="changelog-title">Lancement Initial & Fonctionnalités Clés</h4>
        <ul class="changelog-list">
          <li><strong>🚀 Déploiement initial :</strong> Mise en ligne de la plateforme.</li>
          <li><strong>✨ Nouvelle interface :</strong> Design sombre moderne et optimisé pour smartphone.</li>
          <li><strong>⚡ Performance :</strong> Chargement instantané et mise en cache intelligente.</li>
        </ul>
      </div>

      <!-- Version Précédente (Exemple) -->
      <div class="changelog-item">
        <div class="changelog-badge">v0.9.0 • Bêta (25 Septembre 2026)</div>
        <h4 class="changelog-title">Phase de tests et stabilisation</h4>
        <ul class="changelog-list">
          <li><strong>🧪 Tests utilisateurs :</strong> Retours d'expérience et ajustements ergonomiques.</li>
          <li><strong>🐛 Corrections :</strong> Résolution des bugs de jeunesse sur Safari mobile.</li>
        </ul>
      </div>
    </div>

    <!-- Pied de page -->
    <div class="modal-footer">
      <span class="footer-note">Application • Tous droits réservés</span>
      <button class="btn-primary" id="closeChangelogBtnFooter">C'est noté !</button>
    </div>
  </div>
</div>
```

---

### 2. Styles CSS (Glassmorphism, Dark Mode, Animations & Mobile)

```css
/* --- OVERLAY / BACKDROP --- */
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 9999;
  align-items: center;
  justify-content: center;
  padding: 16px;
  opacity: 0;
  transition: opacity 0.25s ease;
}

.modal-overlay.active {
  display: flex;
  opacity: 1;
}

/* --- BOÎTE MODALE --- */
.modal-box {
  background: #111827; /* Gris sombre / Dark Slate */
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  width: 100%;
  max-width: 680px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(56, 189, 248, 0.1);
  transform: translateY(12px) scale(0.97);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.modal-overlay.active .modal-box {
  transform: translateY(0) scale(1);
}

/* --- EN-TÊTE --- */
.modal-header {
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-icon {
  font-size: 1.8rem;
}

.modal-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #f9fafb;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.version-tag {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.35);
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.modal-subtitle {
  margin: 4px 0 0 0;
  font-size: 0.82rem;
  color: #9ca3af;
}

.close-btn {
  background: transparent;
  border: none;
  color: #9ca3af;
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

/* --- TIMELINE DÉFILABLE --- */
.changelog-timeline {
  padding: 20px 24px;
  overflow-y: auto;
  max-height: 55vh;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Scrollbar fine et élégante */
.changelog-timeline::-webkit-scrollbar {
  width: 6px;
}
.changelog-timeline::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

/* --- ITEM DE VERSION --- */
.changelog-item {
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  transition: border-color 0.2s;
}

.changelog-item.current-version {
  background: rgba(56, 189, 248, 0.03);
  border: 1px solid rgba(56, 189, 248, 0.3);
  box-shadow: 0 0 15px rgba(56, 189, 248, 0.05);
}

.changelog-badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #9ca3af;
  margin-bottom: 8px;
}

.changelog-badge.current {
  color: #38bdf8;
}

.changelog-title {
  margin: 0 0 10px 0;
  font-size: 0.98rem;
  font-weight: 600;
  color: #f3f4f6;
}

.changelog-list {
  margin: 0;
  padding-left: 20px;
  font-size: 0.88rem;
  color: #d1d5db;
  line-height: 1.55;
}

.changelog-list li {
  margin-bottom: 6px;
}

.changelog-list strong {
  color: #ffffff;
}

.changelog-list code {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.82em;
  color: #a5f3fc;
}

/* --- PIED DE PAGE --- */
.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(0, 0, 0, 0.2);
}

.footer-note {
  font-size: 0.8rem;
  color: #6b7280;
}

.btn-primary {
  background: #0284c7;
  color: #ffffff;
  border: none;
  padding: 9px 20px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  background: #0369a1;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
}

/* --- RESPONSIVE MOBILE --- */
@media (max-width: 640px) {
  .modal-box {
    max-height: 90vh;
    border-radius: 12px;
  }
  .modal-header, .changelog-timeline, .modal-footer {
    padding: 14px 16px;
  }
  .modal-title {
    font-size: 1.05rem;
  }
  .footer-note {
    display: none;
  }
  .modal-footer {
    justify-content: flex-end;
  }
}
```

---

### 3. Contrôleur JavaScript (`changelog.js`)

```javascript
/**
 * Gestionnaire du Pop-up Nouveautés & Versioning
 */
const CURRENT_APP_VERSION = "1.0.0"; // ⚠️ Incrémenter à chaque release (ex: "1.0.1", "1.1.0")
const CHANGELOG_STORAGE_KEY = "my_app_last_seen_version";

function openChangelogModal() {
  const modal = document.getElementById("changelogModal");
  if (!modal) return;
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden"; // Empêche le scroll en arrière-plan
}

function closeChangelogModal() {
  const modal = document.getElementById("changelogModal");
  if (!modal) return;
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";

  // Enregistre que l'utilisateur a vu cette version
  localStorage.setItem(CHANGELOG_STORAGE_KEY, CURRENT_APP_VERSION);
}

function checkAutoOpenChangelog() {
  const lastSeen = localStorage.getItem(CHANGELOG_STORAGE_KEY);
  if (!lastSeen || lastSeen !== CURRENT_APP_VERSION) {
    // Délai de 600ms pour laisser la page se charger proprement
    setTimeout(() => {
      openChangelogModal();
      // On sauvegarde pour éviter toute réouverture intempestive en cas de refresh immédiat
      localStorage.setItem(CHANGELOG_STORAGE_KEY, CURRENT_APP_VERSION);
    }, 600);
  }
}

// Initialisation des écouteurs d'événements
document.addEventListener("DOMContentLoaded", () => {
  // 1. Bouton déclencheur manuel
  document.getElementById("openChangelogBtn")?.addEventListener("click", openChangelogModal);

  // 2. Boutons de fermeture
  document.getElementById("closeChangelogBtn")?.addEventListener("click", closeChangelogModal);
  document.getElementById("closeChangelogBtnFooter")?.addEventListener("click", closeChangelogModal);

  // 3. Fermeture au clic sur le fond sombre (backdrop)
  document.getElementById("changelogModal")?.addEventListener("click", (e) => {
    if (e.target.id === "changelogModal") {
      closeChangelogModal();
    }
  });

  // 4. Fermeture avec la touche Échap (Escape)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = document.getElementById("changelogModal");
      if (modal && modal.classList.contains("active")) {
        closeChangelogModal();
      }
    }
  });

  // 5. Test automatique au démarrage
  checkAutoOpenChangelog();
});
```

---

## ⚡ Méthode Recommandée : Version Basée sur les Données (Data-Driven JSON)

Au lieu de dupliquer du code HTML à chaque mise à jour, utilisez un tableau JavaScript ou un fichier JSON. Il suffit alors de **rajouter un objet au début du tableau** pour mettre à jour à la fois le pop-up, le badge et le numéro de version !

```javascript
const CHANGELOG_DATA = [
  {
    version: "1.1.0",
    date: "10 Octobre 2026",
    title: "Optimisation Mobile & Mode Hors Ligne",
    changes: [
      "📱 Interface 100% responsive sur smartphones et tablettes.",
      "⚡ Service Worker PWA pour consultation hors ligne.",
      "🐛 Correction des décalages horaires sur le fuseau UTC+2."
    ]
  },
  {
    version: "1.0.0",
    date: "04 Octobre 2026",
    title: "Lancement Initial",
    changes: [
      "🚀 Première version stable en production.",
      "✨ Dashboard temps réel et graphiques analytiques."
    ]
  }
];

function renderChangelogTimeline() {
  const container = document.querySelector(".changelog-timeline");
  if (!container) return;

  const currentVersion = CHANGELOG_DATA[0].version;

  container.innerHTML = CHANGELOG_DATA.map((entry, index) => {
    const isCurrent = index === 0;
    return `
      <div class="changelog-item ${isCurrent ? 'current-version' : ''}">
        <div class="changelog-badge ${isCurrent ? 'current' : ''}">
          v${entry.version} • ${isCurrent ? 'Actuelle' : ''} (${entry.date})
        </div>
        <h4 class="changelog-title">${entry.title}</h4>
        <ul class="changelog-list">
          ${entry.changes.map(c => `<li>${c}</li>`).join("")}
        </ul>
      </div>
    `;
  }).join("");

  // Met à jour automatiquement les tags de version
  document.querySelectorAll(".version-tag").forEach(el => el.textContent = `v${currentVersion}`);
}
```

---

## 📋 Checklist pour une Nouvelle Version

À chaque nouvelle release de votre projet :
1. ✅ Incrémenter `CURRENT_APP_VERSION` (ou ajouter l'objet en haut de `CHANGELOG_DATA`).
2. ✅ Ajouter les 3 à 5 points clés dans la liste des changements.
3. ✅ (Si applicable) Ajouter un paramètre anti-cache sur le script : `<script src="app.js?v=X.Y.Z"></script>`.
4. ✅ Tester : Supprimer la clé dans `localStorage.removeItem("my_app_last_seen_version")` et recharger pour vérifier l'apparition automatique.

---

## 📂 Ressources Complémentaires du Skill

- **[Frameworks (React, Vue, Tailwind)](./references/framework-adapters.md)** : Composants prêts pour Next.js, Nuxt ou Tailwind CSS.
- **[Exemple Autonome Clé en Main](./templates/vanilla/changelog-popup.html)** : Page HTML unique testable directement dans votre navigateur.
