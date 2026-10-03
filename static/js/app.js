// app.js - Logique interactive et temps réel pour le Dashboard Antigravity Gemini

let currentConfig = {
    currency: "EUR",
    pricing_mode: "pay_as_you_go",
    default_model: "gemini-3.8-flash",
    daily_budget_limit: 5.0,
    auto_refresh_seconds: 3
};

let chartDaily = null;
let chartDistribution = null;
let chartWorkspaces = null;
let refreshTimer = null;
let allSessions = [];
let uploadedFiles = [];
let calcDebounce = null;

// Initialisation au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
    initEventListeners();
    fetchDashboardStatus();
    loadChartsLibrary();
    startAutoRefresh();
});

// Écouteurs d'événements
function initEventListeners() {
    // Sélecteur de Devise
    const currencySelect = document.getElementById("currencySelect");
    if (currencySelect) {
        currencySelect.addEventListener("change", (e) => {
            updateSetting("currency", e.target.value);
        });
    }

    // Sélecteur de Mode (Pay-as-you-go / Free tier)
    const modeSelect = document.getElementById("modeSelect");
    if (modeSelect) {
        modeSelect.addEventListener("change", (e) => {
            updateSetting("pricing_mode", e.target.value);
        });
    }

    // Sélecteur de Modèle
    const modelSelect = document.getElementById("modelSelect");
    if (modelSelect) {
        modelSelect.addEventListener("change", (e) => {
            updateSetting("default_model", e.target.value);
        });
    }

    // Bouton Clé API
    const apiKeyBtn = document.getElementById("apiKeyBtn");
    if (apiKeyBtn) {
        apiKeyBtn.addEventListener("click", openApiKeyModal);
    }

    // Recherche de sessions
    const searchSessions = document.getElementById("searchSessions");
    if (searchSessions) {
        searchSessions.addEventListener("input", (e) => {
            filterSessionsTable(e.target.value);
        });
    }

    // Simulateur de Tokens Multimodal
    const calcInput = document.getElementById("calcInput");
    if (calcInput) {
        calcInput.addEventListener("input", () => {
            clearTimeout(calcDebounce);
            calcDebounce = setTimeout(() => runMultimodalCalculator(), 250);
        });
    }

    // Gestion du Drag-and-Drop et Upload Fichiers
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");
    if (dropzone && fileInput) {
        dropzone.addEventListener("click", () => fileInput.click());

        fileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleFilesAdded(e.target.files);
                fileInput.value = ""; // Réinitialise l'input pour permettre de ré-uploader le même fichier
            }
        });

        dropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add("dragover");
        });

        dropzone.addEventListener("dragleave", (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove("dragover");
        });

        dropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove("dragover");
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFilesAdded(e.dataTransfer.files);
            }
        });
    }

    // Bouton Réinitialiser le simulateur
    const clearBtn = document.getElementById("calcClearBtn");
    if (clearBtn) {
        clearBtn.addEventListener("click", clearCalculator);
    }
}

// Récupération des données d'état global du tracker
async function fetchDashboardStatus() {
    try {
        const res = await fetch("/api/status");
        if (!res.ok) return;
        const data = await res.json();
        
        currentConfig = data.config || currentConfig;
        renderHeader(data);
        renderAlerts(data.alerts);
        renderKPIs(data);
        renderActiveSession(data.active_session, data.model_info);
        renderQuotas(data.quotas, data.today, data.quota_5h, data.quota_weekly);
        
        // Charger les sessions et graphiques
        fetchSessions();
        fetchChartsData();
    } catch (err) {
        console.error("Erreur lors de l'actualisation du statut:", err);
    }
}

