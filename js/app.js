// js/app.js - Moteur Hybride Client-Side & Serveur pour Antigravity Gemini Token Tracker
// Fonctionne à 100% en local dans le navigateur (GitHub Pages) et compatible avec le serveur Python.

// --- CONFIGURATION & ÉTAT GLOBAL ---
let appConfig = {
  currency: "EUR",
  pricing_mode: localStorage.getItem("tracker_pricing_mode") || "google_ai_pro",
  default_model: localStorage.getItem("tracker_default_model") || "gemini-3.8-flash",
  sim_intensity: localStorage.getItem("tracker_sim_intensity") || "high",
  api_key: localStorage.getItem("gemini_api_key") || "",
  daily_budget_limit: parseFloat(localStorage.getItem("tracker_budget_limit") || "5.0"),
  pro_monthly_cost: parseFloat(localStorage.getItem("tracker_pro_cost") || "21.99"),
  usd_to_eur: 0.92
};

let appState = {
  mode: "browser", // 'browser' (client-side) ou 'server' (Python API)
  dirHandle: null,
  activeSessionHandle: null,
  activeSessionLastModified: 0,
  sessions: [],
  activeSession: null,
  turnEvents: [],
  dailyTrends: {},
  uploadedFiles: [],
  calcDebounce: null,
  watcherInterval: null,
  pwaDeferredPrompt: null
};

// --- GRILLE OFFICIELLE DES TARIFS GEMINI & MODÈLES ANTIGRAVITY ---
const GEMINI_MODELS = {
  "gemini-3.8-flash": {
    name: "⚡ Gemini 3.8 Flash (High / Med / Low)",
    default_intensity: "high",
    allowed_intensities: ["low", "medium", "high"],
    input_cost_standard: 0.075,
    input_cost_large: 0.15,
    output_cost_standard: 0.30,
    output_cost_large: 0.60,
    threshold_large: 128000
  },
  "gemini-3.7-flash": {
    name: "⚡ Gemini 3.7 Flash (High / Med / Low)",
    default_intensity: "medium",
    allowed_intensities: ["low", "medium", "high"],
    input_cost_standard: 0.075,
    input_cost_large: 0.15,
    output_cost_standard: 0.30,
    output_cost_large: 0.60,
    threshold_large: 128000
  },
  "gemini-3.6-flash": {
    name: "⚡ Gemini 3.6 Flash (High / Med / Low)",
    default_intensity: "medium",
    allowed_intensities: ["low", "medium", "high"],
    input_cost_standard: 0.075,
    input_cost_large: 0.15,
    output_cost_standard: 0.30,
    output_cost_large: 0.60,
    threshold_large: 128000
  },
  "gemini-3.1-pro": {
    name: "🧠 Gemini 3.1 Pro (High / Low)",
    default_intensity: "low",
    allowed_intensities: ["low", "high"],
    input_cost_standard: 1.25,
    input_cost_large: 2.50,
    output_cost_standard: 5.00,
    output_cost_large: 10.00,
    threshold_large: 128000
  },
  "gemini-2.5-flash": {
    name: "🚀 Gemini 2.5 Flash",
    default_intensity: "medium",
    allowed_intensities: ["low", "medium", "high"],
    input_cost_standard: 0.075,
    input_cost_large: 0.15,
    output_cost_standard: 0.30,
    output_cost_large: 0.60,
    threshold_large: 128000
  },
  "gemini-2.0-flash": {
    name: "✨ Gemini 2.0 Flash",
    default_intensity: "medium",
    allowed_intensities: ["low", "medium", "high"],
    input_cost_standard: 0.10,
    input_cost_large: 0.10,
    output_cost_standard: 0.40,
    output_cost_large: 0.40,
    threshold_large: 128000
  },
  "gemini-2.0-flash-thinking": {
    name: "🧠 Gemini 2.0 Flash Thinking",
    default_intensity: "high",
    allowed_intensities: ["low", "medium", "high"],
    input_cost_standard: 0.10,
    input_cost_large: 0.10,
    output_cost_standard: 0.40,
    output_cost_large: 0.40,
    threshold_large: 128000
  },
  "gemini-1.5-flash": {
    name: "💨 Gemini 1.5 Flash",
    default_intensity: "low",
    allowed_intensities: ["low", "medium", "high"],
    input_cost_standard: 0.075,
    input_cost_large: 0.15,
    output_cost_standard: 0.30,
    output_cost_large: 0.60,
    threshold_large: 128000
  },
  "gemini-1.5-pro": {
    name: "👑 Gemini 1.5 Pro",
    default_intensity: "medium",
    allowed_intensities: ["low", "medium", "high"],
    input_cost_standard: 1.25,
    input_cost_large: 2.50,
    output_cost_standard: 5.00,
    output_cost_large: 10.00,
    threshold_large: 128000
  },
  "claude-opus-5.5": {
    name: "🟣 Claude Opus 5.5 (High / Med / Low)",
    default_intensity: "medium",
    allowed_intensities: ["low", "medium", "high"],
    input_cost_standard: 15.00,
    input_cost_large: 15.00,
    output_cost_standard: 75.00,
    output_cost_large: 75.00,
    threshold_large: 128000
  },
  "claude-sonnet-5.5": {
    name: "🔵 Claude Sonnet 5.5 (High / Med / Low)",
    default_intensity: "medium",
    allowed_intensities: ["low", "medium", "high"],
    input_cost_standard: 3.00,
    input_cost_large: 3.00,
    output_cost_standard: 15.00,
    output_cost_large: 15.00,
    threshold_large: 128000
  },
  "gpt-oss-120b": {
    name: "🟢 GPT-OSS 120B (High / Med / Low)",
    default_intensity: "medium",
    allowed_intensities: ["low", "medium", "high"],
    input_cost_standard: 0.15,
    input_cost_large: 0.15,
    output_cost_standard: 0.60,
    output_cost_large: 0.60,
    threshold_large: 128000
  }
};

let chartDaily = null;
let chartDistribution = null;

// --- INITIALISATION AU CHARGEMENT ---
document.addEventListener("DOMContentLoaded", async () => {
  initUIFromConfig();
  initEventListeners();
  initPWA();
  initPullToRefresh();
  initDropzoneEvents();
  initGlobalDragAndDrop();
  startLiveCountdownTicker();
  checkAutoOpenChangelog();

  // Notification de confirmation après un pull-to-refresh
  const justRefreshed = sessionStorage.getItem("just_pulled_refresh");
  if (justRefreshed) {
    sessionStorage.removeItem("just_pulled_refresh");
    setTimeout(() => {
      showToast("✨ Page actualisée avec succès");
    }, 450);
  }

  // 1. Test si un serveur Python tourne en local
  const hasLocalServer = await checkLocalServer();
  if (hasLocalServer) {
    appState.mode = "server";
    updateLiveBadge("Serveur Python Connecté", "#10b981");
    fetchServerDashboard();
    setInterval(fetchServerDashboard, 3500);
  } else {
    appState.mode = "browser";
    // 2. Tenter de restaurer la connexion IndexedDB au dossier Antigravity
    const restored = await tryRestoreDirectoryAccess();
    if (!restored) {
      // 3. Charger le snapshot réel data.json s'il existe !
      const loadedRealSnapshot = await tryLoadDataJsonSnapshot();
      if (!loadedRealSnapshot) {
        // En dernier recours, données d'exemple
        loadDemoData();
      }
    }
  }
});

// --- COMPTE À REBOURS DYNAMIQUE EN TEMPS RÉEL (1s) ---
function startLiveCountdownTicker() {
  if (window._countdownTickerStarted) return;
  window._countdownTickerStarted = true;

  setInterval(() => {
    const now = Date.now();
    const kpi5Reset = document.getElementById("kpi5hReset");
    const kpiWReset = document.getElementById("kpiWeeklyReset");

    if (appState.resetTime5h && kpi5Reset) {
      const diff5 = Math.floor((appState.resetTime5h - now) / 1000);
      if (diff5 > 0) {
        const h = Math.floor(diff5 / 3600);
        const m = Math.floor((diff5 % 3600) / 60);
        const s = diff5 % 60;
        kpi5Reset.textContent = h > 0 ? `⏱️ dans ${h}h ${m}m ${s}s` : `⏱️ dans ${m}m ${s}s`;
      } else {
        kpi5Reset.textContent = "⏱️ Prêt (Rechargé à 100%)";
        const kpi5Date = document.getElementById("kpi5hExactDate");
        if (kpi5Date) kpi5Date.textContent = "📅 Reset : Prêt";
        const kpi5Val = document.getElementById("kpi5hVal");
        if (kpi5Val && !kpi5Val.textContent.includes("100%")) {
          kpi5Val.innerHTML = '100% <span style="font-size: 0.5em; font-weight: normal; opacity: 0.85;">restant</span>';
          kpi5Val.style.color = "#38bdf8";
        }
        const kpi5Bar = document.getElementById("kpi5hBar");
        if (kpi5Bar) {
          kpi5Bar.style.width = "100%";
          kpi5Bar.className = "progress-bar-fill bg-cyan";
        }
        appState.resetTime5h = null;
      }
    }

    if (appState.resetTime7d && kpiWReset) {
      const diff7 = Math.floor((appState.resetTime7d - now) / 1000);
      if (diff7 > 0) {
        const d = Math.floor(diff7 / 86400);
        const h = Math.floor((diff7 % 86400) / 3600);
        const m = Math.floor((diff7 % 3600) / 60);
        const s = diff7 % 60;
        if (d > 0) {
          kpiWReset.textContent = `⏱️ dans ${d}j ${h}h ${m}m ${s}s`;
        } else if (h > 0) {
          kpiWReset.textContent = `⏱️ dans ${h}h ${m}m ${s}s`;
        } else {
          kpiWReset.textContent = `⏱️ dans ${m}m ${s}s`;
        }
      } else {
        kpiWReset.textContent = "⏱️ Prêt (Rechargé à 100%)";
        const kpiWDate = document.getElementById("kpiWeeklyExactDate");
        if (kpiWDate) kpiWDate.textContent = "📅 Remise à 0 : Prêt";
        const kpiWVal = document.getElementById("kpiWeeklyVal");
        if (kpiWVal && !kpiWVal.textContent.includes("100%")) {
          kpiWVal.innerHTML = '100% <span style="font-size: 0.5em; font-weight: normal; opacity: 0.85;">restant</span>';
          kpiWVal.style.color = "#34d399";
        }
        const kpiWBar = document.getElementById("kpiWeeklyBar");
        if (kpiWBar) {
          kpiWBar.style.width = "100%";
          kpiWBar.className = "progress-bar-fill bg-emerald";
        }
        appState.resetTime7d = null;
      }
    }
  }, 1000);
}

// --- ENREGISTREMENT PWA SERVICE WORKER & DOCK INSTALL ---
function initPWA() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => {
        console.log("Service Worker non enregistré :", err);
      });
    });
  }

  const pwaBtn = document.getElementById("pwaInstallBtn");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    appState.pwaDeferredPrompt = e;
    if (pwaBtn) {
      pwaBtn.style.display = "flex";
      pwaBtn.addEventListener("click", async () => {
        if (!appState.pwaDeferredPrompt) return;
        closeMainMenu();
        appState.pwaDeferredPrompt.prompt();
        const { outcome } = await appState.pwaDeferredPrompt.userChoice;
        if (outcome === "accepted") {
          pwaBtn.style.display = "none";
          showToast("🎉 Application ajoutée au Dock !");
        }
        appState.pwaDeferredPrompt = null;
      });
    }
  });

  window.addEventListener("appinstalled", () => {
    if (pwaBtn) pwaBtn.style.display = "none";
    showToast("✨ Antigravity Token Tracker installé avec succès");
  });
}

