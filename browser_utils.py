import winreg
import shlex
import os

def _get_default_browser_path():
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice") as key:
            prog_id = winreg.QueryValueEx(key, "ProgId")[0]
            
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, rf"{prog_id}\shell\open\command") as key:
            command = winreg.QueryValueEx(key, "")[0]
            
        parts = shlex.split(command)
        if parts:
            return parts[0]
    except Exception:
        pass
    return None

def iniciar_navegador(p, headless=True):
    # Opciones anti-deteccion de Cloudflare
    launch_options = {
        "headless": headless,
        "ignore_default_args": ["--enable-automation"],
        "args": [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-infobars"
        ]
    }
    
    # 1. Intentar usar el navegador por defecto si es basado en Chromium
    default_path = _get_default_browser_path()
    if default_path and os.path.exists(default_path):
        name_lower = default_path.lower()
        if any(x in name_lower for x in ["brave", "chrome", "edge", "msedge", "opera", "vivaldi"]):
            try:
                return p.chromium.launch(executable_path=default_path, **launch_options)
            except:
                pass
                
    # 2. Chrome genérico
    try:
        return p.chromium.launch(channel="chrome", **launch_options)
    except:
        pass
        
    # 3. Edge genérico
    try:
        return p.chromium.launch(channel="msedge", **launch_options)
    except:
        pass
        
    # 4. Fallback Playwright (Chromium empaquetado)
    return p.chromium.launch(**launch_options)