// Mise à jour de l'en-tête (statut clé API, devise, sélecteurs, badge Pro)
function renderHeader(data) {
    const keyBtn = document.getElementById("apiKeyBtn");
    if (keyBtn) {
        if (data.has_api_key) {
            keyBtn.className = "ctrl-btn btn-key-valid";
            keyBtn.innerHTML = `🔑 Clé Active (${data.api_key_masked})`;
        } else {
            keyBtn.className = "ctrl-btn btn-key-warning";
            keyBtn.innerHTML = `⚠️ Configurer Clé API`;
        }
    }

    // Badge Pro
    const proBadge = document.getElementById("proBadge");
    const isPro = (data.subscription && data.subscription.is_pro) || currentConfig.pricing_mode === "google_ai_pro";
    if (proBadge) {
        proBadge.style.display = isPro ? "inline-flex" : "none";
    }

    // Synchronisation des selects avec la config
    const currencySelect = document.getElementById("currencySelect");
    if (currencySelect && currencySelect.value !== currentConfig.currency) {
        currencySelect.value = currentConfig.currency;
    }

    const modeSelect = document.getElementById("modeSelect");
    if (modeSelect && modeSelect.value !== currentConfig.pricing_mode) {
        modeSelect.value = currentConfig.pricing_mode;
    }

    const modelSelect = document.getElementById("modelSelect");
    if (modelSelect && modelSelect.value !== currentConfig.default_model) {
        modelSelect.value = currentConfig.default_model;
    }

    // Bannière Google AI Pro
    const proBanner = document.getElementById("proSubscriptionBanner");
    if (proBanner) {
        if (isPro && data.subscription) {
            proBanner.style.display = "flex";
            const isEur = currentConfig.currency === "EUR";
            const currSym = isEur ? "€" : "$";
            document.getElementById("proMonthlyPrice").textContent = `${data.subscription.monthly_cost.toFixed(2)} ${currSym}`;
            document.getElementById("proApiValueBanner").textContent = `${data.subscription.api_value_total.toFixed(4)} ${currSym}`;
            document.getElementById("proRoiBanner").textContent = `${data.subscription.roi_pct}%`;
        } else {
            proBanner.style.display = "none";
        }
    }
}

// Affichage des alertes
function renderAlerts(alerts) {
    const container = document.getElementById("alertsContainer");
    if (!container) return;

    if (!alerts || alerts.length === 0) {
        container.innerHTML = "";
        container.style.display = "none";
        return;
    }

    container.style.display = "block";
    container.innerHTML = alerts.map(a => `
        <div class="alert-box">
            <span>🚨 ${escapeHtml(a.message)}</span>
        </div>
    `).join("");
}

// Affichage des cartes KPI principales
function renderKPIs(data) {
    const isEur = currentConfig.currency === "EUR";
    const currSym = isEur ? "€" : "$";
    const isPro = currentConfig.pricing_mode === "google_ai_pro";
    
    // Coût Total / Forfait Pro
    const costTitle = document.getElementById("kpiCostTitle");
    const costElem = document.getElementById("kpiTotalCost");
    const costSubtitle = document.getElementById("kpiCostSubtitle");
    const todayCost = document.getElementById("kpiTodayCost");

    if (isPro) {
        if (costTitle) costTitle.textContent = "Abonnement Google AI Pro";
        if (costElem) costElem.textContent = `Inclus (0,00 ${currSym})`;
        if (costSubtitle && data.subscription) {
            costSubtitle.textContent = `Valeur API : ${data.subscription.api_value_total.toFixed(4)} ${currSym}`;
        }
        if (todayCost && data.subscription) {
            todayCost.textContent = `Rentabilité : ${data.subscription.roi_pct}%`;
            todayCost.style.color = "#34d399";
        }
    } else {
        const totCost = isEur ? data.totals.cost_eur : data.totals.cost_usd;
        if (costTitle) costTitle.textContent = "Coût Total Estimé";
        if (costElem) costElem.textContent = isEur ? `${totCost.toFixed(4)} €` : `$${totCost.toFixed(4)}`;
        if (costSubtitle) costSubtitle.textContent = "Basé sur tarifs officiels Gemini";
        if (todayCost) {
            const c = isEur ? data.today.cost_eur : data.today.cost_usd;
            todayCost.textContent = `${c.toFixed(4)} ${currSym} auj.`;
            todayCost.style.color = "";
        }
    }

    // Tokens Totaux Billed
    const totTokens = data.totals.total_tokens;
    const tokensElem = document.getElementById("kpiTotalTokens");
    if (tokensElem) {
        tokensElem.textContent = formatNumber(totTokens);
    }

    const inTokensElem = document.getElementById("kpiInTokens");
    if (inTokensElem) inTokensElem.textContent = `${formatNumber(data.totals.input_tokens)} entrée`;

    const outTokensElem = document.getElementById("kpiOutTokens");
    if (outTokensElem) outTokensElem.textContent = `${formatNumber(data.totals.output_tokens)} sortie`;

    const thinkTokensElem = document.getElementById("kpiThinkingTokens");
    if (thinkTokensElem) thinkTokensElem.textContent = `${formatNumber(data.totals.thinking_tokens)} thinking`;

    // Activité du jour
    const todayCalls = document.getElementById("kpiTodayCalls");
    if (todayCalls) todayCalls.textContent = `${data.today.calls} requêtes`;
}