// --- ACTUALISATION AU GLISSER VERS LE BAS (PULL TO REFRESH) ---
function initPullToRefresh() {
  const ptrElem = document.getElementById("pullToRefresh");
  const ptrLabel = document.querySelector("#pullToRefresh .ptr-label");
  const containerElem = document.querySelector(".container");

  if (!ptrElem || !containerElem) return;

  let startY = 0;
  let startX = 0;
  let currentY = 0;
  let isTracking = false;
  let isPulling = false;
  let isRefreshing = false;
  const threshold = 70;
  const maxPull = 120;
  let hasVibrated = false;

  const onStart = (e) => {
    if (isRefreshing) return;
    // Ne pas déclencher si un modal ou pop-up est ouvert
    if (document.querySelector(".modal-overlay.active, .modal-overlay[style*='flex']")) return;
    // Ne pas interférer avec les contrôles de formulaire, boutons ou liens
    if (e.target.closest("button, select, input, textarea, a, .intensity-btn, .modal-box, table")) return;
    // Uniquement tout en haut de la page
    if (window.scrollY > 4 || document.documentElement.scrollTop > 4) return;

    const touch = e.touches ? e.touches[0] : e;
    startY = touch.clientY;
    startX = touch.clientX;
    isTracking = true;
    isPulling = false;
    hasVibrated = false;
  };

  const onMove = (e) => {
    if (!isTracking || isRefreshing) return;

    const touch = e.touches ? e.touches[0] : e;
    currentY = touch.clientY;
    const currentX = touch.clientX;
    const deltaY = currentY - startY;
    const deltaX = currentX - startX;

    // Si l'utilisateur scroll vers le bas dans la page
    if (window.scrollY > 4 || document.documentElement.scrollTop > 4) {
      if (isPulling) resetPull();
      isTracking = false;
      return;
    }

    // Si le geste est principalement horizontal (ex: scroll tableau ou carrousel)
    if (!isPulling && Math.abs(deltaX) > Math.abs(deltaY)) {
      isTracking = false;
      return;
    }

    if (deltaY > 8) {
      if (!isPulling) {
        isPulling = true;
        ptrElem.classList.add("ptr-pulling");
        containerElem.classList.add("ptr-moving");
      }

      // Empêcher l'overscroll natif du navigateur
      if (e.cancelable) e.preventDefault();

      // Résistance élastique progressive (effet rubber-band naturel)
      const pullDistance = Math.min(maxPull, Math.pow(deltaY, 0.82) * 1.8);

      ptrElem.style.transform = `translateY(${pullDistance}px)`;
      containerElem.style.transform = `translateY(${pullDistance * 0.42}px)`;

      if (pullDistance >= threshold) {
        if (!ptrElem.classList.contains("ptr-release")) {
          ptrElem.classList.add("ptr-release");
          if (ptrLabel) ptrLabel.textContent = "Relâchez pour actualiser";
          if (!hasVibrated && navigator.vibrate) {
            navigator.vibrate(15);
            hasVibrated = true;
          }
        }
      } else {
        if (ptrElem.classList.contains("ptr-release")) {
          ptrElem.classList.remove("ptr-release");
          if (ptrLabel) ptrLabel.textContent = "Tirez pour actualiser";
          hasVibrated = false;
        }
      }
    } else if (isPulling && deltaY <= 0) {
      resetPull();
    }
  };

  const onEnd = async () => {
    if (!isTracking) return;
    isTracking = false;

    if (!isPulling || isRefreshing) {
      resetPull();
      return;
    }

    const deltaY = currentY - startY;
    const pullDistance = Math.min(maxPull, Math.pow(Math.max(0, deltaY), 0.82) * 1.8);

    if (pullDistance >= threshold) {
      isRefreshing = true;
      ptrElem.classList.remove("ptr-pulling", "ptr-release");
      ptrElem.classList.add("ptr-refreshing");
      if (ptrLabel) ptrLabel.textContent = "Actualisation de la page...";
      ptrElem.style.transform = "translateY(55px)";
      containerElem.style.transform = "translateY(45px)";
      containerElem.classList.remove("ptr-moving");

      if (navigator.vibrate) navigator.vibrate([15, 35]);

      // Mettre à jour les données en mémoire immédiatement
      try {
        if (appState.mode === "server") {
          await fetchServerDashboard();
        } else {
          await tryLoadDataJsonSnapshot();
        }
      } catch (err) {
        console.warn("Échec refresh direct :", err);
      }

      // Marqueur pour afficher le toast de confirmation après rechargement
      sessionStorage.setItem("just_pulled_refresh", "1");

      // Rechargement propre et complet de la page
      setTimeout(() => {
        window.location.reload();
      }, 380);
    } else {
      resetPull();
    }
  };

  const resetPull = () => {
    isPulling = false;
    ptrElem.classList.remove("ptr-pulling", "ptr-release");
    ptrElem.style.transform = "";
    containerElem.classList.remove("ptr-moving");
    containerElem.style.transform = "";
    if (ptrLabel) ptrLabel.textContent = "Tirez pour actualiser";
  };

  // Événements tactiles (Smartphones & Tablettes)
  window.addEventListener("touchstart", onStart, { passive: true });
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onEnd);
  window.addEventListener("touchcancel", resetPull);

  // Événements souris pour tests sur Desktop
  window.addEventListener("mousedown", onStart);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onEnd);
}

// --- INITIALISATION UI & CONFIG ---
function initUIFromConfig() {
  const modeSelect = document.getElementById("modeSelect");
  if (modeSelect) modeSelect.value = appConfig.pricing_mode;

  const simModelSelect = document.getElementById("simModelSelect");
  if (simModelSelect) simModelSelect.value = appConfig.default_model;

  updateIntensityButtonsUI(appConfig.sim_intensity, appConfig.default_model);

  const budgetInput = document.getElementById("budgetLimitInput");
  if (budgetInput) budgetInput.value = appConfig.daily_budget_limit;

  const proCostInput = document.getElementById("proMonthlyCostInput");
  if (proCostInput) proCostInput.value = appConfig.pro_monthly_cost;

  const proMonthlyPrice = document.getElementById("proMonthlyPrice");
  if (proMonthlyPrice) proMonthlyPrice.textContent = `${appConfig.pro_monthly_cost.toFixed(2).replace(".", ",")} €`;

  updateApiKeyButtonStatus();
}

// --- ÉCOUTEURS D'ÉVÉNEMENTS ---
function initEventListeners() {
  // Mode de tarification
  document.getElementById("modeSelect")?.addEventListener("change", (e) => {
    appConfig.pricing_mode = e.target.value;
    localStorage.setItem("tracker_pricing_mode", appConfig.pricing_mode);
    recomputeAll();
  });

  // Sélecteur de modèle Antigravity (Simulateur)
  const simModelSelect = document.getElementById("simModelSelect");
  if (simModelSelect) {
    simModelSelect.addEventListener("change", (e) => {
      appConfig.default_model = e.target.value;
      localStorage.setItem("tracker_default_model", appConfig.default_model);

      const spec = GEMINI_MODELS[appConfig.default_model];
      const allowed = spec?.allowed_intensities || ["low", "medium", "high"];

      // Si l'intensité actuelle n'est pas supportée par ce modèle (ex: Gemini 3.1 Pro qui ne supporte que High et Low)
      if (!allowed.includes(appConfig.sim_intensity)) {
        setSimulatorIntensity(spec?.default_intensity || allowed[0]);
      } else {
        updateIntensityButtonsUI(appConfig.sim_intensity, appConfig.default_model);
        runMultimodalCalculator();
      }
    });
  }

  // Boutons d'intensité de réflexion (Low, Medium, High)
  const intensityBtns = document.querySelectorAll("#simIntensityGroup .intensity-btn");
  intensityBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const level = btn.dataset.intensity;
      setSimulatorIntensity(level);
    });
  });

  // Bouton dossier local (File System Access API)
  document.getElementById("btnPickFolder")?.addEventListener("click", selectAntigravityFolder);

  // Input dossier de secours
  const fallbackInput = document.getElementById("fallbackFolderInput");
  document.getElementById("btnFallbackFolder")?.addEventListener("click", () => fallbackInput?.click());
  fallbackInput?.addEventListener("change", handleFallbackFolderSelected);

  // Guide Mac & Demo
  document.getElementById("btnMacHint")?.addEventListener("click", () => {
    const modal = document.getElementById("macHintModal");
    if (modal) modal.style.display = "flex";
  });
  document.getElementById("closeMacHintBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("macHintModal");
    if (modal) modal.style.display = "none";
  });
  document.getElementById("gotItMacHintBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("macHintModal");
    if (modal) modal.style.display = "none";
  });

  document.getElementById("btnDemoMode")?.addEventListener("click", () => {
    loadDemoData();
    showToast("✨ Données de démonstration chargées");
  });

  // Menu Déroulant Principal Unifié (3 points ⋮)
  const mainMenuBtn = document.getElementById("mainMenuBtn");
  const mainDropdownMenu = document.getElementById("mainDropdownMenu");

  if (mainMenuBtn && mainDropdownMenu) {
    mainMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = mainDropdownMenu.classList.contains("active");
      if (isOpen) {
        closeMainMenu();
      } else {
        openMainMenu();
      }
    });

    // Fermeture au clic à l'extérieur
    document.addEventListener("click", (e) => {
      if (mainDropdownMenu.classList.contains("active")) {
        if (!mainDropdownMenu.contains(e.target) && !mainMenuBtn.contains(e.target)) {
          closeMainMenu();
        }
      }
    });

    // Fermeture avec la touche Échap
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mainDropdownMenu.classList.contains("active")) {
        closeMainMenu();
      }
    });
  }

  // Modal Clé API
  document.getElementById("apiKeyBtn")?.addEventListener("click", () => {
    closeMainMenu();
    openApiKeyModal();
  });
  document.getElementById("closeApiKeyBtn")?.addEventListener("click", closeApiKeyModal);
  document.getElementById("cancelApiKeyBtn")?.addEventListener("click", closeApiKeyModal);
  document.getElementById("saveApiKeyBtn")?.addEventListener("click", testAndSaveApiKey);

  // Modal Récapitulatif Mensuel
  document.getElementById("btnMonthlyRecap")?.addEventListener("click", () => {
    closeMainMenu();
    openMonthlyRecapModal();
  });
  document.getElementById("closeMonthlyRecapBtn")?.addEventListener("click", closeMonthlyRecapModal);
  document.getElementById("closeMonthlyRecapBtn2")?.addEventListener("click", closeMonthlyRecapModal);
  document.getElementById("monthlyRecapModal")?.addEventListener("click", (e) => {
    if (e.target.id === "monthlyRecapModal") closeMonthlyRecapModal();
  });

  // Action Actualiser dans le Menu
  document.getElementById("btnForceRefresh")?.addEventListener("click", async () => {
    closeMainMenu();
    showToast("🔄 Actualisation des données...");
    try {
      if (appState.mode === "server") {
        await fetchServerDashboard();
      } else {
        await tryLoadDataJsonSnapshot();
      }
      showToast("✨ Données actualisées avec succès");
    } catch (e) {
      showToast("⚠️ Erreur lors de l'actualisation");
    }
  });

  // Modal Nouveautés & Changelog
  document.getElementById("btnChangelog")?.addEventListener("click", () => {
    closeMainMenu();
    openChangelogModal();
  });
  document.getElementById("closeChangelogBtn")?.addEventListener("click", closeChangelogModal);
  document.getElementById("closeChangelogBtn2")?.addEventListener("click", closeChangelogModal);
  document.getElementById("changelogModal")?.addEventListener("click", (e) => {
    if (e.target.id === "changelogModal") closeChangelogModal();
  });

  // Recherche sessions
  document.getElementById("searchSessions")?.addEventListener("input", (e) => {
    filterSessionsTable(e.target.value);
  });

  // Bouton Réinitialiser calculateur
  document.getElementById("calcClearBtn")?.addEventListener("click", clearCalculator);

  // Bouton comptage officiel API
  document.getElementById("btnCountOfficialApi")?.addEventListener("click", countTokensViaGeminiApi);

  // Simulateur de prompt
  document.getElementById("calcInput")?.addEventListener("input", () => {
    clearTimeout(appState.calcDebounce);
    appState.calcDebounce = setTimeout(runMultimodalCalculator, 200);
  });
}

