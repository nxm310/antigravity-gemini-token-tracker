"""
antigravity_tracker.py - Moteur d'analyse et de suivi en temps réel des sessions Antigravity.
Lit les logs de conversations Antigravity (~/.gemini/antigravity), calcule les tokens
consommés (Input, Output, Thinking, Contexte) et évalue les coûts selon la grille Gemini.
"""

import os
import json
import sqlite3
import urllib.parse
import urllib.request
import subprocess
import ssl
import re
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional

from pricing import calculate_cost, get_model_spec, DEFAULT_MODEL
from gemini_api import estimate_tokens_fast

def fetch_live_antigravity_rpc_quota() -> Optional[Dict[str, Any]]:
    """
    Interroge le language_server local d'Antigravity en temps réel via l'API interne
    /exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary
    pour obtenir les métriques exactes affichées dans Antigravity IDE (Settings > Models).
    """
    try:
        ps_out = subprocess.check_output(['ps', 'aux'], text=True)
        token = None
        for line in ps_out.splitlines():
            if 'language_server' in line and '--csrf_token' in line:
                m = re.search(r'--csrf_token\s+([a-f0-9-]+)', line)
                if m:
                    token = m.group(1)
                break
        if not token:
            return None

        lsof_out = subprocess.check_output(['lsof', '-iTCP', '-sTCP:LISTEN', '-P', '-n'], text=True)
        ports = []
        for line in lsof_out.splitlines():
            if 'language_' in line:
                m = re.search(r':(\d+)\s+\(LISTEN\)', line)
                if m:
                    ports.append(int(m.group(1)))

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        for port in ports:
            url = f'https://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary'
            req = urllib.request.Request(
                url,
                headers={'X-Codeium-Csrf-Token': token, 'Content-Type': 'application/json'},
                data=b'{}'
            )
            try:
                with urllib.request.urlopen(req, context=ctx, timeout=1.5) as r:
                    if r.status == 200:
                        return json.loads(r.read().decode('utf-8'))
            except Exception:
                continue
    except Exception:
        pass
    return None

# Cache en mémoire des calculs par conversation basé sur le mtime du fichier
_SESSION_CACHE: Dict[str, Dict[str, Any]] = {}

def get_db_path(antigravity_dir: str) -> str:
    return os.path.join(antigravity_dir, "conversation_summaries.db")

def parse_workspace_uris(uris_raw: Optional[str]) -> List[str]:
    """Extrait et nettoie les chemins de workspace depuis la chaîne de la base de données."""
    if not uris_raw:
        return []
    try:
        raw_list = json.loads(uris_raw)
        paths = []
        for u in raw_list:
            clean = u.replace("file://", "")
            clean = urllib.parse.unquote(clean)
            paths.append(clean)
        return paths
    except Exception:
        return []