// Affichage de la session Antigravity active en cours
function renderActiveSession(active, modelInfo) {
    const heroCard = document.getElementById("heroActiveSession");
    if (!heroCard) return;

    if (!active) {
        heroCard.style.display = "none";
        return;
    }

    heroCard.style.display = "flex";
    document.getElementById("activeTitle").textContent = active.title || "Session en cours";
    document.getElementById("activeWorkspace").textContent = active.workspace_path || active.workspace_name;
    
    // Contexte utilisé (max 1M tokens)
    const maxCtx = (modelInfo && modelInfo.max_context) || 1048576;
    const ctx = active.context_tokens || 0;
    const ctxPct = Math.min(100, (ctx / maxCtx) * 100);

    document.getElementById("activeContextTokens").textContent = `${formatNumber(ctx)} / ${formatNumber(maxCtx)} tokens (${ctxPct.toFixed(1)}%)`;
    
    const bar = document.getElementById("activeContextBar");
    if (bar) bar.style.width = `${Math.max(1, ctxPct)}%`;

    document.getElementById("activeTurns").textContent = active.turns;
    document.getElementById("activeSessionTokens").textContent = formatNumber(active.total_tokens);

    const isEur = currentConfig.currency === "EUR";
    const sessCost = isEur ? active.costs.total_cost_eur : active.costs.total_cost_usd;
    document.getElementById("activeCost").textContent = isEur ? `${sessCost.toFixed(4)} €` : `$${sessCost.toFixed(4)}`;
}

// Jauges de Quotas Antigravity : Limite sur 5 heures & Limite sur la semaine en POURCENTAGE
function renderQuotas(quotas, today, q5h, qWeekly) {
    // 1. Limite sur 5 heures (Fenêtre glissante Antigravity)
    if (q5h) {
        const calls5h = q5h.calls || 0;
        const max5h = q5h.max_calls || 250;
        const pct5h = q5h.pct_used || 0;
        const tokens5h = q5h.tokens || 0;
        const resetStr = q5h.reset_in || "Prêt";

        const valElem = document.getElementById("kpi5hVal");
        if (valElem) {
            valElem.textContent = `${pct5h}%`;
            // Coloration dynamique selon le niveau de charge
            if (pct5h >= 85) valElem.style.color = "#f43f5e";
            else if (pct5h >= 60) valElem.style.color = "#fbbf24";
            else valElem.style.color = "#38bdf8";
        }

        const barElem = document.getElementById("kpi5hBar");
        if (barElem) {
            barElem.style.width = `${Math.max(2, pct5h)}%`;
            if (pct5h >= 85) barElem.className = "progress-bar-fill bg-amber";
            else barElem.className = "progress-bar-fill bg-cyan";
        }

        const resetElem = document.getElementById("kpi5hReset");
        if (resetElem) {
            resetElem.textContent = `⏱️ Reset ${resetStr}`;
        }

        const callsElem = document.getElementById("kpi5hCallsText");
        if (callsElem) {
            callsElem.textContent = `${formatNumber(calls5h)} / ${formatNumber(max5h)} requêtes`;
        }

        const tokElem = document.getElementById("kpi5hTokens");
        if (tokElem) {
            tokElem.textContent = `${formatNumber(tokens5h)} tokens`;
        }
    }

    // 2. Limite sur la semaine (7 jours glissants)
    if (qWeekly) {
        const callsWeekly = qWeekly.calls || 0;
        const maxWeekly = qWeekly.max_calls || 1500;
        const pctWeekly = qWeekly.pct_used || 0;
        const tokensWeekly = qWeekly.tokens || 0;

        const valElem = document.getElementById("kpiWeeklyVal");
        if (valElem) {
            valElem.textContent = `${pctWeekly}%`;
            if (pctWeekly >= 85) valElem.style.color = "#f43f5e";
            else if (pctWeekly >= 60) valElem.style.color = "#fbbf24";
            else valElem.style.color = "#34d399";
        }

        const barElem = document.getElementById("kpiWeeklyBar");
        if (barElem) {
            barElem.style.width = `${Math.max(2, pctWeekly)}%`;
            if (pctWeekly >= 85) barElem.className = "progress-bar-fill bg-amber";
            else barElem.className = "progress-bar-fill bg-emerald";
        }

        const callsElem = document.getElementById("kpiWeeklyCallsText");
        if (callsElem) {
            callsElem.textContent = `${formatNumber(callsWeekly)} / ${formatNumber(maxWeekly)} requêtes`;
        }

        const tokElem = document.getElementById("kpiWeeklyTokens");
        if (tokElem) {
            tokElem.textContent = `${formatNumber(tokensWeekly)} tokens (7j)`;
        }

        const statusElem = document.getElementById("kpiWeeklyStatus");
        if (statusElem) {
            if (pctWeekly >= 85) {
                statusElem.textContent = "Quota élevé";
                statusElem.style.color = "#f43f5e";
            } else {
                statusElem.textContent = "Quota optimal";
                statusElem.style.color = "#34d399";
            }
        }
    }
}