// --- DÉTECTION SERVEUR PYTHON LOCAL & SNAPSHOT DATA.JSON ---
async function checkLocalServer() {
  try {
    const res = await fetch("/api/status", { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      appState.serverUrl = "";
      return true;
    }
  } catch (e) {}

  // Si on est sur https:// ou un autre domaine, tenter la connexion à l'instance locale
  if (window.location.hostname !== "127.0.0.1" && window.location.hostname !== "localhost") {
    try {
      const res = await fetch("http://127.0.0.1:5050/api/status", {
        signal: AbortSignal.timeout(1200),
        mode: "cors"
      });
      if (res.ok) {
        appState.serverUrl = "http://127.0.0.1:5050";
        return true;
      }
    } catch (e) {}
  }
  return false;
}

async function fetchServerDashboard() {
  try {
    const baseUrl = appState.serverUrl || "";
    const res = await fetch(`${baseUrl}/api/status`);
    if (!res.ok) return;
    const data = await res.json();
    renderAll(data);
  } catch (err) {
    console.warn("Échec refresh serveur:", err);
  }
}

// Chargement automatique du snapshot data.json contenant les métriques réelles d'Antigravity
async function tryLoadDataJsonSnapshot() {
  try {
    const res = await fetch("./data.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return false;
    const data = await res.json();
    if (data && data.quota_5h && data.totals) {
      if (data.config) {
        appConfig = { ...appConfig, ...data.config };
        initUIFromConfig();
      }
      renderAll(data);
      updateLiveBadge("Données Antigravity Réelles", "#10b981");
      updateConnectBannerStatus(true, "Synchronisé avec vos métriques réelles Antigravity");
      return true;
    }
  } catch (e) {
    console.warn("Snapshot data.json non disponible:", e);
  }
  return false;
}

// --- GESTION DU DOSSIER LOCAL ANTIGRAVITY (FILE SYSTEM ACCESS API) ---
async function selectAntigravityFolder() {
  if (!window.showDirectoryPicker) {
    showToast("⚠️ Votre navigateur ne supporte pas showDirectoryPicker. Utilisez le bouton 'Importer dossier'.");
    document.getElementById("fallbackFolderInput")?.click();
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({
      id: "antigravity_home_dir",
      mode: "read"
    });

    if (!handle) return;
    appState.dirHandle = handle;
    await storeDirectoryHandle(handle);

    updateLiveBadge("Analyse des sessions...", "#38bdf8");
    showToast("📂 Dossier sélectionné, lecture des sessions en cours...");

    await scanAndParseDirectory(handle);
    startDirectoryWatcher();
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error("Erreur sélection dossier :", err);
      showToast("❌ Erreur d'accès au dossier : " + err.message);
    }
  }
}

async function handleFallbackFolderSelected(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const transcriptFiles = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.name === "transcript.jsonl" || file.name.endsWith(".jsonl")) {
      transcriptFiles.push(file);
    }
  }

  if (transcriptFiles.length === 0) {
    showToast("⚠️ Aucun fichier transcript.jsonl trouvé dans ce dossier.");
    return;
  }

  showToast(`📂 Lecture de ${transcriptFiles.length} sessions...`);
  await parseFileList(transcriptFiles);
}

// Glisser-déposer global de dossiers/fichiers n'importe où sur la page
function initGlobalDragAndDrop() {
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  window.addEventListener("drop", async (e) => {
    // Si déposé dans la dropzone du simulateur, laisser le gestionnaire dropzone s'en occuper
    if (e.target.closest("#dropzone")) return;

    e.preventDefault();
    if (!e.dataTransfer || !e.dataTransfer.items) return;

    const items = e.dataTransfer.items;
    const fileEntries = [];

    async function traverseEntry(entry) {
      if (entry.isFile) {
        if (entry.name === "transcript.jsonl") {
          const file = await new Promise((resolve) => entry.file(resolve));
          fileEntries.push(file);
        }
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = await new Promise((resolve) => reader.readEntries(resolve));
        for (const sub of entries) {
          await traverseEntry(sub);
        }
      }
    }

    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry) {
        await traverseEntry(entry);
      }
    }

    if (fileEntries.length > 0) {
      showToast(`📁 ${fileEntries.length} sessions Antigravity détectées via glisser-déposer !`);
      await parseFileList(fileEntries);
    }
  });
}

// Parcours récursif d'un DirectoryHandle pour trouver tous les transcript.jsonl
async function scanAndParseDirectory(dirHandle) {
  const transcriptHandles = [];

  async function walk(handle, path = "") {
    for await (const [name, entry] of handle.entries()) {
      const currentPath = path ? `${path}/${name}` : name;
      if (entry.kind === "file") {
        if (name === "transcript.jsonl") {
          transcriptHandles.push({ handle: entry, path: currentPath });
        }
      } else if (entry.kind === "directory") {
        // Optimisation : ignorer .git et node_modules si présents
        if (name !== ".git" && name !== "node_modules") {
          await walk(entry, currentPath);
        }
      }
    }
  }

  await walk(dirHandle);

  if (transcriptHandles.length === 0) {
    showToast("⚠️ Aucun transcript.jsonl trouvé. Vérifiez que vous avez bien choisi ~/.gemini/antigravity.");
    return;
  }

  // Trier par date de modification (la plus récente d'abord)
  const sessionDataList = [];
  for (const item of transcriptHandles) {
    try {
      const file = await item.handle.getFile();
      const text = await file.text();
      const parsed = parseTranscriptText(text, file.lastModified, item.path);
      if (parsed) {
        sessionDataList.push({
          ...parsed,
          _handle: item.handle,
          _mtime: file.lastModified
        });
      }
    } catch (e) {
      console.warn("Erreur lecture session:", item.path, e);
    }
  }

  sessionDataList.sort((a, b) => b.lastModifiedMs - a.lastModifiedMs);
  appState.sessions = sessionDataList;
  appState.activeSession = sessionDataList[0] || null;

  if (sessionDataList[0]) {
    appState.activeSessionHandle = sessionDataList[0]._handle;
    appState.activeSessionLastModified = sessionDataList[0]._mtime;
  }

  updateConnectBannerStatus(true, `~/.gemini/antigravity (${sessionDataList.length} sessions trouvées)`);
  updateLiveBadge("Live Antigravity Watcher", "#10b981");
  showToast(`✅ ${sessionDataList.length} sessions Antigravity chargées avec succès !`);

  recomputeAll();
}

async function parseFileList(files) {
  const sessionDataList = [];
  for (const file of files) {
    try {
      const text = await file.text();
      const parsed = parseTranscriptText(text, file.lastModified, file.name);
      if (parsed) {
        sessionDataList.push({
          ...parsed,
          _mtime: file.lastModified
        });
      }
    } catch (e) {
      console.warn("Erreur lecture fichier:", file.name, e);
    }
  }

  sessionDataList.sort((a, b) => b.lastModifiedMs - a.lastModifiedMs);
  appState.sessions = sessionDataList;
  appState.activeSession = sessionDataList[0] || null;

  updateConnectBannerStatus(true, `${sessionDataList.length} sessions importées`);
  updateLiveBadge("Sessions Chargées", "#10b981");
  recomputeAll();
}

// Surveillance en temps réel de la session active (auto-refresh)
function startDirectoryWatcher() {
  if (appState.watcherInterval) clearInterval(appState.watcherInterval);
  appState.watcherInterval = setInterval(async () => {
    if (!appState.activeSessionHandle) return;
    try {
      const file = await appState.activeSessionHandle.getFile();
      if (file.lastModified > appState.activeSessionLastModified) {
        appState.activeSessionLastModified = file.lastModified;
        const text = await file.text();
        const updated = parseTranscriptText(text, file.lastModified, "active_session");
        if (updated) {
          appState.sessions[0] = { ...appState.sessions[0], ...updated, _mtime: file.lastModified };
          appState.activeSession = appState.sessions[0];
          recomputeAll();
        }
      }
    } catch (e) {
      // Handle permissions ou fichier temporairement verrouillé
    }
  }, 3500);
}