def analyze_transcript_file(transcript_path: str, default_model: str = DEFAULT_MODEL) -> Dict[str, Any]:
    """
    Analyse pas-à-pas le fichier transcript.jsonl d'une session Antigravity.
    Calcule :
    - Nombre de tours (turns)
    - Tokens cumulés d'entrée envoyés à l'API Gemini
    - Tokens de sortie générés (réponses + tool calls)
    - Tokens de réflexion (thinking / CoT)
    - Taille du contexte actif en fin de session
    - Détection automatique du modèle utilisé
    - Historique chronologique des appels
    """
    if not os.path.exists(transcript_path):
        return {
            "turns": 0,
            "current_context_tokens": 0,
            "api_input_tokens": 0,
            "api_output_tokens": 0,
            "thinking_tokens": 0,
            "model_name": default_model,
            "steps": [],
            "daily_activity": {}
        }

    # Le prompt système initial d'Antigravity compte environ 3 000 tokens
    SYSTEM_PROMPT_TOKENS = 3200
    
    current_context = SYSTEM_PROMPT_TOKENS
    total_input_tokens = 0
    total_output_tokens = 0
    total_thinking_tokens = 0
    turns_count = 0
    detected_model = default_model
    
    steps_summary = []
    turn_events = []
    daily_activity: Dict[str, Dict[str, int]] = {}
    hourly_activity: Dict[str, Dict[str, int]] = {}

    with open(transcript_path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                step = json.loads(line)
            except Exception:
                continue
                
            stype = step.get("type")
            content = step.get("content") or ""
            thinking = step.get("thinking") or ""
            tool_calls = step.get("tool_calls") or []
            created_at = step.get("created_at") or ""
            step_idx = step.get("step_index", 0)

            # Détection de changement de modèle dans les paramètres
            if "Model Selection" in content or "model" in content.lower():
                if "Gemini 3.8 Flash" in content or "gemini-3.8-flash" in content:
                    detected_model = "gemini-3.8-flash"
                elif "Gemini 3.7 Flash" in content or "gemini-3.7-flash" in content:
                    detected_model = "gemini-3.7-flash"
                elif "Gemini 3.6 Flash" in content or "gemini-3.6-flash" in content:
                    detected_model = "gemini-3.6-flash"
                elif "Gemini 3.1 Pro" in content or "gemini-3.1-pro" in content:
                    detected_model = "gemini-3.1-pro"
                elif "Claude Opus 5.5" in content or "claude-opus-5.5" in content:
                    detected_model = "claude-opus-5.5"
                elif "Claude Sonnet 5.5" in content or "claude-sonnet-5.5" in content:
                    detected_model = "claude-sonnet-5.5"
                elif "GPT-OSS 120B" in content or "gpt-oss-120b" in content:
                    detected_model = "gpt-oss-120b"
                elif "Gemini 2.5 Flash" in content or "gemini-2.5-flash" in content:
                    detected_model = "gemini-2.5-flash"
                elif "Gemini 2.0 Flash Thinking" in content or "gemini-2.0-flash-thinking" in content:
                    detected_model = "gemini-2.0-flash-thinking"
                elif "Gemini 2.0 Flash" in content or "gemini-2.0-flash" in content:
                    detected_model = "gemini-2.0-flash"
                elif "Gemini 1.5 Pro" in content or "gemini-1.5-pro" in content:
                    detected_model = "gemini-1.5-pro"
                elif "Gemini 1.5 Flash" in content or "gemini-1.5-flash" in content:
                    detected_model = "gemini-1.5-flash"

            # Date pour l'agrégation
            date_str = ""
            hour_str = ""
            if created_at:
                try:
                    dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    date_str = dt.strftime("%Y-%m-%d")
                    hour_str = dt.strftime("%Y-%m-%d %H:00")
                except Exception:
                    pass

            # Traitement selon le type d'étape dans le cycle de l'agent Antigravity
            if stype == "USER_INPUT":
                tok = estimate_tokens_fast(content)
                current_context += tok
                steps_summary.append({
                    "step": step_idx,
                    "type": "USER_INPUT",
                    "preview": content[:120].strip() if content else "",
                    "tokens": tok,
                    "time": created_at
                })
            elif stype in ("GENERIC", "TOOL_OUTPUT"):
                tok = estimate_tokens_fast(content)
                current_context += tok
            elif stype == "PLANNER_RESPONSE":
                turns_count += 1
                
                # Ce tour envoie le contexte accumulé à Gemini
                turn_input = current_context
                total_input_tokens += turn_input

                # Génération du modèle
                out_tok = estimate_tokens_fast(content)
                think_tok = estimate_tokens_fast(thinking)
                tc_str = json.dumps(tool_calls) if tool_calls else ""
                tc_tok = estimate_tokens_fast(tc_str) if tc_str else 0
                
                turn_output = out_tok + tc_tok
                total_output_tokens += turn_output
                total_thinking_tokens += think_tok
                
                # Le résultat généré s'ajoute au contexte pour le tour suivant
                current_context += (turn_output + think_tok)

                # Agrégations temporelles
                if date_str:
                    if date_str not in daily_activity:
                        daily_activity[date_str] = {"input_tokens": 0, "output_tokens": 0, "thinking_tokens": 0, "calls": 0}
                    daily_activity[date_str]["input_tokens"] += turn_input
                    daily_activity[date_str]["output_tokens"] += turn_output
                    daily_activity[date_str]["thinking_tokens"] += think_tok
                    daily_activity[date_str]["calls"] += 1

                if hour_str:
                    if hour_str not in hourly_activity:
                        hourly_activity[hour_str] = {"input_tokens": 0, "output_tokens": 0, "thinking_tokens": 0, "calls": 0}
                    hourly_activity[hour_str]["input_tokens"] += turn_input
                    hourly_activity[hour_str]["output_tokens"] += turn_output
                    hourly_activity[hour_str]["thinking_tokens"] += think_tok
                    hourly_activity[hour_str]["calls"] += 1

                steps_summary.append({
                    "step": step_idx,
                    "type": "PLANNER_RESPONSE",
                    "preview": (thinking[:80] + "...") if thinking else (content[:80] + "..."),
                    "output_tokens": turn_output,
                    "thinking_tokens": think_tok,
                    "tools_count": len(tool_calls),
                    "time": created_at
                })

                turn_events.append({
                    "time": created_at,
                    "input": turn_input,
                    "output": turn_output,
                    "thinking": think_tok
                })

    return {
        "turns": turns_count,
        "current_context_tokens": current_context,
        "api_input_tokens": total_input_tokens,
        "api_output_tokens": total_output_tokens,
        "thinking_tokens": total_thinking_tokens,
        "model_name": detected_model,
        "steps": steps_summary,
        "turn_events": turn_events,
        "daily_activity": daily_activity,
        "hourly_activity": hourly_activity
    }

def get_session_stats(
    conv_id: str,
    title: str,
    workspaces: List[str],
    last_modified: str,
    antigravity_dir: str,
    selected_model: Optional[str] = None,
    pricing_mode: str = "pay_as_you_go",
    usd_to_eur: float = 0.92
) -> Dict[str, Any]:
    """Récupère les statistiques d'une session avec cache optimisé sur mtime."""
    transcript_path = os.path.join(
        antigravity_dir, "brain", conv_id, ".system_generated", "logs", "transcript.jsonl"
    )
    
    mtime = 0.0
    if os.path.exists(transcript_path):
        try:
            mtime = os.path.getmtime(transcript_path)
        except OSError:
            pass

    # Vérification du cache
    cached = _SESSION_CACHE.get(conv_id)
    if cached and cached.get("_mtime") == mtime and mtime > 0:
        data = cached["data"].copy()
    else:
        parsed = analyze_transcript_file(transcript_path, default_model=selected_model or DEFAULT_MODEL)
        data = parsed
        _SESSION_CACHE[conv_id] = {
            "_mtime": mtime,
            "data": parsed
        }

    # Modèle à utiliser pour le calcul financier
    effective_model = selected_model or data.get("model_name", DEFAULT_MODEL)
    
    # Calcul du coût
    cost_info = calculate_cost(
        input_tokens=data["api_input_tokens"],
        output_tokens=data["api_output_tokens"],
        thinking_tokens=data["thinking_tokens"],
        model_key=effective_model,
        pricing_mode=pricing_mode,
        usd_to_eur=usd_to_eur
    )

    workspace_name = os.path.basename(workspaces[0]) if workspaces else "Sans workspace"
    workspace_full = workspaces[0] if workspaces else ""

    return {
        "id": conv_id,
        "title": title or "Session sans titre",
        "workspace_name": workspace_name,
        "workspace_path": workspace_full,
        "last_modified": last_modified,
        "turns": data["turns"],
        "context_tokens": data["current_context_tokens"],
        "api_input_tokens": data["api_input_tokens"],
        "api_output_tokens": data["api_output_tokens"],
        "thinking_tokens": data["thinking_tokens"],
        "total_tokens": data["api_input_tokens"] + data["api_output_tokens"] + data["thinking_tokens"],
        "model_used": effective_model,
        "costs": cost_info,
        "recent_steps": data["steps"][-5:],
        "turn_events": data.get("turn_events", []),
        "daily_activity": data.get("daily_activity", {}),
        "hourly_activity": data.get("hourly_activity", {})
    }

def scan_all_sessions(
    antigravity_dir: str,
    selected_model: Optional[str] = None,
    pricing_mode: str = "pay_as_you_go",
    usd_to_eur: float = 0.92
) -> Dict[str, Any]:
    """
    Scanne l'ensemble des conversations d'Antigravity.
    Agrège les métriques globales, identifie la session active et construit les données pour les graphiques.
    """
    db_path = get_db_path(antigravity_dir)
    if not os.path.exists(db_path):
        return {
            "sessions": [],
            "totals": {
                "input_tokens": 0,
                "output_tokens": 0,
                "thinking_tokens": 0,
                "total_tokens": 0,
                "total_turns": 0,
                "cost_usd": 0.0,
                "cost_eur": 0.0
            },
            "active_session": None,
            "daily_trends": {},
            "workspace_breakdown": {}
        }

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    rows = cur.execute(
        "SELECT conversation_id, title, step_count, last_modified_time, workspace_uris "
        "FROM conversation_summaries ORDER BY last_modified_time DESC;"
    ).fetchall()
    conn.close()

    sessions = []
    tot_input = 0
    tot_output = 0
    tot_thinking = 0
    tot_turns = 0
    tot_cost_usd = 0.0
    tot_cost_eur = 0.0
    tot_api_value_usd = 0.0
    tot_api_value_eur = 0.0
    
    all_daily_trends: Dict[str, Dict[str, float]] = {}
    workspace_breakdown: Dict[str, Dict[str, float]] = {}

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_input = 0
    today_output = 0
    today_thinking = 0
    today_calls = 0
    today_cost_usd = 0.0
    today_cost_eur = 0.0
    today_api_value_usd = 0.0
    today_api_value_eur = 0.0

    for r in rows:
        cid, title, step_count, mtime_str, w_uris = r
        workspaces = parse_workspace_uris(w_uris)
        
        stat = get_session_stats(
            conv_id=cid,
            title=title,
            workspaces=workspaces,
            last_modified=mtime_str,
            antigravity_dir=antigravity_dir,
            selected_model=selected_model,
            pricing_mode=pricing_mode,
            usd_to_eur=usd_to_eur
        )
        sessions.append(stat)

        tot_input += stat["api_input_tokens"]
        tot_output += stat["api_output_tokens"]
        tot_thinking += stat["thinking_tokens"]
        tot_turns += stat["turns"]
        tot_cost_usd += stat["costs"]["total_cost_usd"]
        tot_cost_eur += stat["costs"]["total_cost_eur"]
        tot_api_value_usd += stat["costs"].get("api_value_usd", 0.0)
        tot_api_value_eur += stat["costs"].get("api_value_eur", 0.0)

        # Répartition par workspace
        ws_name = stat["workspace_name"]
        if ws_name not in workspace_breakdown:
            workspace_breakdown[ws_name] = {
                "tokens": 0,
                "cost_usd": 0.0,
                "cost_eur": 0.0,
                "turns": 0
            }
        workspace_breakdown[ws_name]["tokens"] += stat["total_tokens"]
        workspace_breakdown[ws_name]["cost_usd"] += stat["costs"]["total_cost_usd"]
        workspace_breakdown[ws_name]["cost_eur"] += stat["costs"]["total_cost_eur"]
        workspace_breakdown[ws_name]["turns"] += stat["turns"]

        # Tendances quotidiennes
        for d, acts in stat.get("daily_activity", {}).items():
            if d not in all_daily_trends:
                all_daily_trends[d] = {
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "thinking_tokens": 0,
                    "calls": 0,
                    "cost_usd": 0.0,
                    "cost_eur": 0.0,
                    "api_value_usd": 0.0,
                    "api_value_eur": 0.0
                }
            all_daily_trends[d]["input_tokens"] += acts.get("input_tokens", 0)
            all_daily_trends[d]["output_tokens"] += acts.get("output_tokens", 0)
            all_daily_trends[d]["thinking_tokens"] += acts.get("thinking_tokens", 0)
            all_daily_trends[d]["calls"] += acts.get("calls", 0)

            # Calcul du coût du jour
            d_cost = calculate_cost(
                input_tokens=acts.get("input_tokens", 0),
                output_tokens=acts.get("output_tokens", 0),
                thinking_tokens=acts.get("thinking_tokens", 0),
                model_key=selected_model or stat["model_used"],
                pricing_mode=pricing_mode,
                usd_to_eur=usd_to_eur
            )
            all_daily_trends[d]["cost_usd"] += d_cost["total_cost_usd"]
            all_daily_trends[d]["cost_eur"] += d_cost["total_cost_eur"]
            all_daily_trends[d]["api_value_usd"] += d_cost.get("api_value_usd", 0.0)
            all_daily_trends[d]["api_value_eur"] += d_cost.get("api_value_eur", 0.0)

            if d == today_str:
                today_input += acts.get("input_tokens", 0)
                today_output += acts.get("output_tokens", 0)
                today_thinking += acts.get("thinking_tokens", 0)
                today_calls += acts.get("calls", 0)
                today_cost_usd += d_cost["total_cost_usd"]
                today_cost_eur += d_cost["total_cost_eur"]
                today_api_value_usd += d_cost.get("api_value_usd", 0.0)
                today_api_value_eur += d_cost.get("api_value_eur", 0.0)

    # Calcul des limites glissantes d'Antigravity : Limite sur 5 heures & Limite sur la semaine
    now = datetime.now(timezone.utc)
    from datetime import timedelta
    five_hours_ago = now - timedelta(hours=5)
    seven_days_ago = now - timedelta(days=7)

    calls_5h = 0
    tokens_5h_in = 0
    tokens_5h_out = 0
    tokens_5h_think = 0
    oldest_in_5h = None

    calls_7d = 0
    tokens_7d_in = 0
    tokens_7d_out = 0
    tokens_7d_think = 0
    oldest_in_7d = None

    for s in sessions:
        for te in s.get("turn_events", []):
            t_str = te.get("time")
            if not t_str:
                continue
            try:
                dt = datetime.fromisoformat(t_str.replace("Z", "+00:00"))
            except Exception:
                continue

            in_t = te.get("input", 0)
            out_t = te.get("output", 0)
            th_t = te.get("thinking", 0)

            if dt >= five_hours_ago:
                calls_5h += 1
                tokens_5h_in += in_t
                tokens_5h_out += out_t
                tokens_5h_think += th_t
                if oldest_in_5h is None or dt < oldest_in_5h:
                    oldest_in_5h = dt

            if dt >= seven_days_ago:
                calls_7d += 1
                tokens_7d_in += in_t
                tokens_7d_out += out_t
                tokens_7d_think += th_t
                if oldest_in_7d is None or dt < oldest_in_7d:
                    oldest_in_7d = dt

    # Limites selon le statut (Abonnement Pro / Pay-as-you-go vs Free Tier)
    is_pro = (pricing_mode == "google_ai_pro")
    max_calls_5h = 250 if is_pro else (50 if pricing_mode == "free_tier" else 500)
    max_tokens_5h = 10_000_000 if is_pro else (2_000_000 if pricing_mode == "free_tier" else 20_000_000)

    max_calls_7d = 1500 if is_pro else (300 if pricing_mode == "free_tier" else 3000)
    max_tokens_7d = 60_000_000 if is_pro else (12_000_000 if pricing_mode == "free_tier" else 120_000_000)

    # Fuseau horaire local et noms de jours/mois en français
    local_tz = datetime.now().astimezone().tzinfo
    JOURS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
    MOIS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]

    # Réinitialisation de la fenêtre de 5 heures
    if oldest_in_5h:
        reset_dt = oldest_in_5h + timedelta(hours=5)
        diff_sec = max(0, int((reset_dt - now).total_seconds()))
        h = diff_sec // 3600
        m = (diff_sec % 3600) // 60
        reset_str = f"dans {h}h {m}m" if h > 0 else f"dans {m} min"

        reset_dt_local = reset_dt.astimezone(local_tz)
        if reset_dt_local.date() == datetime.now().date():
            reset_5h_date = f"Aujourd'hui à {reset_dt_local.strftime('%H:%M')}"
        else:
            j_nom = JOURS_FR[reset_dt_local.weekday()]
            m_nom = MOIS_FR[reset_dt_local.month - 1]
            reset_5h_date = f"{j_nom} {reset_dt_local.day} {m_nom} à {reset_dt_local.strftime('%H:%M')}"
    else:
        reset_str = "Prêt (aucun appel actif)"
        reset_5h_date = "Prêt"
        diff_sec = 0

    # Réinitialisation de la fenêtre hebdomadaire de 7 jours (compte à rebours + jour exact de remise à 0)
    if oldest_in_7d:
        reset_dt_7d = oldest_in_7d + timedelta(days=7)
        diff_sec_7d = max(0, int((reset_dt_7d - now).total_seconds()))
        d_7d = diff_sec_7d // 86400
        h_7d = (diff_sec_7d % 86400) // 3600
        m_7d = (diff_sec_7d % 3600) // 60

        if d_7d > 0:
            reset_7d_str = f"dans {d_7d}j {h_7d}h"
        elif h_7d > 0:
            reset_7d_str = f"dans {h_7d}h {m_7d}m"
        else:
            reset_7d_str = f"dans {m_7d} min"

        reset_7d_local = reset_dt_7d.astimezone(local_tz)
        j7_nom = JOURS_FR[reset_7d_local.weekday()]
        m7_nom = MOIS_FR[reset_7d_local.month - 1]
        reset_7d_date = f"{j7_nom} {reset_7d_local.day} {m7_nom} à {reset_7d_local.strftime('%H:%M')}"
    else:
        reset_7d_str = "Prêt (aucun appel actif)"
        reset_7d_date = "Prêt"
        diff_sec_7d = 0

    tot_tokens_5h = tokens_5h_in + tokens_5h_out + tokens_5h_think
    tot_tokens_7d = tokens_7d_in + tokens_7d_out + tokens_7d_think

    pct_5h = min(100.0, round((calls_5h / max_calls_5h) * 100, 1))
    pct_7d = min(100.0, round((calls_7d / max_calls_7d) * 100, 1))

    quota_5h = {
        "calls": calls_5h,
        "max_calls": max_calls_5h,
        "tokens": tot_tokens_5h,
        "tokens_input": tokens_5h_in,
        "tokens_output": tokens_5h_out,
        "tokens_thinking": tokens_5h_think,
        "max_tokens": max_tokens_5h,
        "pct_used": pct_5h,
        "remaining_pct": max(0.0, round(100.0 - pct_5h, 1)),
        "used_pct": pct_5h,
        "reset_in": reset_str,
        "reset_date": reset_5h_date,
        "reset_seconds": diff_sec,
        "is_live_rpc": False
    }

    quota_weekly = {
        "calls": calls_7d,
        "max_calls": max_calls_7d,
        "tokens": tot_tokens_7d,
        "tokens_input": tokens_7d_in,
        "tokens_output": tokens_7d_out,
        "tokens_thinking": tokens_7d_think,
        "max_tokens": max_tokens_7d,
        "pct_used": pct_7d,
        "remaining_pct": max(0.0, round(100.0 - pct_7d, 1)),
        "used_pct": pct_7d,
        "reset_in": reset_7d_str,
        "reset_date": reset_7d_date,
        "reset_seconds": diff_sec_7d,
        "is_live_rpc": False
    }

    # Interrogation en direct de l'API interne d'Antigravity IDE (Settings > Models)
    try:
        live_rpc = fetch_live_antigravity_rpc_quota()
        if live_rpc:
            groups = live_rpc.get('response', {}).get('groups', [])
            gemini_group = next((g for g in groups if g.get('displayName') == 'Gemini Models'), None)
            if gemini_group:
                for b in gemini_group.get('buckets', []):
                    bid = b.get('bucketId')
                    rem_frac = b.get('remainingFraction', 1.0)
                    rem_pct = round(rem_frac * 100, 1)
                    used_pct = round((1.0 - rem_frac) * 100, 1)
                    reset_iso = b.get('resetTime', '')

                    diff_sec = 0
                    r_str = ""
                    r_date_str = ""
                    if reset_iso:
                        dt = datetime.fromisoformat(reset_iso.replace('Z', '+00:00'))
                        diff_sec = max(0, int((dt - now).total_seconds()))
                        dt_local = dt.astimezone(local_tz)

                        d_cnt = diff_sec // 86400
                        h_cnt = (diff_sec % 86400) // 3600
                        m_cnt = (diff_sec % 3600) // 60

                        if d_cnt > 0:
                            r_str = f"dans {d_cnt}j {h_cnt}h"
                        elif h_cnt > 0:
                            r_str = f"dans {h_cnt}h {m_cnt}m"
                        else:
                            r_str = f"dans {m_cnt} min"

                        if dt_local.date() == datetime.now().date():
                            r_date_str = f"Aujourd'hui à {dt_local.strftime('%H:%M')}"
                        else:
                            j_nom = JOURS_FR[dt_local.weekday()]
                            m_nom = MOIS_FR[dt_local.month - 1]
                            r_date_str = f"{j_nom} {dt_local.day} {m_nom} à {dt_local.strftime('%H:%M')}"

                    if bid == 'gemini-5h':
                        quota_5h['remaining_pct'] = rem_pct
                        quota_5h['used_pct'] = used_pct
                        quota_5h['pct_used'] = rem_pct  # Pourcentage affiché aligné sur Antigravity IDE (ex: 65%)
                        quota_5h['reset_in'] = r_str
                        quota_5h['reset_date'] = r_date_str
                        quota_5h['reset_seconds'] = diff_sec
                        quota_5h['is_live_rpc'] = True
                        quota_5h['antigravity_desc'] = b.get('description', '')

                    elif bid == 'gemini-weekly':
                        quota_weekly['remaining_pct'] = rem_pct
                        quota_weekly['used_pct'] = used_pct
                        quota_weekly['pct_used'] = rem_pct  # Pourcentage affiché aligné sur Antigravity IDE (ex: 94%)
                        quota_weekly['reset_in'] = r_str
                        quota_weekly['reset_date'] = r_date_str
                        quota_weekly['reset_seconds'] = diff_sec
                        quota_weekly['is_live_rpc'] = True
                        quota_weekly['antigravity_desc'] = b.get('description', '')
    except Exception:
        pass

    # Agrégation mensuelle de l'historique des tokens et appels
    MOIS_NOMS_FR = {
        "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril",
        "05": "Mai", "06": "Juin", "07": "Juillet", "08": "Août",
        "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre"
    }
    monthly_history_dict = {}
    for d_str, day_data in all_daily_trends.items():
        m_key = d_str[:7]  # "YYYY-MM"
        if m_key not in monthly_history_dict:
            parts = m_key.split("-")
            y_str = parts[0]
            m_num = parts[1] if len(parts) > 1 else "01"
            m_name = f"{MOIS_NOMS_FR.get(m_num, m_num)} {y_str}"
            monthly_history_dict[m_key] = {
                "month_key": m_key,
                "month_name": m_name,
                "calls": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "thinking_tokens": 0,
                "total_tokens": 0,
                "cost_usd": 0.0,
                "cost_eur": 0.0,
                "api_value_usd": 0.0,
                "api_value_eur": 0.0,
                "active_days": set()
            }
        mh = monthly_history_dict[m_key]
        in_t = day_data.get("input_tokens", 0)
        out_t = day_data.get("output_tokens", 0)
        th_t = day_data.get("thinking_tokens", 0)
        mh["calls"] += day_data.get("calls", 0)
        mh["input_tokens"] += in_t
        mh["output_tokens"] += out_t
        mh["thinking_tokens"] += th_t
        mh["total_tokens"] += (in_t + out_t + th_t)
        mh["cost_usd"] = round(mh["cost_usd"] + day_data.get("cost_usd", 0.0), 4)
        mh["cost_eur"] = round(mh["cost_eur"] + day_data.get("cost_eur", 0.0), 4)
        mh["api_value_usd"] = round(mh["api_value_usd"] + day_data.get("api_value_usd", 0.0), 4)
        mh["api_value_eur"] = round(mh["api_value_eur"] + day_data.get("api_value_eur", 0.0), 4)
        mh["active_days"].add(d_str)

    monthly_history = []
    for m_key in sorted(monthly_history_dict.keys(), reverse=True):
        item = monthly_history_dict[m_key]
        item["days_count"] = len(item.pop("active_days", []))
        item["avg_tokens_per_call"] = round(item["total_tokens"] / item["calls"]) if item["calls"] > 0 else 0
        monthly_history.append(item)

    # La session active est la première (la plus récemment modifiée)
    active_session = sessions[0] if sessions else None

    return {
        "sessions": sessions,
        "totals": {
            "input_tokens": tot_input,
            "output_tokens": tot_output,
            "thinking_tokens": tot_thinking,
            "total_tokens": tot_input + tot_output + tot_thinking,
            "total_turns": tot_turns,
            "cost_usd": round(tot_cost_usd, 4),
            "cost_eur": round(tot_cost_eur, 4),
            "api_value_usd": round(tot_api_value_usd, 4),
            "api_value_eur": round(tot_api_value_eur, 4)
        },
        "today": {
            "date": today_str,
            "calls": today_calls,
            "input_tokens": today_input,
            "output_tokens": today_output,
            "thinking_tokens": today_thinking,
            "total_tokens": today_input + today_output + today_thinking,
            "cost_usd": round(today_cost_usd, 4),
            "cost_eur": round(today_cost_eur, 4),
            "api_value_usd": round(today_api_value_usd, 4),
            "api_value_eur": round(today_api_value_eur, 4)
        },
        "quota_5h": quota_5h,
        "quota_weekly": quota_weekly,
        "active_session": active_session,
        "daily_trends": all_daily_trends,
        "monthly_history": monthly_history,
        "workspace_breakdown": workspace_breakdown
    }