// Récupération et rendu de la table des sessions
async function fetchSessions() {
    try {
        const res = await fetch("/api/sessions");
        if (!res.ok) return;
        const data = await res.json();
        allSessions = data.sessions || [];
        renderSessionsTable(allSessions);
    } catch (err) {
        console.error("Erreur sessions:", err);
    }
}

function renderSessionsTable(sessions) {
    const tbody = document.getElementById("sessionsTableBody");
    if (!tbody) return;

    if (!sessions || sessions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">Aucune session Antigravity trouvée.</td></tr>`;
        return;
    }

    const isEur = currentConfig.currency === "EUR";
    const currSym = isEur ? "€" : "$";

    tbody.innerHTML = sessions.map(s => {
        const cost = isEur ? s.costs.total_cost_eur : s.costs.total_cost_usd;
        const dateStr = s.last_modified ? new Date(s.last_modified).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "N/A";
        return `
            <tr>
                <td class="title-cell">${escapeHtml(s.title)}</td>
                <td class="workspace-cell">${escapeHtml(s.workspace_name)}</td>
                <td style="color: var(--text-muted); font-size: 0.8rem;">${dateStr}</td>
                <td><span class="badge-tag">${s.turns} tours</span></td>
                <td>${formatNumber(s.api_input_tokens)}</td>
                <td>${formatNumber(s.api_output_tokens + s.thinking_tokens)}</td>
                <td class="cost-cell">${cost.toFixed(4)} ${currSym}</td>
            </tr>
        `;
    }).join("");
}

function filterSessionsTable(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
        renderSessionsTable(allSessions);
        return;
    }
    const filtered = allSessions.filter(s => 
        (s.title && s.title.toLowerCase().includes(q)) ||
        (s.workspace_name && s.workspace_name.toLowerCase().includes(q))
    );
    renderSessionsTable(filtered);
}

// Graphiques (Chart.js)
async function fetchChartsData() {
    try {
        const res = await fetch("/api/history");
        if (!res.ok) return;
        const data = await res.json();
        renderCharts(data);
    } catch (err) {
        console.error("Erreur chargement graphiques:", err);
    }
}