// --- PARSEUR DU FICHIER TRANSCRIPT.JSONL D'ANTIGRAVITY ---
function parseTranscriptText(text, fileModifiedTime, path = "") {
  if (!text || !text.trim()) return null;

  const lines = text.split("\n");
  const SYSTEM_PROMPT_TOKENS = 3200;

  let currentContext = SYSTEM_PROMPT_TOKENS;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalThinkingTokens = 0;
  let turnsCount = 0;
  let detectedModel = appConfig.default_model;

  let sessionTitle = "";
  let workspaceName = "tracker token price";
  let workspacePath = "";
  let lastTimestamp = "";
  const turnEvents = [];
  const dailyActivity = {};

  // Extraire conversation ID du chemin si possible
  const idMatch = path.match(/brain\/([a-zA-Z0-9_-]+)/);
  const convId = idMatch ? idMatch[1] : Math.random().toString(36).substring(7);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let step;
    try {
      step = JSON.parse(line);
    } catch (e) {
      continue;
    }

    const stype = step.type;
    const content = step.content || "";
    const thinking = step.thinking || "";
    const toolCalls = step.tool_calls || [];
    const createdAt = step.created_at || "";

    if (createdAt) lastTimestamp = createdAt;

    // Détection de titre et workspace
    if (stype === "USER_INPUT" && !sessionTitle && content) {
      const clean = content.replace(/<[^>]+>/g, "").trim();
      sessionTitle = clean.substring(0, 65) || "Session Antigravity";
    }

    if (content.includes("The user has 1 active workspaces") || content.includes("/Users/")) {
      const wsMatch = content.match(/\/Users\/[^\s\n\r"']+/);
      if (wsMatch) {
        workspacePath = wsMatch[0];
        const parts = workspacePath.split("/");
        workspaceName = parts[parts.length - 1] || parts[parts.length - 2] || workspaceName;
      }
    }

    // Détection du modèle
    if (content.includes("Gemini 3.8 Flash") || content.includes("gemini-3.8-flash")) detectedModel = "gemini-3.8-flash";
    else if (content.includes("Gemini 3.7 Flash") || content.includes("gemini-3.7-flash")) detectedModel = "gemini-3.7-flash";
    else if (content.includes("Gemini 3.6 Flash") || content.includes("gemini-3.6-flash")) detectedModel = "gemini-3.6-flash";
    else if (content.includes("Gemini 3.1 Pro") || content.includes("gemini-3.1-pro")) detectedModel = "gemini-3.1-pro";
    else if (content.includes("Claude Opus 5.5") || content.includes("claude-opus-5.5")) detectedModel = "claude-opus-5.5";
    else if (content.includes("Claude Sonnet 5.5") || content.includes("claude-sonnet-5.5")) detectedModel = "claude-sonnet-5.5";
    else if (content.includes("GPT-OSS 120B") || content.includes("gpt-oss-120b")) detectedModel = "gpt-oss-120b";
    else if (content.includes("Gemini 2.5 Flash") || content.includes("gemini-2.5-flash")) detectedModel = "gemini-2.5-flash";
    else if (content.includes("Gemini 2.0 Flash Thinking") || content.includes("gemini-2.0-flash-thinking")) detectedModel = "gemini-2.0-flash-thinking";
    else if (content.includes("Gemini 2.0 Flash") || content.includes("gemini-2.0-flash")) detectedModel = "gemini-2.0-flash";
    else if (content.includes("Gemini 1.5 Pro") || content.includes("gemini-1.5-pro")) detectedModel = "gemini-1.5-pro";
    else if (content.includes("Gemini 1.5 Flash") || content.includes("gemini-1.5-flash")) detectedModel = "gemini-1.5-flash";

    // Date
    let dateStr = "";
    if (createdAt) {
      dateStr = createdAt.substring(0, 10);
    }

    if (stype === "USER_INPUT" || stype === "GENERIC" || stype === "TOOL_OUTPUT") {
      const tok = estimateTokensFast(content);
      currentContext += tok;
    } else if (stype === "PLANNER_RESPONSE") {
      turnsCount++;
      const turnInput = currentContext;
      totalInputTokens += turnInput;

      const outTok = estimateTokensFast(content);
      const thinkTok = estimateTokensFast(thinking);
      const tcTok = toolCalls.length > 0 ? estimateTokensFast(JSON.stringify(toolCalls)) : 0;
      const turnOutput = outTok + tcTok;

      totalOutputTokens += turnOutput;
      totalThinkingTokens += thinkTok;
      currentContext += (turnOutput + thinkTok);

      if (dateStr) {
        if (!dailyActivity[dateStr]) {
          dailyActivity[dateStr] = { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, calls: 0 };
        }
        dailyActivity[dateStr].input_tokens += turnInput;
        dailyActivity[dateStr].output_tokens += turnOutput;
        dailyActivity[dateStr].thinking_tokens += thinkTok;
        dailyActivity[dateStr].calls += 1;
      }

      turnEvents.push({
        time: createdAt || new Date(fileModifiedTime).toISOString(),
        input: turnInput,
        output: turnOutput,
        thinking: thinkTok
      });
    }
  }

  const modDate = lastTimestamp ? new Date(lastTimestamp) : new Date(fileModifiedTime);

  return {
    id: convId,
    title: sessionTitle || `Session ${convId.substring(0, 8)}`,
    workspace_name: workspaceName,
    workspace_path: workspacePath,
    last_modified: formatDateTime(modDate),
    lastModifiedMs: modDate.getTime(),
    turns: turnsCount,
    context_tokens: currentContext,
    api_input_tokens: totalInputTokens,
    api_output_tokens: totalOutputTokens,
    thinking_tokens: totalThinkingTokens,
    total_tokens: totalInputTokens + totalOutputTokens + totalThinkingTokens,
    model_used: detectedModel,
    turn_events: turnEvents,
    daily_activity: dailyActivity
  };
}

// Estimation locale ultra-rapide des tokens (~3.8 caractères / token)
function estimateTokensFast(text) {
  if (!text) return 0;
  return Math.max(1, Math.floor(text.length / 3.8));
}

// --- CALCUL DES LIMITES GLISSANTES & RECALCUL GLOBAL ---
function recomputeAll() {
  const sessions = appState.sessions;
  const now = Date.now();
  const fiveHoursAgo = now - 5 * 3600 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
  const todayStr = new Date().toISOString().substring(0, 10);

  let totInput = 0;
  let totOutput = 0;
  let totThinking = 0;
  let totCostUsd = 0;
  let totCostEur = 0;
  let totApiValueUsd = 0;
  let totApiValueEur = 0;

  let todayCalls = 0;
  let todayInput = 0;
  let todayOutput = 0;
  let todayThinking = 0;
  let todayCostUsd = 0;
  let todayCostEur = 0;
  let todayApiValueEur = 0;

  let calls5h = 0;
  let tokens5h = 0;
  let oldest5hTime = null;

  let calls7d = 0;
  let tokens7d = 0;

  const allDailyTrends = {};

  for (const s of sessions) {
    const cost = calculateCost(
      s.api_input_tokens,
      s.api_output_tokens,
      s.thinking_tokens,
      appConfig.default_model,
      appConfig.pricing_mode
    );

    s.costs = cost;
    totInput += s.api_input_tokens;
    totOutput += s.api_output_tokens;
    totThinking += s.thinking_tokens;
    totCostUsd += cost.total_cost_usd;
    totCostEur += cost.total_cost_eur;
    totApiValueUsd += cost.api_value_usd;
    totApiValueEur += cost.api_value_eur;

    // Agrégations journalières
    for (const [d, acts] of Object.entries(s.daily_activity || {})) {
      if (!allDailyTrends[d]) {
        allDailyTrends[d] = { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, calls: 0, cost_eur: 0, api_value_eur: 0 };
      }
      allDailyTrends[d].input_tokens += acts.input_tokens;
      allDailyTrends[d].output_tokens += acts.output_tokens;
      allDailyTrends[d].thinking_tokens += acts.thinking_tokens;
      allDailyTrends[d].calls += acts.calls;

      const dCost = calculateCost(acts.input_tokens, acts.output_tokens, acts.thinking_tokens, appConfig.default_model, appConfig.pricing_mode);
      allDailyTrends[d].cost_eur += dCost.total_cost_eur;
      allDailyTrends[d].api_value_eur += dCost.api_value_eur;

      if (d === todayStr) {
        todayCalls += acts.calls;
        todayInput += acts.input_tokens;
        todayOutput += acts.output_tokens;
        todayThinking += acts.thinking_tokens;
        todayCostEur += dCost.total_cost_eur;
        todayCostUsd += dCost.total_cost_usd;
        todayApiValueEur += dCost.api_value_eur;
      }
    }

    // Événements temporels pour fenêtres 5h et 7 jours
    for (const ev of s.turn_events || []) {
      const evTime = new Date(ev.time).getTime();
      const evTokens = ev.input + ev.output + ev.thinking;

      if (evTime >= fiveHoursAgo) {
        calls5h++;
        tokens5h += evTokens;
        if (oldest5hTime === null || evTime < oldest5hTime) {
          oldest5hTime = evTime;
        }
      }

      if (evTime >= sevenDaysAgo) {
        calls7d++;
        tokens7d += evTokens;
        if (oldest7dTime === null || evTime < oldest7dTime) {
          oldest7dTime = evTime;
        }
      }
    }
  }

  // Quotas & Limites en pourcentage
  const isPro = appConfig.pricing_mode === "google_ai_pro";
  const isFree = appConfig.pricing_mode === "free_tier";

  const maxCalls5h = isPro ? 250 : (isFree ? 50 : 500);
  const maxCalls7d = isPro ? 1500 : (isFree ? 300 : 3000);

  const used5h = Math.min(100.0, parseFloat(((calls5h / maxCalls5h) * 100).toFixed(1)));
  const rem5h = Math.max(0.0, parseFloat((100.0 - used5h).toFixed(1)));

  const used7d = Math.min(100.0, parseFloat(((calls7d / maxCalls7d) * 100).toFixed(1)));
  const rem7d = Math.max(0.0, parseFloat((100.0 - used7d).toFixed(1)));

  const JOURS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const MOIS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  // Calcul décompte et date exacte de reset pour 5 heures
  let reset5hStr = "Prêt (aucun appel actif)";
  let reset5hDate = "Prêt";
  let diffSec5h = 0;
  let reset5hIso = "";
  if (oldest5hTime) {
    const resetTime = oldest5hTime + 5 * 3600 * 1000;
    diffSec5h = Math.max(0, Math.floor((resetTime - now) / 1000));
    reset5hIso = new Date(resetTime).toISOString();

    if (diffSec5h <= 0) {
      reset5hStr = "Prêt (100% disponible)";
      reset5hDate = "Prêt";
      calls5h = 0;
      tokens5h = 0;
      rem5h = 100;
      used5h = 0;
    } else {
      const h = Math.floor(diffSec5h / 3600);
      const m = Math.floor((diffSec5h % 3600) / 60);
      reset5hStr = h > 0 ? `dans ${h}h ${m}m` : `dans ${m} min`;

      const d5 = new Date(resetTime);
      const isToday = d5.toDateString() === new Date().toDateString();
      if (isToday) {
        reset5hDate = `Aujourd'hui à ${String(d5.getHours()).padStart(2, '0')}:${String(d5.getMinutes()).padStart(2, '0')}`;
      } else {
        const jNom = JOURS_FR[d5.getDay() === 0 ? 6 : d5.getDay() - 1];
        const mNom = MOIS_FR[d5.getMonth()];
        reset5hDate = `${jNom} ${d5.getDate()} ${mNom} à ${String(d5.getHours()).padStart(2, '0')}:${String(d5.getMinutes()).padStart(2, '0')}`;
      }
    }
  }

  // Calcul décompte et jour exact de remise à 0 pour 7 jours
  let reset7dStr = "Prêt (aucun appel actif)";
  let reset7dDate = "Prêt";
  let diffSec7d = 0;
  let reset7dIso = "";
  if (oldest7dTime) {
    const resetTime7d = oldest7dTime + 7 * 24 * 3600 * 1000;
    diffSec7d = Math.max(0, Math.floor((resetTime7d - now) / 1000));
    reset7dIso = new Date(resetTime7d).toISOString();

    if (diffSec7d <= 0) {
      reset7dStr = "Prêt (100% disponible)";
      reset7dDate = "Prêt";
      calls7d = 0;
      tokens7d = 0;
      rem7d = 100;
      used7d = 0;
    } else {
      const d7 = Math.floor(diffSec7d / 86400);
      const h7 = Math.floor((diffSec7d % 86400) / 3600);
      const m7 = Math.floor((diffSec7d % 3600) / 60);

      if (d7 > 0) {
        reset7dStr = `dans ${d7}j ${h7}h`;
      } else if (h7 > 0) {
        reset7dStr = `dans ${h7}h ${m7}m`;
      } else {
        reset7dStr = `dans ${m7} min`;
      }

      const d7Obj = new Date(resetTime7d);
      const j7Nom = JOURS_FR[d7Obj.getDay() === 0 ? 6 : d7Obj.getDay() - 1];
      const m7Nom = MOIS_FR[d7Obj.getMonth()];
      reset7dDate = `${j7Nom} ${d7Obj.getDate()} ${m7Nom} à ${String(d7Obj.getHours()).padStart(2, '0')}:${String(d7Obj.getMinutes()).padStart(2, '0')}`;
    }
  }

  const renderData = {
    totals: {
      input_tokens: totInput,
      output_tokens: totOutput,
      thinking_tokens: totThinking,
      total_tokens: totInput + totOutput + totThinking,
      cost_eur: totCostEur,
      cost_usd: totCostUsd,
      api_value_eur: totApiValueEur,
      api_value_usd: totApiValueUsd
    },
    today: {
      calls: todayCalls,
      total_tokens: todayInput + todayOutput + todayThinking,
      cost_eur: todayCostEur,
      cost_usd: todayCostUsd,
      api_value_eur: todayApiValueEur
    },
    quota_5h: {
      calls: calls5h,
      max_calls: maxCalls5h,
      tokens: tokens5h,
      pct_used: rem5h,
      remaining_pct: rem5h,
      used_pct: used5h,
      reset_in: reset5hStr,
      reset_date: reset5hDate,
      reset_seconds: diffSec5h,
      reset_time_iso: reset5hIso,
      is_live_rpc: false
    },
    quota_weekly: {
      calls: calls7d,
      max_calls: maxCalls7d,
      tokens: tokens7d,
      pct_used: rem7d,
      remaining_pct: rem7d,
      used_pct: used7d,
      reset_in: reset7dStr,
      reset_date: reset7dDate,
      reset_seconds: diffSec7d,
      reset_time_iso: reset7dIso,
      is_live_rpc: false
    },
    active_session: appState.activeSession,
    sessions: sessions,
    daily_trends: allDailyTrends,
    monthly_history: computeClientMonthlyHistory(allDailyTrends)
  };

  renderAll(renderData);
}

function computeClientMonthlyHistory(trends) {
  const MOIS_NOMS_FULL_FR = {
    "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril",
    "05": "Mai", "06": "Juin", "07": "Juillet", "08": "Août",
    "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre"
  };
  const mDict = {};
  for (const [dStr, dayData] of Object.entries(trends || {})) {
    const mKey = dStr.slice(0, 7);
    if (!mDict[mKey]) {
      const parts = mKey.split("-");
      const y = parts[0];
      const mNum = parts[1] || "01";
      mDict[mKey] = {
        month_key: mKey,
        month_name: `${MOIS_NOMS_FULL_FR[mNum] || mNum} ${y}`,
        calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        thinking_tokens: 0,
        total_tokens: 0,
        cost_eur: 0,
        cost_usd: 0,
        api_value_eur: 0,
        api_value_usd: 0,
        _days: new Set()
      };
    }
    const mh = mDict[mKey];
    const inT = dayData.input_tokens || 0;
    const outT = dayData.output_tokens || 0;
    const thT = dayData.thinking_tokens || 0;
    mh.calls += dayData.calls || 0;
    mh.input_tokens += inT;
    mh.output_tokens += outT;
    mh.thinking_tokens += thT;
    mh.total_tokens += inT + outT + thT;
    mh.cost_eur += dayData.cost_eur || 0;
    mh.cost_usd += dayData.cost_usd || 0;
    mh.api_value_eur += dayData.api_value_eur !== undefined ? dayData.api_value_eur : (dayData.cost_eur || 0);
    mh.api_value_usd += dayData.api_value_usd !== undefined ? dayData.api_value_usd : (dayData.cost_usd || 0);
    mh._days.add(dStr);
  }
  return Object.values(mDict)
    .sort((a, b) => b.month_key.localeCompare(a.month_key))
    .map(m => {
      m.days_count = m._days.size;
      delete m._days;
      m.avg_tokens_per_call = m.calls > 0 ? Math.round(m.total_tokens / m.calls) : 0;
      return m;
    });
}

// --- FONCTIONS DE CALCUL FINANCIER GEMINI ---
function calculateCost(inputTokens, outputTokens, thinkingTokens = 0, modelKey = "gemini-3.8-flash", mode = "google_ai_pro") {
  const spec = GEMINI_MODELS[modelKey] || GEMINI_MODELS["gemini-3.8-flash"];
  const threshold = spec.threshold_large || 128000;

  const rateIn = inputTokens > threshold ? spec.input_cost_large : spec.input_cost_standard;
  const rateOut = inputTokens > threshold ? spec.output_cost_large : spec.output_cost_standard;

  const inputCost = (inputTokens / 1000000.0) * rateIn;
  const totalOutTokens = outputTokens + thinkingTokens;
  const outputCost = (totalOutTokens / 1000000.0) * rateOut;

  const totalUsd = inputCost + outputCost;
  const totalEur = totalUsd * appConfig.usd_to_eur;

  if (mode === "google_ai_pro") {
    return {
      mode: "google_ai_pro",
      total_cost_usd: 0.0,
      total_cost_eur: 0.0,
      api_value_usd: totalUsd,
      api_value_eur: totalEur,
      included: true
    };
  }

  if (mode === "free_tier") {
    return {
      mode: "free_tier",
      total_cost_usd: 0.0,
      total_cost_eur: 0.0,
      api_value_usd: totalUsd,
      api_value_eur: totalEur,
      included: false
    };
  }

  return {
    mode: "pay_as_you_go",
    total_cost_usd: totalUsd,
    total_cost_eur: totalEur,
    api_value_usd: totalUsd,
    api_value_eur: totalEur,
    included: false
  };
}

function formatCurrency(val, currency = "EUR") {
  if (currency === "EUR") {
    if (val === 0) return "0,0000 €";
    if (val < 0.01) return `${val.toFixed(4).replace(".", ",")} €`;
    return `${val.toFixed(3).replace(".", ",")} €`;
  } else {
    if (val === 0) return "$0.0000";
    if (val < 0.01) return `$${val.toFixed(4)}`;
    return `$${val.toFixed(3)}`;
  }
}

function formatNumber(num) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(num || 0));
}

