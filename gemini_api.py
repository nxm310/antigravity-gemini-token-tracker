"""
gemini_api.py - Client pour l'API Google Gemini
Permet de valider la clé API, d'interroger les modèles disponibles et de compter les tokens
(texte, code, images et documents PDF/bureautique).
"""

import io
import math
import json
import base64
import urllib.request
import urllib.error
from typing import Dict, Any, Optional, List

try:
    import tiktoken
    _TIKTOKEN_AVAILABLE = True
    _ENCODER = tiktoken.get_encoding("cl100k_base")
except Exception:
    _TIKTOKEN_AVAILABLE = False
    _ENCODER = None

try:
    from PIL import Image
    _PILLOW_AVAILABLE = True
except Exception:
    _PILLOW_AVAILABLE = False

try:
    import pypdfium2
    _PYPDFIUM_AVAILABLE = True
except Exception:
    _PYPDFIUM_AVAILABLE = False

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

def validate_api_key(api_key: str) -> Dict[str, Any]:
    """
    Vérifie la validité d'une clé API Gemini en appelant la liste des modèles.
    Retourne { 'valid': True/False, 'models': [...], 'error': str }
    """
    if not api_key or not api_key.strip():
        return {
            "valid": False,
            "error": "Aucune clé API fournie. Entrez une clé Google AI Studio (commençant généralement par AIza...)."
        }
    
    clean_key = api_key.strip()
    url = f"{BASE_URL}/models?key={clean_key}"
    
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Antigravity-Token-Tracker/1.0"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                models = []
                for m in data.get("models", []):
                    name = m.get("name", "").replace("models/", "")
                    display_name = m.get("displayName", name)
                    methods = m.get("supportedGenerationMethods", [])
                    if "generateContent" in methods:
                        models.append({
                            "id": name,
                            "display_name": display_name,
                            "input_token_limit": m.get("inputTokenLimit", 0),
                            "output_token_limit": m.get("outputTokenLimit", 0),
                            "description": m.get("description", "")
                        })
                return {
                    "valid": True,
                    "models_count": len(models),
                    "models": models,
                    "message": "Clé API valide et connectée avec succès aux services Google Gemini !"
                }
            else:
                return {
                    "valid": False,
                    "error": f"Statut inattendu de l'API Google : {response.status}"
                }
    except urllib.error.HTTPError as e:
        err_msg = "Clé API invalide ou non autorisée."
        try:
            err_data = json.loads(e.read().decode("utf-8"))
            if "error" in err_data and "message" in err_data["error"]:
                err_msg = err_data["error"]["message"]
        except Exception:
            pass
        return {
            "valid": False,
            "error": err_msg,
            "status_code": e.code
        }
    except Exception as e:
        return {
            "valid": False,
            "error": f"Erreur de connexion réseau : {str(e)}"
        }

def estimate_tokens_fast(text: str) -> int:
    """
    Comptage local haute performance ultra-rapide des tokens.
    Utilise le tokenizer BPE si disponible (tiktoken), sinon ratio calibré Gemini (3.8 caractères/token).
    """
    if not text:
        return 0
    if _TIKTOKEN_AVAILABLE and _ENCODER:
        try:
            return len(_ENCODER.encode(text))
        except Exception:
            pass
    return max(1, int(len(text) / 3.8))

def estimate_image_tokens(img_bytes: bytes) -> Dict[str, Any]:
    """
    Calcule les tokens d'une image selon l'algorithme officiel de découpage en tuiles de Gemini :
    - Image <= 384x384 : 258 tokens (1 tuile)
    - Image > 384x384 : découpée en tuiles de 768x768 pixels, chaque tuile coûte 258 tokens.
    """
    if not _PILLOW_AVAILABLE:
        return {"tokens": 258, "info": "Image standard (258 tokens)", "width": 0, "height": 0}
        
    try:
        im = Image.open(io.BytesIO(img_bytes))
        w, h = im.size
        
        if w <= 384 and h <= 384:
            return {
                "tokens": 258,
                "info": f"{w}×{h} px (1 tuile de 258 tokens)",
                "width": w,
                "height": h,
                "tiles": 1
            }
            
        tiles_x = math.ceil(w / 768.0)
        tiles_y = math.ceil(h / 768.0)
        total_tiles = max(1, tiles_x * tiles_y)
        tokens = total_tiles * 258
        return {
            "tokens": tokens,
            "info": f"{w}×{h} px ({total_tiles} tuiles de 768px = {tokens} tokens)",
            "width": w,
            "height": h,
            "tiles": total_tiles
        }
    except Exception as e:
        return {"tokens": 258, "info": f"Image (258 tokens par défaut)", "error": str(e)}