function renderCharts(data) {
    if (typeof Chart === "undefined") return;

    // 1. Graphique Évolution Temporelle
    const dailyCtx = document.getElementById("chartDaily");
    if (dailyCtx) {
        const dates = Object.keys(data.daily_trends || {}).sort();
        const inputTokens = dates.map(d => data.daily_trends[d].input_tokens);
        const outputTokens = dates.map(d => data.daily_trends[d].output_tokens + data.daily_trends[d].thinking_tokens);
        const isEur = currentConfig.currency === "EUR";
        const costs = dates.map(d => isEur ? data.daily_trends[d].cost_eur : data.daily_trends[d].cost_usd);

        if (chartDaily) chartDaily.destroy();

        chartDaily = new Chart(dailyCtx, {
            type: "bar",
            data: {
                labels: dates.map(d => d.slice(5)), // MM-DD
                datasets: [
                    {
                        label: "Tokens Entrée",
                        data: inputTokens,
                        backgroundColor: "rgba(6, 182, 212, 0.6)",
                        borderColor: "#06b6d4",
                        borderWidth: 1,
                        yAxisID: "y"
                    },
                    {
                        label: "Tokens Sortie",
                        data: outputTokens,
                        backgroundColor: "rgba(139, 92, 246, 0.6)",
                        borderColor: "#8b5cf6",
                        borderWidth: 1,
                        yAxisID: "y"
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: "#9ca3af" } }
                },
                scales: {
                    x: { ticks: { color: "#9ca3af" }, grid: { color: "rgba(255, 255, 255, 0.05)" } },
                    y: { ticks: { color: "#9ca3af" }, grid: { color: "rgba(255, 255, 255, 0.05)" } }
                }
            }
        });
    }

    // 2. Graphique Donut Répartition des Tokens
    const distCtx = document.getElementById("chartDistribution");
    if (distCtx && allSessions.length > 0) {
        let totIn = 0, totOut = 0, totThink = 0;
        allSessions.forEach(s => {
            totIn += s.api_input_tokens;
            totOut += s.api_output_tokens;
            totThink += s.thinking_tokens;
        });

        if (chartDistribution) chartDistribution.destroy();

        chartDistribution = new Chart(distCtx, {
            type: "doughnut",
            data: {
                labels: ["Entrée (Context)", "Sortie (Réponses)", "Thinking (CoT)"],
                datasets: [{
                    data: [totIn, totOut, totThink],
                    backgroundColor: [
                        "rgba(6, 182, 212, 0.8)",
                        "rgba(139, 92, 246, 0.8)",
                        "rgba(245, 158, 11, 0.8)"
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "bottom", labels: { color: "#9ca3af" } }
                }
            }
        });
    }
}

// Mise à jour de paramètres (devise, modèle, mode de calcul)
async function updateSetting(key, value) {
    try {
        const payload = {};
        payload[key] = value;
        const res = await fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: jsonStringify(payload)
        });
        if (res.ok) {
            currentConfig[key] = value;
            fetchDashboardStatus();
        }
    } catch (e) {
        console.error("Erreur sauvegarde setting:", e);
    }
}

// Modale Clé API & Paramètres
function openApiKeyModal() {
    const modal = document.getElementById("apiKeyModal");
    const input = document.getElementById("apiKeyInput");
    const budgetInput = document.getElementById("budgetLimitInput");
    const proCostInput = document.getElementById("proMonthlyCostInput");
    const statusMsg = document.getElementById("keyStatusMsg");

    if (modal) modal.classList.add("active");
    if (statusMsg) statusMsg.style.display = "none";
    if (budgetInput) budgetInput.value = currentConfig.daily_budget_limit || 5.0;
    if (proCostInput) proCostInput.value = currentConfig.pro_monthly_cost || 21.99;
}

function closeApiKeyModal() {
    const modal = document.getElementById("apiKeyModal");
    if (modal) modal.classList.remove("active");
}