function formatDateTime(d) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
  } catch (e) {
    return "";
  }
}

function formatResetDateFromIso(isoString, fallbackStr) {
  if (!isoString) return fallbackStr || "Prêt";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return fallbackStr || "Prêt";
  const now = new Date();
  if (d.getTime() <= now.getTime()) return "Prêt";

  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const timeStr = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  if (isToday) {
    return `Aujourd'hui à ${timeStr}`;
  } else if (isTomorrow) {
    return `Demain à ${timeStr}`;
  } else {
    const dayName = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
    const capDayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    return `${capDayName} à ${timeStr}`;
  }
}

// --- AFFICHAGE & RENDU DU DASHBOARD ---
function renderAll(data) {
  appState.latestData = data;
  if (data.monthly_history) {
    appState.monthlyHistory = data.monthly_history;
  }
  renderProBanner(data.totals);
  renderKPIs(data);
  renderActiveSession(data.active_session);
  renderSessionsTable(data.sessions || []);
  renderCharts(data.daily_trends || {}, data.totals);

  const recapModal = document.getElementById("monthlyRecapModal");
  if (recapModal && (recapModal.classList.contains("active") || recapModal.style.display === "flex")) {
    renderMonthlyRecapModal(data);
  }
}

function renderProBanner(totals) {
  const banner = document.getElementById("proSubscriptionBanner");
  const proBadge = document.getElementById("proBadge");
  const isPro = appConfig.pricing_mode === "google_ai_pro";

  if (proBadge) proBadge.style.display = isPro ? "inline-flex" : "none";
  if (banner) {
    banner.style.display = isPro ? "flex" : "none";
    if (isPro) {
      const apiVal = appConfig.currency === "EUR" ? totals.api_value_eur : totals.api_value_usd;
      const apiValFormatted = formatCurrency(apiVal, appConfig.currency);

      const proApiValElem = document.getElementById("proApiValueBanner");
      if (proApiValElem) proApiValElem.textContent = apiValFormatted;

      const monthlyCost = appConfig.pro_monthly_cost || 21.99;
      const roi = Math.round((totals.api_value_eur / monthlyCost) * 100);
      const roiElem = document.getElementById("proRoiBanner");
      if (roiElem) {
        roiElem.textContent = `${roi}% (Rentabilisé à ${(totals.api_value_eur / monthlyCost).toFixed(1)}x)`;
      }
    }
  }
}

function renderKPIs(data) {
  const totals = data.totals || {};
  const today = data.today || {};
  const q5h = data.quota_5h || {};
  const q7d = data.quota_weekly || {};

  // KPI 1 : Facturation / Coût
  const kpiTotalCost = document.getElementById("kpiTotalCost");
  const kpiCostSubtitle = document.getElementById("kpiCostSubtitle");
  const kpiTodayCost = document.getElementById("kpiTodayCost");

  if (appConfig.pricing_mode === "google_ai_pro") {
    if (kpiTotalCost) kpiTotalCost.textContent = "Inclus (0,00 €)";
    const apiVal = appConfig.currency === "EUR" ? totals.api_value_eur : totals.api_value_usd;
    if (kpiCostSubtitle) kpiCostSubtitle.textContent = `Valeur API : ${formatCurrency(apiVal, appConfig.currency)}`;
  } else {
    const billed = appConfig.currency === "EUR" ? totals.cost_eur : totals.cost_usd;
    if (kpiTotalCost) kpiTotalCost.textContent = formatCurrency(billed, appConfig.currency);
    if (kpiCostSubtitle) kpiCostSubtitle.textContent = appConfig.pricing_mode === "free_tier" ? "Free Tier ($0)" : "Facturation API";
  }

  const todayVal = appConfig.currency === "EUR" ? (today.cost_eur || today.api_value_eur) : (today.cost_usd || today.api_value_usd);
  if (kpiTodayCost) kpiTodayCost.textContent = `${formatCurrency(todayVal, appConfig.currency)} auj.`;

  // KPI 2 : Tokens
  const kpiTotalTokens = document.getElementById("kpiTotalTokens");
  const kpiInTokens = document.getElementById("kpiInTokens");
  const kpiOutTokens = document.getElementById("kpiOutTokens");
  const kpiThinkingTokens = document.getElementById("kpiThinkingTokens");

  if (kpiTotalTokens) kpiTotalTokens.textContent = formatNumber(totals.total_tokens);
  if (kpiInTokens) kpiInTokens.textContent = `${formatNumber(totals.input_tokens)} entrée`;
  if (kpiOutTokens) kpiOutTokens.textContent = `${formatNumber(totals.output_tokens)} sortie`;
  if (kpiThinkingTokens) kpiThinkingTokens.textContent = `${formatNumber(totals.thinking_tokens)} thinking`;

  // KPI 3 : Limite 5 heures (%)
  const kpi5hVal = document.getElementById("kpi5hVal");
  const kpi5hBar = document.getElementById("kpi5hBar");
  const kpi5hReset = document.getElementById("kpi5hReset");
  const kpi5hExactDate = document.getElementById("kpi5hExactDate");
  const kpi5hCalls = document.getElementById("kpi5hCallsText");
  const kpi5hTokens = document.getElementById("kpi5hTokens");

  const rem5 = q5h.remaining_pct !== undefined ? q5h.remaining_pct : (100 - (q5h.pct_used || 0));
  const used5 = q5h.used_pct !== undefined ? q5h.used_pct : (q5h.pct_used || 0);

  // Enregistrement des cibles de réinitialisation pour le compte à rebours dynamique
  let resetDate5hStr = q5h.reset_date || "Prêt";
  if (rem5 < 100.0 && q5h.reset_time_iso) {
    const target5 = new Date(q5h.reset_time_iso).getTime();
    if (!isNaN(target5) && target5 > Date.now()) {
      appState.resetTime5h = target5;
      resetDate5hStr = formatResetDateFromIso(q5h.reset_time_iso, q5h.reset_date);
      const diff5 = Math.floor((target5 - Date.now()) / 1000);
      const h5 = Math.floor(diff5 / 3600);
      const m5 = Math.floor((diff5 % 3600) / 60);
      const s5 = diff5 % 60;
      q5h.reset_in = h5 > 0 ? `dans ${h5}h ${m5}m ${s5}s` : `dans ${m5}m ${s5}s`;
    } else {
      appState.resetTime5h = null;
      resetDate5hStr = "Prêt";
      q5h.reset_in = "Prêt (100% disponible)";
      q5h.remaining_pct = 100;
      q5h.used_pct = 0;
    }
  } else if (rem5 < 100.0 && q5h.reset_seconds !== undefined && q5h.reset_seconds > 0) {
    appState.resetTime5h = Date.now() + (q5h.reset_seconds * 1000);
  } else {
    appState.resetTime5h = null;
    resetDate5hStr = "Prêt";
    q5h.reset_in = "Prêt (100% disponible)";
  }

  // KPI 4 : Limite sur la semaine (%)
  const kpiWeeklyVal = document.getElementById("kpiWeeklyVal");
  const kpiWeeklyBar = document.getElementById("kpiWeeklyBar");
  const kpiWeeklyReset = document.getElementById("kpiWeeklyReset");
  const kpiWeeklyExactDate = document.getElementById("kpiWeeklyExactDate");
  const kpiWeeklyCalls = document.getElementById("kpiWeeklyCallsText");
  const kpiWeeklyTokens = document.getElementById("kpiWeeklyTokens");
  const kpiWeeklyStatus = document.getElementById("kpiWeeklyStatus");

  const rem7 = q7d.remaining_pct !== undefined ? q7d.remaining_pct : (100 - (q7d.pct_used || 0));
  const used7 = q7d.used_pct !== undefined ? q7d.used_pct : (q7d.pct_used || 0);

  let resetDate7dStr = q7d.reset_date || "Prêt";
  if (rem7 < 100.0 && q7d.reset_time_iso) {
    const target7 = new Date(q7d.reset_time_iso).getTime();
    if (!isNaN(target7) && target7 > Date.now()) {
      appState.resetTime7d = target7;
      resetDate7dStr = formatResetDateFromIso(q7d.reset_time_iso, q7d.reset_date);
      const diff7 = Math.floor((target7 - Date.now()) / 1000);
      const d7 = Math.floor(diff7 / 86400);
      const h7 = Math.floor((diff7 % 86400) / 3600);
      const m7 = Math.floor((diff7 % 3600) / 60);
      const s7 = diff7 % 60;
      if (d7 > 0) {
        q7d.reset_in = `dans ${d7}j ${h7}h ${m7}m ${s7}s`;
      } else if (h7 > 0) {
        q7d.reset_in = `dans ${h7}h ${m7}m ${s7}s`;
      } else {
        q7d.reset_in = `dans ${m7}m ${s7}s`;
      }
    } else {
      appState.resetTime7d = null;
      resetDate7dStr = "Prêt";
      q7d.reset_in = "Prêt (100% disponible)";
      q7d.remaining_pct = 100;
      q7d.used_pct = 0;
    }
  } else if (rem7 < 100.0 && q7d.reset_seconds !== undefined && q7d.reset_seconds > 0) {
    appState.resetTime7d = Date.now() + (q7d.reset_seconds * 1000);
  } else {
    appState.resetTime7d = null;
    resetDate7dStr = "Prêt";
    q7d.reset_in = "Prêt (100% disponible)";
  }

  if (kpi5hVal) {
    kpi5hVal.innerHTML = `${rem5}% <span style="font-size: 0.5em; font-weight: normal; opacity: 0.85;">restant</span>`;
    kpi5hVal.style.color = rem5 < 20 ? "#f43f5e" : (rem5 < 50 ? "#f59e0b" : "#38bdf8");
  }
  if (kpi5hBar) {
    kpi5hBar.style.width = `${Math.min(100, Math.max(2, rem5))}%`;
    kpi5hBar.className = `progress-bar-fill ${rem5 < 20 ? "bg-rose" : (rem5 < 50 ? "bg-amber" : "bg-cyan")}`;
  }
  if (kpi5hReset) kpi5hReset.textContent = `⏱️ ${q5h.reset_in || "Prêt"}`;
  if (kpi5hExactDate) kpi5hExactDate.textContent = `📅 Reset : ${resetDate5hStr}`;
  if (kpi5hCalls) {
    if (q5h.is_live_rpc) {
      kpi5hCalls.textContent = `${used5}% consommé (${formatNumber(q5h.calls || 0)} appels)`;
    } else {
      kpi5hCalls.textContent = `${used5}% consommé • ${formatNumber(q5h.calls || 0)} / ${formatNumber(q5h.max_calls || 250)} appels`;
    }
  }
  if (kpi5hTokens) kpi5hTokens.textContent = `${formatNumber(q5h.tokens || 0)} tokens`;

  if (kpiWeeklyVal) {
    kpiWeeklyVal.innerHTML = `${rem7}% <span style="font-size: 0.5em; font-weight: normal; opacity: 0.85;">restant</span>`;
    kpiWeeklyVal.style.color = rem7 < 20 ? "#f43f5e" : (rem7 < 50 ? "#f59e0b" : "#34d399");
  }
  if (kpiWeeklyBar) {
    kpiWeeklyBar.style.width = `${Math.min(100, Math.max(2, rem7))}%`;
    kpiWeeklyBar.className = `progress-bar-fill ${rem7 < 20 ? "bg-rose" : (rem7 < 50 ? "bg-amber" : "bg-emerald")}`;
  }
  if (kpiWeeklyReset) kpiWeeklyReset.textContent = `⏱️ ${q7d.reset_in || "Prêt"}`;
  if (kpiWeeklyExactDate) kpiWeeklyExactDate.textContent = `📅 Remise à 0 : ${resetDate7dStr}`;
  if (kpiWeeklyCalls) {
    if (q7d.is_live_rpc) {
      kpiWeeklyCalls.textContent = `${used7}% consommé (${formatNumber(q7d.calls || 0)} appels)`;
    } else {
      kpiWeeklyCalls.textContent = `${used7}% consommé • ${formatNumber(q7d.calls || 0)} / ${formatNumber(q7d.max_calls || 1500)} appels`;
    }
  }
  if (kpiWeeklyTokens) kpiWeeklyTokens.textContent = `${formatNumber(q7d.tokens || 0)} tokens sur 7j`;
  if (kpiWeeklyStatus) {
    kpiWeeklyStatus.textContent = rem7 < 20 ? "Quota critique" : (rem7 < 50 ? "Utilisation modérée" : "Quota optimal");
    kpiWeeklyStatus.style.color = rem7 < 20 ? "#f43f5e" : (rem7 < 50 ? "#f59e0b" : "#34d399");
  }
}

