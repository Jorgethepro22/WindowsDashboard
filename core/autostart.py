"""
Manages Windows Auto-Start via Registry (HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run)
"""
import sys
import os
import winreg

REG_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
APP_NAME = "WindowsDashboard"

def get_startup_command() -> str:
    """Returns the executable command line string to register in Windows Run."""
    if getattr(sys, 'frozen', False):
        return f'"{os.path.abspath(sys.executable)}"'
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dist_exe = os.path.join(base_dir, "dist", "WindowsDashboard", "WindowsDashboard.exe")
    if os.path.exists(dist_exe):
        return f'"{os.path.abspath(dist_exe)}"'
    
    main_py = os.path.join(base_dir, "main.py")
    python_dir = os.path.dirname(sys.executable)
    pythonw = os.path.join(python_dir, "pythonw.exe")
    py_bin = pythonw if os.path.exists(pythonw) else sys.executable
    return f'"{py_bin}" "{os.path.abspath(main_py)}"'

def is_autostart_enabled() -> bool:
    """Checks whether WindowsDashboard is currently configured to start with Windows."""
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_KEY, 0, winreg.KEY_READ) as key:
            winreg.QueryValueEx(key, APP_NAME)
            return True
    except FileNotFoundError:
        return False
    except Exception as e:
        print(f"[Autostart] Error checking registry: {e}")
        return False

def set_autostart(enable: bool) -> bool:
    """Enables or disables auto-starting WindowsDashboard when logging into Windows."""
    try:
        if enable:
            cmd = get_startup_command()
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_KEY, 0, winreg.KEY_SET_VALUE) as key:
                winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, cmd)
            print(f"[Autostart] Enabled startup with command: {cmd}")
            return True
        else:
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_KEY, 0, winreg.KEY_SET_VALUE) as key:
                    winreg.DeleteValue(key, APP_NAME)
                print("[Autostart] Disabled startup.")
            except FileNotFoundError:
                pass
            return True
    except Exception as e:
        print(f"[Autostart] Error updating registry (enable={enable}): {e}")
        return False