async function testAndSaveApiKey() {
    const input = document.getElementById("apiKeyInput");
    const budgetInput = document.getElementById("budgetLimitInput");
    const proCostInput = document.getElementById("proMonthlyCostInput");
    const statusMsg = document.getElementById("keyStatusMsg");
    const key = input.value.trim();

    // Sauvegarder les paramètres de budget et d'abonnement
    if (budgetInput && budgetInput.value) {
        updateSetting("daily_budget_limit", parseFloat(budgetInput.value));
    }
    if (proCostInput && proCostInput.value) {
        updateSetting("pro_monthly_cost", parseFloat(proCostInput.value));
    }

    if (!key) {
        // Si aucune nouvelle clé n'est entrée, on sauvegarde juste les paramètres
        closeApiKeyModal();
        fetchDashboardStatus();
        return;
    }

    statusMsg.className = "key-status-msg";
    statusMsg.style.display = "block";
    statusMsg.textContent = "Vérification de la clé en cours auprès de Google...";

    try {
        const res = await fetch("/api/validate_key", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: jsonStringify({ api_key: key, save: true })
        });
        const data = await res.json();

        if (data.valid) {
            statusMsg.className = "key-status-msg success";
            statusMsg.textContent = `Succès ! Clé validée (${data.models_count || 0} modèles connectés).`;

            setTimeout(() => {
                closeApiKeyModal();
                fetchDashboardStatus();
            }, 1200);
        } else {
            statusMsg.className = "key-status-msg error";
            statusMsg.textContent = `Échec de validation : ${data.error || "Clé invalide"}`;
        }
    } catch (e) {
        statusMsg.className = "key-status-msg error";
        statusMsg.textContent = `Erreur réseau : ${e.message}`;
    }
}

// --- SIMULATEUR MULTIMODAL (TEXTE, IMAGES & DOCUMENTS) ---

// Lecture et ajout de fichiers
async function handleFilesAdded(fileList) {
    const readers = Array.from(fileList).map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({
                    name: file.name,
                    type: file.type || "application/octet-stream",
                    size: file.size,
                    data: e.target.result, // DataURL contenant base64
                    previewUrl: file.type.startsWith("image/") ? e.target.result : null
                });
            };
            reader.readAsDataURL(file);
        });
    });

    const newFiles = await Promise.all(readers);
    uploadedFiles = uploadedFiles.concat(newFiles);
    runMultimodalCalculator();
}

// Suppression d'un fichier
function removeUploadedFile(index) {
    uploadedFiles.splice(index, 1);
    runMultimodalCalculator();
}

// Réinitialisation du simulateur
function clearCalculator() {
    const calcInput = document.getElementById("calcInput");
    if (calcInput) calcInput.value = "";
    uploadedFiles = [];
    runMultimodalCalculator();
}

// Rendu des fichiers uploadés dans la dropzone
function renderUploadedFiles(filesDetails = []) {
    const container = document.getElementById("uploadedFilesList");
    if (!container) return;

    if (uploadedFiles.length === 0) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = uploadedFiles.map((f, idx) => {
        const detail = filesDetails[idx] || {};
        const tok = detail.tokens || 0;
        const info = detail.info || `${(f.size / 1024).toFixed(1)} Ko`;
        
        let iconHtml = "📁";
        if (f.type.startsWith("image/")) {
            iconHtml = f.previewUrl 
                ? `<img src="${f.previewUrl}" class="file-chip-thumb" alt="${escapeHtml(f.name)}">`
                : `<div class="file-chip-icon">🖼️</div>`;
        } else if (f.type.includes("pdf") || f.name.toLowerCase().endsWith(".pdf")) {
            iconHtml = `<div class="file-chip-icon">📄</div>`;
        } else if (f.name.match(/\.(py|js|ts|html|css|json|cpp|c|rs|go|sh)$/i)) {
            iconHtml = `<div class="file-chip-icon">💻</div>`;
        } else {
            iconHtml = `<div class="file-chip-icon">📝</div>`;
        }

        return `
            <div class="file-chip">
                <div class="file-chip-left">
                    ${iconHtml}
                    <div class="file-chip-info">
                        <span class="file-chip-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
                        <span class="file-chip-meta">${escapeHtml(info)}</span>
                    </div>
                </div>
                <div class="file-chip-right">
                    <span class="file-chip-tokens">${formatNumber(tok)} tok</span>
                    <button class="file-chip-remove" onclick="removeUploadedFile(${idx})" title="Supprimer ce fichier">&times;</button>
                </div>
            </div>
        `;
    }).join("");
}