function renderActiveSession(session) {
  const activeTitle = document.getElementById("activeTitle");
  const activeWorkspace = document.getElementById("activeWorkspace");
  const activeTokens = document.getElementById("activeSessionTokens");
  const activeCost = document.getElementById("activeCost");

  if (!session) {
    if (activeTitle) activeTitle.textContent = "Aucune session active détectée";
    if (activeWorkspace) activeWorkspace.textContent = "Ouvrez Antigravity et écrivez du code pour voir la session s'animer ici.";
    if (activeTokens) activeTokens.textContent = "0";
    if (activeCost) activeCost.textContent = "0,0000 €";
    return;
  }

  if (activeTitle) activeTitle.textContent = session.title || "Session en cours";
  if (activeWorkspace) activeWorkspace.textContent = session.workspace_path || session.workspace_name || "Workspace local";
  if (activeTokens) activeTokens.textContent = formatNumber(session.total_tokens || 0);

  if (activeCost) {
    const cost = session.costs || calculateCost(session.api_input_tokens, session.api_output_tokens, session.thinking_tokens, session.model_used, appConfig.pricing_mode);
    const val = appConfig.currency === "EUR" ? (cost.total_cost_eur || cost.api_value_eur) : (cost.total_cost_usd || cost.api_value_usd);
    activeCost.textContent = formatCurrency(val, appConfig.currency);
  }
}

function renderSessionsTable(sessions) {
  const tbody = document.getElementById("sessionsTableBody");
  if (!tbody) return;

  if (sessions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
          Aucune session trouvée. Connectez votre dossier <code>~/.gemini/antigravity</code>.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = sessions.map((s) => {
    const cost = s.costs || calculateCost(s.api_input_tokens, s.api_output_tokens, s.thinking_tokens, s.model_used, appConfig.pricing_mode);
    const costVal = appConfig.currency === "EUR" ? (cost.total_cost_eur || cost.api_value_eur) : (cost.total_cost_usd || cost.api_value_usd);

    return `
      <tr class="session-row">
        <td class="cell-title" data-label="Titre / Projet">
          <div class="session-title-text">${escapeHtml(s.title || "Sans titre")}</div>
          <div class="session-model-text">
            <span class="badge-tag session-model-tag">⚡ ${escapeHtml(s.model_used || "gemini-3.8-flash")}</span>
          </div>
        </td>
        <td class="cell-workspace" data-label="Workspace">
          <span class="badge-tag session-workspace-badge">📁 ${escapeHtml(s.workspace_name || "Sans workspace")}</span>
        </td>
        <td class="cell-date" data-label="Dernière Action">
          <span class="session-date-val">${escapeHtml(s.last_modified || "-")}</span>
        </td>
        <td class="cell-turns" data-label="Tours API">
          <span class="session-val-turns">${formatNumber(s.turns || 0)} tours</span>
        </td>
        <td class="cell-input" data-label="Tokens Entrée">
          <span class="session-val-input" style="color: var(--accent-cyan); font-weight: 600;">${formatNumber(s.api_input_tokens || 0)}</span>
        </td>
        <td class="cell-output" data-label="Tokens Sortie">
          <span class="session-val-output" style="color: var(--accent-purple); font-weight: 600;">${formatNumber(s.api_output_tokens || 0)}</span>
        </td>
        <td class="cell-cost" data-label="Coût Total">
          <span class="session-val-cost" style="font-weight: 800; color: #34d399;">${formatCurrency(costVal, appConfig.currency)}</span>
        </td>
      </tr>
    `;
  }).join("");
}

function filterSessionsTable(query) {
  const q = (query || "").toLowerCase();
  const filtered = appState.sessions.filter((s) => {
    return (s.title && s.title.toLowerCase().includes(q)) ||
           (s.workspace_name && s.workspace_name.toLowerCase().includes(q)) ||
           (s.workspace_path && s.workspace_path.toLowerCase().includes(q));
  });
  renderSessionsTable(filtered);
}

// --- GRAPHIQUES INTERACTIFS (CHART.JS) ---
function renderCharts(dailyTrends, totals) {
  if (typeof Chart === "undefined") return;

  const dates = Object.keys(dailyTrends).sort();
  const inputData = dates.map((d) => dailyTrends[d].input_tokens || 0);
  const outputData = dates.map((d) => (dailyTrends[d].output_tokens || 0) + (dailyTrends[d].thinking_tokens || 0));

  // Graphique Quotidien
  const ctxDaily = document.getElementById("chartDaily")?.getContext("2d");
  if (ctxDaily) {
    if (chartDaily) chartDaily.destroy();
    chartDaily = new Chart(ctxDaily, {
      type: "bar",
      data: {
        labels: dates.length > 0 ? dates : ["Aujourd'hui"],
        datasets: [
          {
            label: "Tokens Entrée",
            data: inputData.length > 0 ? inputData : [totals.input_tokens || 0],
            backgroundColor: "rgba(6, 182, 212, 0.75)",
            borderColor: "#06b6d4",
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: "Tokens Sortie & Thinking",
            data: outputData.length > 0 ? outputData : [(totals.output_tokens || 0) + (totals.thinking_tokens || 0)],
            backgroundColor: "rgba(139, 92, 246, 0.75)",
            borderColor: "#8b5cf6",
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#9ca3af", font: { size: 11 } } }
        },
        scales: {
          x: { grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { color: "#6b7280" } },
          y: { grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { color: "#6b7280" } }
        }
      }
    });
  }

  // Graphique Répartition (Doughnut)
  const ctxDist = document.getElementById("chartDistribution")?.getContext("2d");
  if (ctxDist) {
    if (chartDistribution) chartDistribution.destroy();
    chartDistribution = new Chart(ctxDist, {
      type: "doughnut",
      data: {
        labels: ["Tokens Entrée", "Tokens Sortie", "Thinking (CoT)"],
        datasets: [{
          data: [
            totals.input_tokens || 1,
            totals.output_tokens || 1,
            totals.thinking_tokens || 0
          ],
          backgroundColor: ["#06b6d4", "#8b5cf6", "#f59e0b"],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { color: "#9ca3af", font: { size: 11 } } }
        },
        cutout: "68%"
      }
    });
  }
}

// --- SIMULATEUR DE TOKENS MULTIMODAL (TEXTE, IMAGES, PDF) ---
function initDropzoneEvents() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadedFiles(e.target.files);
      fileInput.value = "";
    }
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer && e.dataTransfer.files) {
      handleUploadedFiles(e.dataTransfer.files);
    }
  });
}

async function handleUploadedFiles(fileList) {
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const fileInfo = {
      id: Math.random().toString(36).substring(7),
      name: file.name,
      size: file.size,
      type: file.type,
      file: file,
      tokens: 0,
      details: ""
    };

    if (file.type.startsWith("image/")) {
      const imgStats = await analyzeImageTokens(file);
      fileInfo.tokens = imgStats.tokens;
      fileInfo.details = imgStats.details;
      fileInfo.previewUrl = imgStats.previewUrl;
    } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      const pdfStats = estimatePdfTokens(file);
      fileInfo.tokens = pdfStats.tokens;
      fileInfo.details = pdfStats.details;
    } else {
      // Code ou texte
      const text = await file.text();
      fileInfo.tokens = estimateTokensFast(text);
      fileInfo.details = `${fileInfo.tokens} tokens de texte`;
    }

    appState.uploadedFiles.push(fileInfo);
  }

  renderUploadedFilesList();
  runMultimodalCalculator();
}

