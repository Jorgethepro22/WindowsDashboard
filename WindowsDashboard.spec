# -*- mode: python ; coding: utf-8 -*-


from PyInstaller.utils.hooks import collect_data_files

whisper_datas = collect_data_files('faster_whisper')
llama_datas = collect_data_files('llama_cpp')

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('ui', 'ui'), ('config.json', '.')] + whisper_datas + llama_datas,
    hiddenimports=[
        'win32pdh', 'PIL', 'win32gui', 'win32ui', 'win32com', 'comtypes',
        'win32api', 'win32con', 'sounddevice', 'faster_whisper', 'ctranslate2', 'numpy',
        'edge_tts', 'llama_cpp'
    ],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='WindowsDashboard',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='WindowsDashboardApp',
)