def estimate_pdf_tokens(pdf_bytes: bytes) -> Dict[str, Any]:
    """
    Calcule les tokens d'un document PDF selon l'ingestion multimodale de Gemini :
    - Chaque page compte comme image de document (~258 tokens visuels)
    - Les tokens du texte extrait sont additionnés.
    """
    if not _PYPDFIUM_AVAILABLE:
        # Estimation approximative basée sur la taille du fichier
        approx_pages = max(1, len(pdf_bytes) // 50000)
        tokens = approx_pages * 500
        return {"tokens": tokens, "info": f"PDF estimé ({approx_pages} pages, ~{tokens} tokens)", "pages": approx_pages}
        
    try:
        doc = pypdfium2.PdfDocument(pdf_bytes)
        num_pages = len(doc)
        total_text = ""
        for i in range(num_pages):
            page = doc[i]
            textpage = page.get_textpage()
            total_text += textpage.get_text_range() + " "
            
        text_tokens = estimate_tokens_fast(total_text)
        visual_tokens = num_pages * 258
        total_tokens = text_tokens + visual_tokens
        return {
            "tokens": total_tokens,
            "info": f"{num_pages} page(s) ({visual_tokens} visuels + {text_tokens} texte)",
            "pages": num_pages,
            "text_tokens": text_tokens,
            "visual_tokens": visual_tokens
        }
    except Exception as e:
        return {"tokens": 258, "info": "PDF (erreur lecture, 258 tokens)", "error": str(e)}

def analyze_uploaded_file(file_info: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyse un fichier (image, document PDF, fichier texte/code) et calcule ses tokens.
    file_info = { "name": str, "type": str, "size": int, "data": base64_str }
    """
    name = file_info.get("name", "fichier")
    mime = file_info.get("type", "").lower()
    b64_data = file_info.get("data", "")
    
    # Nettoyage base64 (au cas où il contient data:image/png;base64,...)
    if "," in b64_data:
        b64_data = b64_data.split(",", 1)[1]
        
    try:
        file_bytes = base64.b64decode(b64_data)
    except Exception:
        file_bytes = b""
        
    ext = name.lower().rsplit(".", 1)[-1] if "." in name else ""
    
    # Cas 1 : Images (PNG, JPG, JPEG, WEBP, GIF, BMP, SVG)
    if mime.startswith("image/") or ext in ("png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"):
        res = estimate_image_tokens(file_bytes)
        return {
            "name": name,
            "category": "image",
            "mime_type": mime or f"image/{ext}",
            "tokens": res["tokens"],
            "info": res.get("info", "Image"),
            "size": len(file_bytes),
            "dimensions": f"{res.get('width', 0)}x{res.get('height', 0)}" if res.get("width") else None
        }
        
    # Cas 2 : PDF
    elif mime == "application/pdf" or ext == "pdf":
        res = estimate_pdf_tokens(file_bytes)
        return {
            "name": name,
            "category": "pdf",
            "mime_type": "application/pdf",
            "tokens": res["tokens"],
            "info": res.get("info", "Document PDF"),
            "size": len(file_bytes),
            "pages": res.get("pages", 1)
        }
        
    # Cas 3 : Fichiers texte / code / CSV / JSON / Markdown
    else:
        try:
            text = file_bytes.decode("utf-8", errors="replace")
            tok = estimate_tokens_fast(text)
            lines = text.count("\n") + 1
            return {
                "name": name,
                "category": "code_document",
                "mime_type": mime or "text/plain",
                "tokens": tok,
                "info": f"{lines} lignes, {len(file_bytes):,} octets",
                "size": len(file_bytes)
            }
        except Exception:
            tok = max(1, int(len(file_bytes) / 4))
            return {
                "name": name,
                "category": "binary",
                "mime_type": mime or "application/octet-stream",
                "tokens": tok,
                "info": f"Fichier binaire ({len(file_bytes):,} octets)",
                "size": len(file_bytes)
            }

def count_tokens_official(
    text: Optional[str] = None,
    files: Optional[List[Dict[str, Any]]] = None,
    api_key: Optional[str] = None,
    model: str = "gemini-1.5-flash"
) -> Optional[int]:
    """
    Appelle l'API officielle models.countTokens de Google Gemini avec support multimodal.
    """
    if not api_key:
        return None
        
    parts = []
    if text and text.strip():
        parts.append({"text": text})
        
    if files:
        for f in files:
            b64_data = f.get("data", "")
            if "," in b64_data:
                b64_data = b64_data.split(",", 1)[1]
            mime = f.get("type", "application/octet-stream")
            if b64_data:
                parts.append({
                    "inline_data": {
                        "mime_type": mime,
                        "data": b64_data
                    }
                })
                
    if not parts:
        return 0
        
    url = f"{BASE_URL}/models/{model}:countTokens?key={api_key.strip()}"
    payload = json.dumps({"contents": [{"parts": parts}]}).encode("utf-8")
    
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Antigravity-Token-Tracker/1.0"
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            if response.status == 200:
                res_data = json.loads(response.read().decode("utf-8"))
                return res_data.get("totalTokens", 0)
    except Exception:
        pass
    return None

def count_tokens(
    text: str = "",
    files: Optional[List[Dict[str, Any]]] = None,
    api_key: Optional[str] = None,
    model: str = "gemini-1.5-flash"
) -> Dict[str, Any]:
    """
    Fonction multimodale complète :
    Calcule les tokens d'un prompt texte et de fichiers joints (images, PDF, documents).
    Tente l'API officielle Google si disponible, sinon utilise l'algorithme calibré Gemini.
    """
    files = files or []
    
    # 1. Analyse locale détaillée de chaque fichier
    files_details = [analyze_uploaded_file(f) for f in files]
    files_tokens_sum = sum(f["tokens"] for f in files_details)
    text_tokens = estimate_tokens_fast(text) if text else 0
    total_local_tokens = text_tokens + files_tokens_sum
    
    # 2. Tentative avec l'API officielle Google si clé présente
    if api_key and len(api_key.strip()) > 10:
        official_total = count_tokens_official(text, files, api_key, model)
        if official_total is not None:
            return {
                "total_tokens": official_total,
                "text_tokens": text_tokens,
                "files_tokens": official_total - text_tokens,
                "files_details": files_details,
                "method": "official_gemini_api"
            }
            
    return {
        "total_tokens": total_local_tokens,
        "text_tokens": text_tokens,
        "files_tokens": files_tokens_sum,
        "files_details": files_details,
        "method": "local_multimodal_engine"
    }