function analyzeImageTokens(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        let tokens = 258;
        let details = "";

        if (w <= 384 && h <= 384) {
          tokens = 258;
          details = `${w}×${h} px (1 tuile = 258 tok)`;
        } else {
          const tilesX = Math.ceil(w / 768.0);
          const tilesY = Math.ceil(h / 768.0);
          const totalTiles = Math.max(1, tilesX * tilesY);
          tokens = totalTiles * 258;
          details = `${w}×${h} px (${totalTiles} tuiles = ${tokens} tok)`;
        }

        resolve({ tokens, details, previewUrl: e.target.result });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function estimatePdfTokens(file) {
  const approxPages = Math.max(1, Math.round(file.size / 45000));
  const tokens = approxPages * 500;
  return {
    tokens: tokens,
    details: `~${approxPages} page(s) (~${tokens} tok)`
  };
}

function renderUploadedFilesList() {
  const container = document.getElementById("uploadedFilesList");
  if (!container) return;

  if (appState.uploadedFiles.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = appState.uploadedFiles.map((f, idx) => `
    <div class="file-item">
      <div style="display: flex; align-items: center; gap: 8px;">
        ${f.previewUrl ? `<img src="${f.previewUrl}" style="width: 24px; height: 24px; border-radius: 4px; object-fit: cover;">` : "📄"}
        <div>
          <div style="font-weight: 600; font-size: 0.82rem; color: #f9fafb;">${escapeHtml(f.name)}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(f.details)}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="badge-tag" style="color: var(--accent-cyan);">${formatNumber(f.tokens)} tok</span>
        <button onclick="removeUploadedFile(${idx})" style="background: none; border: none; color: #fda4af; cursor: pointer; font-size: 1rem;">&times;</button>
      </div>
    </div>
  `).join("");
}

window.removeUploadedFile = function(index) {
  appState.uploadedFiles.splice(index, 1);
  renderUploadedFilesList();
  runMultimodalCalculator();
};

function clearCalculator() {
  const calcInput = document.getElementById("calcInput");
  if (calcInput) calcInput.value = "";
  appState.uploadedFiles = [];
  renderUploadedFilesList();
  runMultimodalCalculator();
}

function setSimulatorIntensity(level) {
  if (!level) return;
  const spec = GEMINI_MODELS[appConfig.default_model];
  const allowed = spec?.allowed_intensities || ["low", "medium", "high"];

  // Si le niveau demandé n'est pas autorisé pour ce modèle (ex: Medium pour Gemini 3.1 Pro)
  if (!allowed.includes(level)) {
    level = spec?.default_intensity || allowed[0] || "low";
  }

  appConfig.sim_intensity = level;
  localStorage.setItem("tracker_sim_intensity", level);
  updateIntensityButtonsUI(level, appConfig.default_model);
  runMultimodalCalculator();
}

function updateIntensityButtonsUI(level, modelKey) {
  const currentModel = modelKey || appConfig.default_model || "gemini-3.8-flash";
  const spec = GEMINI_MODELS[currentModel];
  const allowed = spec?.allowed_intensities || ["low", "medium", "high"];

  let effectiveLevel = level || appConfig.sim_intensity || "high";
  if (!allowed.includes(effectiveLevel)) {
    effectiveLevel = spec?.default_intensity || allowed[0] || "low";
    appConfig.sim_intensity = effectiveLevel;
    localStorage.setItem("tracker_sim_intensity", effectiveLevel);
  }

  const intensityBtns = document.querySelectorAll("#simIntensityGroup .intensity-btn");
  intensityBtns.forEach(btn => {
    const btnLevel = btn.dataset.intensity;
    if (allowed.includes(btnLevel)) {
      btn.style.display = "inline-flex";
      btn.disabled = false;
    } else {
      btn.style.display = "none";
      btn.disabled = true;
    }

    if (btnLevel === effectiveLevel) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

window.selectModelFromComparison = function(key) {
  if (!key || !GEMINI_MODELS[key]) return;
  appConfig.default_model = key;
  localStorage.setItem("tracker_default_model", key);
  const simModelSelect = document.getElementById("simModelSelect");
  if (simModelSelect) simModelSelect.value = key;

  const spec = GEMINI_MODELS[key];
  const allowed = spec?.allowed_intensities || ["low", "medium", "high"];
  if (!allowed.includes(appConfig.sim_intensity)) {
    setSimulatorIntensity(spec?.default_intensity || allowed[0]);
  } else {
    updateIntensityButtonsUI(appConfig.sim_intensity, key);
    runMultimodalCalculator();
  }
};

function runMultimodalCalculator() {
  const text = document.getElementById("calcInput")?.value || "";
  const textTokens = estimateTokensFast(text);

  let filesTokens = 0;
  for (const f of appState.uploadedFiles) {
    filesTokens += f.tokens;
  }

  const inputTokens = textTokens + filesTokens;
  const spec = GEMINI_MODELS[appConfig.default_model] || GEMINI_MODELS["gemini-3.8-flash"];
  const allowed = spec.allowed_intensities || ["low", "medium", "high"];

  let intensity = appConfig.sim_intensity || "high";
  if (!allowed.includes(intensity)) {
    intensity = spec.default_intensity || allowed[0] || "low";
    appConfig.sim_intensity = intensity;
    localStorage.setItem("tracker_sim_intensity", intensity);
    updateIntensityButtonsUI(intensity, appConfig.default_model);
  }

  // Calcul des tokens de thinking selon l'intensité sélectionnée
  let thinkingTokens = 0;
  let estimatedOutputTokens = 0;

  if (inputTokens > 0) {
    if (intensity === "low") {
      thinkingTokens = 1024;
    } else if (intensity === "medium") {
      thinkingTokens = 4096;
    } else if (intensity === "high") {
      thinkingTokens = 16384;
    }
    estimatedOutputTokens = 500;
  }

  const totalTokens = inputTokens + thinkingTokens + estimatedOutputTokens;

  const countElem = document.getElementById("calcTokensCount");
  if (countElem) countElem.textContent = `${formatNumber(totalTokens)} tokens`;

  const breakdownElem = document.getElementById("calcBreakdownPill");
  if (breakdownElem) {
    if (inputTokens === 0) {
      breakdownElem.textContent = `Prompt: 0 tok • Fichiers: 0 tok • Thinking: 0 tok`;
    } else {
      breakdownElem.textContent = `Prompt: ${formatNumber(textTokens)} tok • Fichiers: ${formatNumber(filesTokens)} tok • Thinking [${intensity.toUpperCase()}]: ${formatNumber(thinkingTokens)} tok`;
    }
  }

  const threshold = spec.threshold_large || 128000;
  const rateIn = inputTokens > threshold ? spec.input_cost_large : spec.input_cost_standard;
  const rateOut = (thinkingTokens + estimatedOutputTokens) > threshold ? spec.output_cost_large : spec.output_cost_standard;

  const inputCostUsd = (inputTokens / 1000000.0) * rateIn;
  const outputCostUsd = ((thinkingTokens + estimatedOutputTokens) / 1000000.0) * rateOut;
  const totalCostUsd = inputCostUsd + outputCostUsd;

  const inputCostEur = inputCostUsd * appConfig.usd_to_eur;
  const outputCostEur = outputCostUsd * appConfig.usd_to_eur;
  const totalCostEur = totalCostUsd * appConfig.usd_to_eur;

  const estElem = document.getElementById("calcCostEstimate");
  if (estElem) {
    estElem.textContent = formatCurrency(totalCostEur, "EUR");
  }

  const detailElem = document.getElementById("calcCostDetail");
  if (detailElem) {
    detailElem.textContent = `Entrée : ${formatCurrency(inputCostEur, "EUR")} • Thinking & Réponse : ${formatCurrency(outputCostEur, "EUR")}`;
  }

  // Grille de comparaison des modèles
  renderModelComparison(inputTokens, thinkingTokens, estimatedOutputTokens);
}

function renderModelComparison(inputTokens, thinkingTokens, estimatedOutputTokens) {
  const grid = document.getElementById("modelComparisonGrid");
  if (!grid) return;

  if (inputTokens === 0) {
    grid.innerHTML = `
      <div style="color: var(--text-muted); font-size: 0.78rem; padding: 6px 0;">
        Ajoutez du texte, une image ou un PDF pour voir le coût comparé.
      </div>
    `;
    return;
  }

  const currentIntensity = appConfig.sim_intensity || "high";

  const models = Object.entries(GEMINI_MODELS);
  grid.innerHTML = models.map(([key, spec]) => {
    const threshold = spec.threshold_large || 128000;
    const allowed = spec.allowed_intensities || ["low", "medium", "high"];

    let modelIntensity = currentIntensity;
    let fallbackTag = "";
    if (!allowed.includes(modelIntensity)) {
      modelIntensity = spec.default_intensity || allowed[0] || "low";
      fallbackTag = ` <span style="font-size:0.7rem; color: #38bdf8; font-weight:600;">(${modelIntensity.toUpperCase()})</span>`;
    }

    let modelThinkingTokens = 0;
    if (inputTokens > 0) {
      if (modelIntensity === "low") modelThinkingTokens = 1024;
      else if (modelIntensity === "medium") modelThinkingTokens = 4096;
      else if (modelIntensity === "high") modelThinkingTokens = 16384;
    }

    const rateIn = inputTokens > threshold ? spec.input_cost_large : spec.input_cost_standard;
    const rateOut = (modelThinkingTokens + estimatedOutputTokens) > threshold ? spec.output_cost_large : spec.output_cost_standard;

    const costUsd = (inputTokens / 1000000.0) * rateIn + ((modelThinkingTokens + estimatedOutputTokens) / 1000000.0) * rateOut;
    const costEur = costUsd * appConfig.usd_to_eur;

    const isSelected = key === appConfig.default_model;

    return `
      <div class="model-comp-item ${isSelected ? "selected-model" : ""}" onclick="selectModelFromComparison('${key}')" title="Cliquer pour choisir ${spec.name}">
        <span class="model-comp-name">
          ${isSelected ? "👉 " : ""}${spec.name}${fallbackTag}
        </span>
        <span class="model-comp-cost">${formatCurrency(costEur, "EUR")}</span>
      </div>
    `;
  }).join("");
}

// Appel direct à l'API officielle Google AI Studio (countTokens)
async function countTokensViaGeminiApi() {
  if (!appConfig.api_key) {
    openApiKeyModal();
    showToast("🔑 Veuillez d'abord renseigner votre clé API Gemini.");
    return;
  }

  const text = document.getElementById("calcInput")?.value || "";
  showToast("⚡ Comptage officiel en cours via Google AI Studio...");

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:countTokens?key=${appConfig.api_key}`;
    const payload = {
      contents: [{
        parts: [{ text: text || "Hello Gemini" }]
      }]
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Erreur API Google : ${res.status}`);
    }

    const data = await res.json();
    const count = data.totalTokens || 0;
    showToast(`✅ Comptage officiel Google Gemini : ${formatNumber(count)} tokens !`);
    document.getElementById("calcTokensCount").textContent = `${formatNumber(count)} tokens (Officiel)`;
  } catch (err) {
    console.error("Erreur API countTokens :", err);
    showToast(`❌ Erreur API : ${err.message}`);
  }
}

// --- GESTION DE LA CLÉ API & MODAL ---
function openApiKeyModal() {
  const modal = document.getElementById("apiKeyModal");
  const input = document.getElementById("apiKeyInput");
  const msg = document.getElementById("keyStatusMsg");

  if (input) input.value = appConfig.api_key || "";
  if (msg) msg.style.display = "none";
  if (modal) modal.style.display = "flex";
}

function closeApiKeyModal() {
  const modal = document.getElementById("apiKeyModal");
  if (modal) modal.style.display = "none";
}

async function testAndSaveApiKey() {
  const input = document.getElementById("apiKeyInput");
  const budgetInput = document.getElementById("budgetLimitInput");
  const proCostInput = document.getElementById("proMonthlyCostInput");
  const msg = document.getElementById("keyStatusMsg");

  const key = (input?.value || "").trim();
  const budget = parseFloat(budgetInput?.value || "5.0");
  const proCost = parseFloat(proCostInput?.value || "21.99");

  if (msg) {
    msg.className = "key-status-msg";
    msg.style.display = "block";
    msg.textContent = "Test de connexion à l'API Google en cours...";
  }

  try {
    if (key) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Clé invalide (Code ${res.status})`);
      }
    }

    appConfig.api_key = key;
    appConfig.daily_budget_limit = budget;
    appConfig.pro_monthly_cost = proCost;

    localStorage.setItem("gemini_api_key", key);
    localStorage.setItem("tracker_budget_limit", budget.toString());
    localStorage.setItem("tracker_pro_cost", proCost.toString());

    const proMonthlyPrice = document.getElementById("proMonthlyPrice");
    if (proMonthlyPrice) proMonthlyPrice.textContent = `${proCost.toFixed(2).replace(".", ",")} €`;

    if (msg) {
      msg.className = "key-status-msg success";
      msg.textContent = key ? "✅ Clé API validée et enregistrée avec succès !" : "✅ Paramètres enregistrés sans clé API.";
    }

    updateApiKeyButtonStatus();
    showToast("Paramètres sauvegardés");
    setTimeout(closeApiKeyModal, 900);
    recomputeAll();
  } catch (err) {
    if (msg) {
      msg.className = "key-status-msg error";
      msg.textContent = `❌ ${err.message}`;
    }
  }
}

// --- GESTION DU MENU PRINCIPAL UNIFIÉ (3 POINTS ⋮) ---
function openMainMenu() {
  const btn = document.getElementById("mainMenuBtn");
  const menu = document.getElementById("mainDropdownMenu");
  if (!menu) return;
  menu.classList.add("active");
  menu.setAttribute("aria-hidden", "false");
  if (btn) {
    btn.classList.add("active");
    btn.setAttribute("aria-expanded", "true");
  }
}

function closeMainMenu() {
  const btn = document.getElementById("mainMenuBtn");
  const menu = document.getElementById("mainDropdownMenu");
  if (!menu) return;
  menu.classList.remove("active");
  menu.setAttribute("aria-hidden", "true");
  if (btn) {
    btn.classList.remove("active");
    btn.setAttribute("aria-expanded", "false");
  }
}

function updateApiKeyButtonStatus() {
  const btn = document.getElementById("apiKeyBtn");
  const menuDesc = document.getElementById("apiKeyMenuDesc");
  const menuBadge = document.getElementById("apiKeyMenuBadge");
  if (!btn) return;

  if (appConfig.api_key) {
    const masked = `${appConfig.api_key.substring(0, 6)}...${appConfig.api_key.substring(appConfig.api_key.length - 4)}`;
    btn.classList.remove("key-warning");
    btn.classList.add("key-valid");
    if (menuDesc) menuDesc.textContent = masked;
    if (menuBadge) {
      menuBadge.className = "menu-pill-badge valid";
      menuBadge.textContent = "Active";
    }
  } else {
    btn.classList.remove("key-valid");
    btn.classList.add("key-warning");
    if (menuDesc) menuDesc.textContent = "Configurer pour les quotas live";
    if (menuBadge) {
      menuBadge.className = "menu-pill-badge warning";
      menuBadge.textContent = "À configurer";
    }
  }
}

// --- GESTION DU RÉCAPITULATIF MENSUEL & QUOTAS DISPONIBLES ---
function openMonthlyRecapModal() {
  const modal = document.getElementById("monthlyRecapModal");
  if (!modal) return;
  renderMonthlyRecapModal(appState.latestData);
  modal.style.display = "flex";
  modal.classList.add("active");
}

function closeMonthlyRecapModal() {
  const modal = document.getElementById("monthlyRecapModal");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("active");
  }
}

function renderMonthlyRecapModal(data) {
  const d = data || appState.latestData || {};
  const q5 = d.quota_5h || {};
  const qw = d.quota_weekly || {};
  const history = d.monthly_history || appState.monthlyHistory || [];

  // 1. Quotas disponibles en temps réel
  const recap5hPct = document.getElementById("recap5hPct");
  const recap5hRemain = document.getElementById("recap5hRemain");
  const recap5hReset = document.getElementById("recap5hReset");

  const rem5 = q5.remaining_pct !== undefined ? q5.remaining_pct : (100 - (q5.pct_used || 0));
  const maxCalls5h = q5.max_calls || (appConfig.pricing_mode === "google_ai_pro" ? 250 : 500);
  const estCallsLeft5h = Math.max(0, Math.round((rem5 / 100) * maxCalls5h));

  if (recap5hPct) {
    recap5hPct.textContent = `${rem5}% restant`;
    recap5hPct.style.color = rem5 < 20 ? "#f43f5e" : (rem5 < 50 ? "#f59e0b" : "#38bdf8");
  }
  if (recap5hRemain) recap5hRemain.textContent = `${formatNumber(estCallsLeft5h)} appels disponibles`;
  if (recap5hReset) recap5hReset.textContent = `⏱️ Reset : ${q5.reset_date || "Prêt"} (${q5.reset_in || "immédiat"})`;

  const recapWeeklyPct = document.getElementById("recapWeeklyPct");
  const recapWeeklyRemain = document.getElementById("recapWeeklyRemain");
  const recapWeeklyReset = document.getElementById("recapWeeklyReset");

  const rem7 = qw.remaining_pct !== undefined ? qw.remaining_pct : (100 - (qw.pct_used || 0));
  const maxCalls7d = qw.max_calls || (appConfig.pricing_mode === "google_ai_pro" ? 1500 : 3000);
  const estCallsLeft7d = Math.max(0, Math.round((rem7 / 100) * maxCalls7d));

  if (recapWeeklyPct) {
    recapWeeklyPct.textContent = `${rem7}% restant`;
    recapWeeklyPct.style.color = rem7 < 20 ? "#f43f5e" : (rem7 < 50 ? "#f59e0b" : "#34d399");
  }
  if (recapWeeklyRemain) recapWeeklyRemain.textContent = `${formatNumber(estCallsLeft7d)} appels disponibles`;
  if (recapWeeklyReset) recapWeeklyReset.textContent = `📅 Reset : ${qw.reset_date || "Prêt"} (${qw.reset_in || "immédiat"})`;

  // 2. Tableau historique mois par mois
  const tbody = document.getElementById("monthlyRecapTableBody");
  if (tbody) {
    if (!history || history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">Aucune donnée mensuelle enregistrée.</td></tr>`;
    } else {
      let totCalls = 0;
      let totTokens = 0;
      let totVal = 0;

      tbody.innerHTML = history.map(m => {
        totCalls += m.calls || 0;
        totTokens += m.total_tokens || 0;
        const outAndThink = (m.output_tokens || 0) + (m.thinking_tokens || 0);
        const apiVal = appConfig.currency === "EUR" ? (m.api_value_eur || m.cost_eur || 0) : (m.api_value_usd || m.cost_usd || 0);
        totVal += apiVal;

        return `
          <tr>
            <td><strong style="color: #ffffff;">${escapeHtml(m.month_name || m.month_key)}</strong></td>
            <td><span class="badge-tag" style="color: #38bdf8; font-weight: 600;">${formatNumber(m.calls || 0)} appels</span></td>
            <td>${formatNumber(m.input_tokens || 0)}</td>
            <td>${formatNumber(outAndThink)}</td>
            <td><strong>${formatNumber(m.total_tokens || 0)}</strong></td>
            <td>${formatNumber(m.avg_tokens_per_call || 0)} tok/app</td>
            <td><span style="color: #34d399; font-weight: 700;">${formatCurrency(apiVal, appConfig.currency)}</span></td>
            <td><span class="badge-tag">${m.days_count || 1} j actif${(m.days_count || 1) > 1 ? 's' : ''}</span></td>
          </tr>
        `;
      }).join("");

      // Totaux globaux
      const totalsDiv = document.getElementById("monthlyRecapTotals");
      if (totalsDiv) {
        totalsDiv.innerHTML = `
          <div><strong>Total Cumulé :</strong> <span style="color: #38bdf8; font-weight: 700;">${formatNumber(totCalls)} requêtes</span></div>
          <div><strong>Volume Total :</strong> <span style="color: #c084fc; font-weight: 700;">${formatNumber(totTokens)} tokens</span></div>
          <div><strong>Valeur API Totale :</strong> <span style="color: #34d399; font-weight: 700;">${formatCurrency(totVal, appConfig.currency)}</span></div>
        `;
      }
    }
  }
}

// --- GESTION DU CHANGELOG & NOUVEAUTÉS ---
const CURRENT_APP_VERSION = "1.7.0";

function openChangelogModal() {
  const modal = document.getElementById("changelogModal");
  if (!modal) return;
  modal.style.display = "flex";
  modal.classList.add("active");
}

function closeChangelogModal() {
  const modal = document.getElementById("changelogModal");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("active");
  }
}