// Calcul unifié des tokens et coûts multimodaux
async function runMultimodalCalculator() {
    const textElem = document.getElementById("calcInput");
    const text = textElem ? textElem.value : "";
    const isEur = currentConfig.currency === "EUR";
    const currSym = isEur ? "€" : "$";

    // Si tout est vide
    if ((!text || text.trim() === "") && uploadedFiles.length === 0) {
        document.getElementById("calcTokensCount").textContent = "0 tokens";
        document.getElementById("calcBreakdownPill").textContent = "Texte: 0 tok • Fichiers: 0 tok";
        document.getElementById("calcCostEstimate").textContent = isEur ? "0,000000 €" : "$0.000000";
        document.getElementById("modelComparisonGrid").innerHTML = `
            <div style="color: var(--text-muted); font-size: 0.78rem; padding: 6px 0;">
                Ajoutez du texte, une image ou un document pour comparer les coûts.
            </div>
        `;
        renderUploadedFiles([]);
        return;
    }

    try {
        const payload = {
            text: text,
            files: uploadedFiles.map(f => ({
                name: f.name,
                type: f.type,
                size: f.size,
                data: f.data
            })),
            model: currentConfig.default_model
        };

        const res = await fetch("/api/count_tokens", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: jsonStringify(payload)
        });
        const data = await res.json();

        const totTokens = data.total_tokens || 0;
        const textTok = data.text_tokens || 0;
        const filesTok = data.files_tokens || 0;
        const methodStr = data.method === "official_gemini_api" ? "officiel Gemini API" : "estimation multimodale";

        // Affichage des tokens totaux et répartition
        document.getElementById("calcTokensCount").textContent = `${formatNumber(totTokens)} tokens`;
        document.getElementById("calcBreakdownPill").textContent = `Texte: ${formatNumber(textTok)} tok • Fichiers (${uploadedFiles.length}): ${formatNumber(filesTok)} tok • ${methodStr}`;

        // Rendu des fichiers avec leurs tokens respectifs
        renderUploadedFiles(data.files_details || []);

        // Coût pour le modèle actuellement sélectionné
        const costsByModel = data.costs_by_model || {};
        const curModelData = costsByModel[currentConfig.default_model] || {};
        const activeCostVal = isEur ? curModelData.cost_eur : curModelData.cost_usd;
        
        if (activeCostVal !== undefined) {
            document.getElementById("calcCostEstimate").textContent = isEur 
                ? `${activeCostVal.toFixed(6)} €` 
                : `$${activeCostVal.toFixed(6)}`;
        }

        // Grille de comparaison de tous les modèles
        const compGrid = document.getElementById("modelComparisonGrid");
        if (compGrid && Object.keys(costsByModel).length > 0) {
            compGrid.innerHTML = Object.keys(costsByModel).map(mKey => {
                const m = costsByModel[mKey];
                const costVal = isEur ? m.cost_eur : m.cost_usd;
                const isSelected = mKey === currentConfig.default_model;
                return `
                    <div class="model-comp-card" style="${isSelected ? 'border-color: var(--accent-cyan); background: rgba(6, 182, 212, 0.1);' : ''}">
                        <span class="model-comp-name">${isSelected ? '👉 ' : ''}${escapeHtml(m.name)}</span>
                        <span class="model-comp-cost">${costVal !== undefined ? costVal.toFixed(6) : '0.000000'} ${currSym}</span>
                    </div>
                `;
            }).join("");
        }
    } catch (e) {
        console.error("Erreur calcul multimodal:", e);
    }
}

// Auto-rafraîchissement
function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    const interval = (currentConfig.auto_refresh_seconds || 3) * 1000;
    refreshTimer = setInterval(() => {
        fetchDashboardStatus();
    }, interval);
}

// Fonctions utilitaires
function formatNumber(num) {
    if (num === undefined || num === null) return "0";
    return Number(num).toLocaleString("fr-FR");
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function jsonStringify(obj) {
    return JSON.stringify(obj);
}

function loadChartsLibrary() {
    if (typeof Chart !== "undefined") return;
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js";
    script.onload = () => {
        fetchChartsData();
    };
    document.head.appendChild(script);
}