function checkAutoOpenChangelog() {
  const lastSeen = localStorage.getItem("tracker_last_seen_version");
  if (!lastSeen || lastSeen !== CURRENT_APP_VERSION) {
    setTimeout(() => {
      openChangelogModal();
      localStorage.setItem("tracker_last_seen_version", CURRENT_APP_VERSION);
    }, 600);
  }
}

// --- GESTION DE LA BANNIÈRE DE CONNEXION ---
function updateConnectBannerStatus(connected, detailText) {
  const banner = document.getElementById("connectBanner");
  const icon = document.getElementById("connectIcon");
  const title = document.getElementById("connectTitle");
  const sub = document.getElementById("connectSubtitle");
  const btn = document.getElementById("btnPickFolder");

  if (!banner) return;

  if (connected) {
    banner.classList.add("connected");
    if (icon) icon.textContent = "✅";
    if (title) title.textContent = "Dossier Antigravity Connecté";
    if (sub) sub.innerHTML = `Synchronisé en direct avec <code>${escapeHtml(detailText)}</code>`;
    if (btn) btn.innerHTML = "🔄 Changer de dossier";
  } else {
    banner.classList.remove("connected");
    if (icon) icon.textContent = "📂";
    if (title) title.textContent = "Connecter votre dossier local Antigravity";
    if (sub) sub.innerHTML = "Sélectionnez <code>~/.gemini/antigravity</code> pour synchroniser vos sessions et quotas.";
    if (btn) btn.innerHTML = "📂 Sélectionner le dossier Antigravity";
  }
}

function updateLiveBadge(text, color = "#34d399") {
  const badgeText = document.getElementById("liveStatusText");
  const dot = document.querySelector("#liveStatusBadge .pulse-dot");
  if (badgeText) badgeText.textContent = text;
  if (dot) dot.style.backgroundColor = color;
}

// --- DONNÉES DE DÉMONSTRATION (FALLBACK SANS DOSSIER) ---
function loadDemoData() {
  const now = Date.now();
  const demoSessions = [
    {
      id: "demo-b1ed90f3",
      title: "Tracker token price & Web App GitHub Pages",
      workspace_name: "tracker token price",
      workspace_path: "/Users/brunoperrin/Documents/antigravity/tracker token price",
      last_modified: formatDateTime(new Date(now)),
      lastModifiedMs: now,
      turns: 28,
      context_tokens: 38400,
      api_input_tokens: 165400,
      api_output_tokens: 18200,
      thinking_tokens: 12400,
      total_tokens: 196000,
      model_used: "gemini-3.8-flash",
      turn_events: [
        { time: new Date(now - 15 * 60 * 1000).toISOString(), input: 24000, output: 2800, thinking: 1900 },
        { time: new Date(now - 45 * 60 * 1000).toISOString(), input: 32000, output: 3500, thinking: 2200 },
        { time: new Date(now - 90 * 60 * 1000).toISOString(), input: 48000, output: 4200, thinking: 3100 },
        { time: new Date(now - 140 * 60 * 1000).toISOString(), input: 61400, output: 7700, thinking: 5200 }
      ],
      daily_activity: {
        [new Date(now).toISOString().substring(0, 10)]: {
          input_tokens: 165400,
          output_tokens: 18200,
          thinking_tokens: 12400,
          calls: 28
        }
      }
    },
    {
      id: "demo-a87f12c4",
      title: "Refactoring API FastAPI & Async Task Manager",
      workspace_name: "backend-core",
      workspace_path: "/Users/brunoperrin/Documents/projects/backend-core",
      last_modified: formatDateTime(new Date(now - 86400000)),
      lastModifiedMs: now - 86400000,
      turns: 19,
      context_tokens: 28000,
      api_input_tokens: 122000,
      api_output_tokens: 14500,
      thinking_tokens: 8900,
      total_tokens: 145400,
      model_used: "gemini-3.8-flash",
      turn_events: [],
      daily_activity: {
        [new Date(now - 86400000).toISOString().substring(0, 10)]: {
          input_tokens: 122000,
          output_tokens: 14500,
          thinking_tokens: 8900,
          calls: 19
        }
      }
    }
  ];

  appState.sessions = demoSessions;
  appState.activeSession = demoSessions[0];
  updateConnectBannerStatus(false, "");
  updateLiveBadge("Mode Démo Actif", "#38bdf8");
  recomputeAll();
}

// --- INDEXEDDB POUR CONSERVER L'ACCÈS AU DOSSIER ---
async function storeDirectoryHandle(handle) {
  try {
    const db = await openDb();
    const tx = db.transaction("handles", "readwrite");
    tx.objectStore("handles").put(handle, "antigravity_dir");
  } catch (e) {
    // Silencieux si non supporté
  }
}

async function tryRestoreDirectoryAccess() {
  try {
    const db = await openDb();
    const tx = db.transaction("handles", "readonly");
    const handle = await new Promise((resolve, reject) => {
      const req = tx.objectStore("handles").get("antigravity_dir");
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });

    if (handle) {
      // Vérifier permission
      const opts = { mode: "read" };
      if ((await handle.queryPermission(opts)) === "granted") {
        appState.dirHandle = handle;
        await scanAndParseDirectory(handle);
        startDirectoryWatcher();
        return true;
      }
    }
  } catch (e) {
    // Non restauré
  }
  return false;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("AntigravityTrackerDB", 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore("handles");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
}

// --- NOTIFICATIONS TOAST ---
function showToast(message) {
  const existing = document.querySelector(".toast-notification");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast-notification";
  toast.innerHTML = `<span>🔔</span> <span>${escapeHtml(message)}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.4s";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
