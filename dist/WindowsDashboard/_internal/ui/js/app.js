// WindowsDashboard V2 - Modular Grid Engine & Pointer-Events Drag & Drop

let apiBridge = null;
let currentDesignsData = { active_design: "Predeterminado", designs: {} };
let activeLayout = [];
let currentGridSize = "8x5";
let isEditMode = false;
let isDraggingOutputVolume = false;
let isDraggingInputVolume = false;
let outputVolumeCooldownUntil = 0;
let inputVolumeCooldownUntil = 0;
let isUpdatingOutputVolumeManually = false;
let isUpdatingInputVolumeManually = false;
let outputVolumeDebounceTimer = null;
let inputVolumeDebounceTimer = null;
let activeDrag = null;
let lastDashboardData = null;

function getDesignLayout(entry) {
  if (Array.isArray(entry)) return entry;
  if (entry && Array.isArray(entry.layout)) return entry.layout;
  return [];
}

function getDesignGridSize(entry) {
  if (entry && entry.grid_size) return entry.grid_size;
  return "8x5";
}

function applyGridSize(size) {
  currentGridSize = size === "6x4" ? "6x4" : "8x5";
  const grid = document.getElementById("dashboard-grid");
  if (grid) {
    if (currentGridSize === "6x4") {
      grid.classList.add("grid-6x4");
    } else {
      grid.classList.remove("grid-6x4");
    }
  }
  if (currentGridSize === "6x4") {
    document.body.classList.add("grid-size-6x4");
  } else {
    document.body.classList.remove("grid-size-6x4");
  }
  const selectGrid = document.getElementById("select-grid-size");
  if (selectGrid) {
    selectGrid.value = currentGridSize;
  }
}

function waitForApi() {
  return new Promise((resolve) => {
    if (window.pywebview && window.pywebview.api) {
      resolve(window.pywebview.api);
    } else {
      window.addEventListener("pywebviewready", () => {
        resolve(window.pywebview.api);
      });
    }
  });
}

async function initApp() {
  apiBridge = await waitForApi();

  // Setup Monitors and Window Controls
  setupMonitors(apiBridge);
  setupWindowControls(apiBridge);
  setupSettings(apiBridge);

  // Setup Designs and Edit Mode
  await setupDesigns(apiBridge);
  setupEditMode();
  setupWidgetDrawer();
  setupMediaAudioDelegation(apiBridge);
  setupShortcutModal();
  setupPhotoModal();
  setupTimerModal();
  setupSlideshowModal();
  setupNewDesignModal();
  setupConfirmModal();
  startAudioMeterLoop(apiBridge);
  startMediaLoop(apiBridge);
  // Initial Poll & Loop
  pollData(apiBridge);
  setInterval(() => pollData(apiBridge), 1000);
}

/* ==========================================================================
   MONITORS & WINDOW CONTROLS
   ========================================================================== */
async function setupMonitors(api) {
  try {
    const monitors = await api.get_monitors();
    const currentMonIdx = await api.get_current_monitor_index();
    const select = document.getElementById("monitor-select");
    if (!select || !monitors) return;

    select.innerHTML = "";
    monitors.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.index;
      opt.textContent = m.name;
      if (m.index === currentMonIdx) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    select.addEventListener("change", async (e) => {
      const idx = parseInt(e.target.value, 10);
      await api.switch_monitor(idx);
    });
  } catch (err) {
    console.warn("Could not load monitors:", err);
  }
}

function setupWindowControls(api) {
  const btnFullscreen = document.getElementById("btn-fullscreen");
  if (btnFullscreen) {
    btnFullscreen.addEventListener("click", async () => {
      await api.toggle_fullscreen();
    });
  }
}

/* ==========================================================================
   SETTINGS DROPDOWN & CONFIGURATION
   ========================================================================== */
function setupSettings(api) {
  const btnSettings = document.getElementById("btn-settings");
  const btnClose = document.getElementById("btn-close-settings");
  const panel = document.getElementById("settings-dropdown");
  const chkAuto = document.getElementById("checkbox-auto-location");
  const statusBadge = document.getElementById("location-status-badge");
  const statusText = document.getElementById("location-status-text");
  const inputCity = document.getElementById("input-city-search");
  const suggestionsList = document.getElementById("city-suggestions-list");
  const spinner = document.getElementById("city-search-spinner");
  const selectLang = document.getElementById("select-app-language");
  const chkStartWithWindows = document.getElementById("checkbox-start-with-windows");

  if (!btnSettings || !panel) return;

  let searchDebounceTimer = null;

  function updateStatusDisplay(settings) {
    if (!settings) return;
    if (settings.auto_location) {
      if (inputCity) inputCity.disabled = true;
      if (statusText) {
        if (settings.detected_location) {
          statusText.textContent = `Detectado: ${settings.detected_location}`;
        } else if (settings.detected_status === "failed") {
          statusText.textContent = "Error detectando IP (usando respaldo)";
        } else {
          statusText.textContent = "Detectando ubicación automáticamente...";
        }
      }
    } else {
      if (inputCity) inputCity.disabled = false;
      if (statusText) {
        statusText.textContent = settings.city ? `Ubicación manual: ${settings.city}` : "Ubicación manual";
      }
    }
  }

  async function loadSettings() {
    try {
      if (!api || !api.get_app_settings) return;
      const s = await api.get_app_settings();
      if (!s) return;
      if (chkAuto) chkAuto.checked = Boolean(s.auto_location);
      if (inputCity && s.city) inputCity.value = s.city;
      if (selectLang && s.language) selectLang.value = s.language;
      if (chkStartWithWindows && s.start_with_windows !== undefined) {
        chkStartWithWindows.checked = Boolean(s.start_with_windows);
      }
      updateStatusDisplay(s);
    } catch (e) {
      console.warn("[Settings] Error loading settings:", e);
    }
  }

  loadSettings();

  btnSettings.addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = panel.style.display !== "none";
    panel.style.display = isVisible ? "none" : "block";
    if (!isVisible) {
      loadSettings();
    }
  });

  if (btnClose) {
    btnClose.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.style.display = "none";
      if (suggestionsList) suggestionsList.style.display = "none";
    });
  }

  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== btnSettings && !btnSettings.contains(e.target)) {
      panel.style.display = "none";
    }
    if (suggestionsList && !suggestionsList.contains(e.target) && e.target !== inputCity) {
      suggestionsList.style.display = "none";
    }
  });

  if (chkAuto) {
    chkAuto.addEventListener("change", async () => {
      const isAuto = chkAuto.checked;
      if (inputCity) inputCity.disabled = isAuto;
      if (statusText) {
        statusText.textContent = isAuto ? "Detectando ubicación automáticamente..." : "Ubicación manual";
      }
      try {
        const res = await api.save_app_settings({ auto_location: isAuto });
        if (res) {
          const s = res.settings || res;
          updateStatusDisplay(s);
          if (s.city && inputCity) inputCity.value = s.city;
          if (res.weather) updateWeatherUi(res.weather);
        }
      } catch (err) {
        console.error("[Settings] Error saving auto_location:", err);
      }
    });
  }

  if (inputCity && suggestionsList) {
    inputCity.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const firstItem = suggestionsList.querySelector(".city-suggestion-item:not(.suggestion-empty)");
        if (firstItem) {
          firstItem.click();
        }
      }
    });

    inputCity.addEventListener("input", () => {
      clearTimeout(searchDebounceTimer);
      const q = inputCity.value.trim();
      if (q.length < 2) {
        suggestionsList.style.display = "none";
        suggestionsList.innerHTML = "";
        if (spinner) spinner.style.display = "none";
        return;
      }

      if (spinner) spinner.style.display = "inline-block";

      searchDebounceTimer = setTimeout(async () => {
        try {
          const results = await api.search_cities(q);
          if (spinner) spinner.style.display = "none";
          suggestionsList.innerHTML = "";

          if (!results || results.length === 0) {
            const emptyItem = document.createElement("div");
            emptyItem.className = "suggestion-empty";
            emptyItem.textContent = "No se encontraron ciudades";
            suggestionsList.appendChild(emptyItem);
            suggestionsList.style.display = "block";
            return;
          }

          results.forEach((item) => {
            const row = document.createElement("div");
            row.className = "city-suggestion-item";
            row.innerHTML = `
              <span class="suggestion-city-name">${item.name}</span>
              <span class="suggestion-city-country">${item.admin ? item.admin + ", " : ""}${item.country || ""}</span>
            `;
            row.addEventListener("click", async () => {
              inputCity.value = item.name;
              suggestionsList.style.display = "none";
              if (chkAuto) chkAuto.checked = false;
              if (statusText) statusText.textContent = `Ubicación manual: ${item.display}`;

              try {
                const res = await api.save_app_settings({
                  auto_location: false,
                  city: item.name,
                  latitude: item.latitude,
                  longitude: item.longitude
                });
                if (res) {
                  const s = res.settings || res;
                  updateStatusDisplay(s);
                  if (res.weather) updateWeatherUi(res.weather);
                }
              } catch (err) {
                console.error("[Settings] Error saving manual city:", err);
              }
            });
            suggestionsList.appendChild(row);
          });

          suggestionsList.style.display = "block";
        } catch (err) {
          if (spinner) spinner.style.display = "none";
          console.error("[Settings] Error searching cities:", err);
        }
      }, 300);
    });
  }

  if (selectLang) {
    selectLang.addEventListener("change", async () => {
      try {
        await api.save_app_settings({ language: selectLang.value });
      } catch (err) {
        console.error("[Settings] Error saving language:", err);
      }
    });
  }

  if (chkStartWithWindows) {
    chkStartWithWindows.addEventListener("change", async () => {
      try {
        await api.save_app_settings({ start_with_windows: chkStartWithWindows.checked });
      } catch (err) {
        console.error("[Settings] Error saving start_with_windows:", err);
      }
    });
  }
}

/* ==========================================================================
   DESIGNS MANAGEMENT
   ========================================================================== */
async function setupDesigns(api) {
  const btnDesigns = document.getElementById("btn-designs");
  const dropdownWrapper = document.getElementById("designs-menu-wrapper");
  const dropdownPanel = document.getElementById("designs-dropdown");
  const btnNewDesign = document.getElementById("btn-new-design");

  try {
    currentDesignsData = await api.get_designs();
  } catch (e) {
    console.error("Error loading designs:", e);
  }

  const activeName = currentDesignsData.active_design || "Predeterminado";
  const activeEntry = currentDesignsData.designs[activeName];
  activeLayout = getDesignLayout(activeEntry);
  currentGridSize = getDesignGridSize(activeEntry);
  const initCols = currentGridSize === "6x4" ? 6 : 8;
  const initRows = currentGridSize === "6x4" ? 4 : 5;
  refitLayoutToGrid(initCols, initRows);
  applyGridSize(currentGridSize);
  updateCurrentDesignLabel(activeName);

  if (btnDesigns && dropdownWrapper && dropdownPanel) {
    btnDesigns.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isEditMode) return; // Completely disabled in Edit Mode!
      const isOpen = dropdownPanel.style.display !== "none";
      if (isOpen) {
        dropdownPanel.style.display = "none";
        dropdownWrapper.classList.remove("open");
      } else {
        renderDesignsList();
        dropdownPanel.style.display = "flex";
        dropdownWrapper.classList.add("open");
      }
    });

    document.addEventListener("click", (e) => {
      if (!dropdownWrapper.contains(e.target)) {
        dropdownPanel.style.display = "none";
        dropdownWrapper.classList.remove("open");
      }
    });
  }

  if (btnNewDesign) {
    btnNewDesign.addEventListener("click", (e) => {
      e.stopPropagation();
      openNewDesignModal();
    });
  }

  renderGrid();
}

function updateCurrentDesignLabel(name) {
  const label = document.getElementById("current-design-name-btn");
  if (label) label.textContent = name;
}

function renderDesignsList() {
  const container = document.getElementById("designs-list");
  if (!container) return;
  container.innerHTML = "";

  const activeName = currentDesignsData.active_design;
  const names = Object.keys(currentDesignsData.designs);

  names.forEach((name) => {
    const item = document.createElement("div");
    item.className = `design-item ${name === activeName ? "active" : ""}`;
    const isDefault = name === "Predeterminado";

    item.innerHTML = `
      <span class="design-item-name" title="Cargar este diseño">${name}</span>
      <div class="design-actions">
        <button class="btn-d-action btn-load" title="Cargar diseño">Cargar</button>
        <button class="btn-d-action btn-edit" title="Editar nombre">Editar</button>
        <button class="btn-d-action btn-save" title="Guardar estado actual sobre este diseño">Guardar</button>
        ${!isDefault ? `<button class="btn-d-action delete btn-delete" title="Eliminar diseño">✕</button>` : ""}
      </div>
    `;

    const btnLoad = item.querySelector(".btn-load");
    const nameSpan = item.querySelector(".design-item-name");
    const triggerLoad = async () => {
      currentDesignsData.active_design = name;
      const loadedEntry = currentDesignsData.designs[name];
      activeLayout = getDesignLayout(loadedEntry);
      currentGridSize = getDesignGridSize(loadedEntry);
      const lCols = currentGridSize === "6x4" ? 6 : 8;
      const lRows = currentGridSize === "6x4" ? 4 : 5;
      refitLayoutToGrid(lCols, lRows);
      applyGridSize(currentGridSize);
      await apiBridge.set_active_design(name);
      updateCurrentDesignLabel(name);
      renderDesignsList();
      renderGrid();
      const dropdown = document.getElementById("designs-dropdown");
      const wrapper = document.getElementById("designs-menu-wrapper");
      if (dropdown) dropdown.style.display = "none";
      if (wrapper) wrapper.classList.remove("open");
    };
    btnLoad.addEventListener("click", triggerLoad);
    nameSpan.addEventListener("click", triggerLoad);

    const btnEdit = item.querySelector(".btn-edit");
    btnEdit.addEventListener("click", () => {
      const currentText = nameSpan.textContent;
      const input = document.createElement("input");
      input.className = "design-name-input";
      input.value = currentText;
      item.replaceChild(input, nameSpan);
      input.focus();

      const saveRename = async () => {
        const newName = input.value.trim();
        if (newName && newName !== name) {
          await apiBridge.rename_design(name, newName);
          currentDesignsData.designs[newName] = currentDesignsData.designs[name];
          delete currentDesignsData.designs[name];
          if (currentDesignsData.active_design === name) {
            currentDesignsData.active_design = newName;
            updateCurrentDesignLabel(newName);
          }
        }
        renderDesignsList();
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") saveRename();
        if (e.key === "Escape") renderDesignsList();
      });
      input.addEventListener("blur", saveRename);
    });

    const btnSave = item.querySelector(".btn-save");
    btnSave.addEventListener("click", async () => {
      currentDesignsData.designs[name] = {
        grid_size: currentGridSize,
        layout: JSON.parse(JSON.stringify(activeLayout))
      };
      currentDesignsData.active_design = name;
      await apiBridge.save_design(name, activeLayout, currentGridSize);
      updateCurrentDesignLabel(name);
      renderDesignsList();
      btnSave.textContent = "✓ Guardado";
      setTimeout(() => { btnSave.textContent = "Guardar"; }, 1500);
    });

    const btnDelete = item.querySelector(".btn-delete");
    if (btnDelete) {
      btnDelete.addEventListener("click", async () => {
        const confirmed = await showConfirmDialog("Eliminar Diseño", `¿Estás seguro de que deseas eliminar el diseño "${name}"?`);
        if (!confirmed) return;
        await apiBridge.delete_design(name);
        delete currentDesignsData.designs[name];
        if (currentDesignsData.active_design === name) {
          const remaining = Object.keys(currentDesignsData.designs);
          currentDesignsData.active_design = remaining[0] || "Predeterminado";
          const fallbackEntry = currentDesignsData.designs[currentDesignsData.active_design];
          activeLayout = getDesignLayout(fallbackEntry);
          currentGridSize = getDesignGridSize(fallbackEntry);
          applyGridSize(currentGridSize);
          updateCurrentDesignLabel(currentDesignsData.active_design);
          renderGrid();
        }
        renderDesignsList();
      });
    }

    container.appendChild(item);
  });
}

/* ==========================================================================
   EDIT MODE & WIDGET DRAWER
   ========================================================================== */
function setupEditMode() {
  const btnEdit = document.getElementById("btn-widgets-edit");
  const editBadge = document.getElementById("edit-mode-badge");
  const drawer = document.getElementById("widget-drawer");
  const circle = document.getElementById("drawer-collapsed-circle");
  const btnDesigns = document.getElementById("btn-designs");
  const dropdownPanel = document.getElementById("designs-dropdown");
  const dropdownWrapper = document.getElementById("designs-menu-wrapper");

  if (btnEdit) {
    btnEdit.addEventListener("click", async () => {
      isEditMode = !isEditMode;
      if (isEditMode) {
        document.body.classList.add("edit-mode");
        btnEdit.classList.add("active");
        if (editBadge) editBadge.style.display = "inline-block";
        if (drawer) drawer.style.display = "flex";
        if (circle) circle.style.display = "none";
        if (dropdownPanel) dropdownPanel.style.display = "none";
        if (dropdownWrapper) dropdownWrapper.classList.remove("open");
        if (btnDesigns) {
          btnDesigns.classList.add("disabled");
          btnDesigns.setAttribute("title", "No disponible en Modo Edición (desactiva el modo edición para cambiar de diseño)");
        }
      } else {
        document.body.classList.remove("edit-mode");
        btnEdit.classList.remove("active");
        if (editBadge) editBadge.style.display = "none";
        if (drawer) drawer.style.display = "none";
        if (circle) circle.style.display = "none";
        if (btnDesigns) {
          btnDesigns.classList.remove("disabled");
          btnDesigns.setAttribute("title", "Gestionar Diseños");
        }
        if (apiBridge && currentDesignsData.active_design) {
          await apiBridge.save_design(currentDesignsData.active_design, activeLayout, currentGridSize);
        }
      }
      renderGrid();
    });
  }
}

function refitLayoutToGrid(maxCols, maxRows) {
  const finalLayout = [];

  function collidesWithPlaced(x, y, w, h) {
    return finalLayout.some((placed) => {
      const noOverlap =
        x + w <= placed.x ||
        placed.x + placed.w <= x ||
        y + h <= placed.y ||
        placed.y + placed.h <= y;
      return !noOverlap;
    });
  }

  function findFreeSlot(w, h) {
    for (let r = 1; r <= maxRows - h + 1; r++) {
      for (let c = 1; c <= maxCols - w + 1; c++) {
        if (!collidesWithPlaced(c, r, w, h)) {
          return { x: c, y: r };
        }
      }
    }
    return null;
  }

  const withinBounds = [];
  const outOfBounds = [];

  activeLayout.forEach((w) => {
    if (w.x + w.w - 1 <= maxCols && w.y + w.h - 1 <= maxRows) {
      withinBounds.push(w);
    } else {
      outOfBounds.push(w);
    }
  });

  // 1. Keep widgets that are already within bounds and don't collide
  withinBounds.forEach((w) => {
    if (!collidesWithPlaced(w.x, w.y, w.w, w.h)) {
      finalLayout.push(w);
    } else {
      const free = findFreeSlot(w.w, w.h);
      if (free) {
        w.x = free.x;
        w.y = free.y;
        finalLayout.push(w);
      }
    }
  });

  // 2. Relocate out-of-bounds widgets into free slots, or eliminate if no room
  outOfBounds.forEach((w) => {
    const free = findFreeSlot(w.w, w.h);
    if (free) {
      w.x = free.x;
      w.y = free.y;
      finalLayout.push(w);
    }
  });

  activeLayout = finalLayout;
}

function setupWidgetDrawer() {
  const drawer = document.getElementById("widget-drawer");
  const btnMin = document.getElementById("btn-minimize-drawer");
  const circle = document.getElementById("drawer-collapsed-circle");
  const selectGrid = document.getElementById("select-grid-size");

  if (selectGrid) {
    selectGrid.value = currentGridSize;
    selectGrid.addEventListener("change", async (e) => {
      const newSize = e.target.value;
      currentGridSize = newSize;

      const maxCols = currentGridSize === "6x4" ? 6 : 8;
      const maxRows = currentGridSize === "6x4" ? 4 : 5;

      // Smart refit: if a widget has no space or collides, search for a free slot; if none exists, delete it!
      refitLayoutToGrid(maxCols, maxRows);

      applyGridSize(currentGridSize);
      renderGrid();

      if (currentDesignsData.active_design) {
        currentDesignsData.designs[currentDesignsData.active_design] = {
          grid_size: currentGridSize,
          layout: JSON.parse(JSON.stringify(activeLayout))
        };
        if (apiBridge) {
          await apiBridge.save_design(currentDesignsData.active_design, activeLayout, currentGridSize);
        }
      }
    });
  }

  if (btnMin && drawer && circle) {
    btnMin.addEventListener("click", () => {
      drawer.style.display = "none";
      circle.style.display = "flex";
    });

    circle.addEventListener("click", () => {
      circle.style.display = "none";
      drawer.style.display = "flex";
    });
  }

  // Pointer drag for catalog items
  const catalogItems = document.querySelectorAll(".catalog-item");
  catalogItems.forEach((item) => {
    item.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; // Left click only
      const type = item.getAttribute("data-widget-type");
      const def = WIDGET_DEFINITIONS[type];
      if (!def) return;
      e.preventDefault();

      initPointerDrag(e, {
        isNew: true,
        type: type,
        id: `w_${type}_${Date.now()}`,
        w: def.defaultW,
        h: def.defaultH,
        name: def.name
      });
    });
  });

  setupCatalogCategoryFilters();
}

/* ==========================================================================
   POINTER DRAG ENGINE (SMOOTH, ZERO-JUMP & ZERO-GLITCH ON WEBVIEW2)
   ========================================================================== */
function initPointerDrag(startEvent, itemData) {
  const grid = document.getElementById("dashboard-grid");
  const drawer = document.getElementById("widget-drawer");
  const circle = document.getElementById("drawer-collapsed-circle");
  const maxCols = currentGridSize === "6x4" ? 6 : 8;
  const maxRows = currentGridSize === "6x4" ? 4 : 5;
  const gridRect = grid ? grid.getBoundingClientRect() : { width: 1200, height: 700, left: 0, top: 0, right: 1200, bottom: 700 };
  const gap = 14;
  const cellW = (gridRect.width - (maxCols - 1) * gap) / maxCols;
  const cellH = (gridRect.height - (maxRows - 1) * gap) / maxRows;
  const ghostW = Math.round(itemData.w * cellW + (itemData.w - 1) * gap);
  const ghostH = Math.round(itemData.h * cellH + (itemData.h - 1) * gap);

  // 1. Clean up any leftover ghosts, previews, or dragging states from interrupted interactions
  document.querySelectorAll(".drag-ghost-card").forEach((el) => el.remove());
  const existingPreview = document.getElementById("drop-target-preview");
  if (existingPreview) existingPreview.style.display = "none";
  document.querySelectorAll(".widget-card.is-dragging").forEach((el) => {
    el.classList.remove("is-dragging");
  });

  // If grabOffset was not passed (e.g. from catalog pill), center cursor horizontally and place near top
  const grabOffsetX = itemData.grabOffsetX !== undefined ? itemData.grabOffsetX : Math.round(ghostW / 2);
  const grabOffsetY = itemData.grabOffsetY !== undefined ? itemData.grabOffsetY : Math.round(Math.min(50, ghostH / 2));

  activeDrag = {
    ...itemData,
    startX: startEvent.clientX,
    startY: startEvent.clientY,
    grabOffsetX,
    grabOffsetY,
    ghostW,
    ghostH,
    isDragging: false,
    ghostEl: null,
    targetCol: null,
    targetRow: null,
    isValidDrop: false,
    isSwap: false,
    swapCandidate: null
  };

  function cleanup() {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("blur", onPointerCancel);

    document.querySelectorAll(".drag-ghost-card").forEach((el) => el.remove());
    const preview = document.getElementById("drop-target-preview");
    if (preview) preview.style.display = "none";

    document.querySelectorAll(".widget-card.is-dragging").forEach((el) => {
      el.classList.remove("is-dragging");
    });
  }

  function onPointerCancel() {
    cleanup();
    activeDrag = null;
  }

  function onPointerMove(e) {
    if (!activeDrag) return;

    const dx = e.clientX - activeDrag.startX;
    const dy = e.clientY - activeDrag.startY;

    if (!activeDrag.isDragging) {
      if (Math.hypot(dx, dy) > 4) {
        activeDrag.isDragging = true;

        // If dragging new widget from drawer: shrink drawer to circle!
        if (activeDrag.isNew) {
          if (drawer) drawer.style.display = "none";
          if (circle) circle.style.display = "flex";
        } else {
          // Dim the existing widget card
          const existingWrapper = document.querySelector(`[data-widget-id="${activeDrag.id}"] .widget-card`);
          if (existingWrapper) existingWrapper.classList.add("is-dragging");
        }

        // Create ghost element anchored at exact grab offset
        const ghost = document.createElement("div");
        ghost.className = "drag-ghost-card";
        ghost.style.width = `${activeDrag.ghostW}px`;
        ghost.style.height = `${activeDrag.ghostH}px`;
        ghost.style.left = `${e.clientX - activeDrag.grabOffsetX}px`;
        ghost.style.top = `${e.clientY - activeDrag.grabOffsetY}px`;
        ghost.innerHTML = `
          <span class="drag-ghost-badge">${activeDrag.w}x${activeDrag.h}</span>
          <span class="drag-ghost-name">${activeDrag.name}</span>
        `;
        document.body.appendChild(ghost);
        activeDrag.ghostEl = ghost;
      } else {
        return;
      }
    }

    // Move ghost strictly maintaining grab offset (Zero jumping)
    const cardLeft = e.clientX - activeDrag.grabOffsetX;
    const cardTop = e.clientY - activeDrag.grabOffsetY;

    if (activeDrag.ghostEl) {
      activeDrag.ghostEl.style.left = `${cardLeft}px`;
      activeDrag.ghostEl.style.top = `${cardTop}px`;
    }

    // If pointer moves over circle: re-expand drawer!
    if (circle && drawer && circle.style.display !== "none") {
      const cRect = circle.getBoundingClientRect();
      if (
        e.clientX >= cRect.left &&
        e.clientX <= cRect.right &&
        e.clientY >= cRect.top &&
        e.clientY <= cRect.bottom
      ) {
        circle.style.display = "none";
        drawer.style.display = "flex";
      }
    } else if (circle && drawer && drawer.style.display !== "none" && activeDrag.isDragging) {
      const dRect = drawer.getBoundingClientRect();
      if (
        e.clientX < dRect.left - 15 ||
        e.clientX > dRect.right + 15 ||
        e.clientY < dRect.top - 15 ||
        e.clientY > dRect.bottom + 15
      ) {
        drawer.style.display = "none";
        circle.style.display = "flex";
      }
    }

    // Calculate grid cell target based on virtual card visual placement!
    const curGridRect = grid ? grid.getBoundingClientRect() : gridRect;
    const isOverGrid =
      e.clientX >= curGridRect.left - 40 &&
      e.clientX <= curGridRect.right + 40 &&
      e.clientY >= curGridRect.top - 40 &&
      e.clientY <= curGridRect.bottom + 40;

    let preview = document.getElementById("drop-target-preview");
    if (!preview && grid) {
      preview = document.createElement("div");
      preview.id = "drop-target-preview";
      grid.appendChild(preview);
    }

    if (isOverGrid && preview) {
      const relX = cardLeft - curGridRect.left;
      const relY = cardTop - curGridRect.top;
      const cellSpanW = cellW + gap;
      const cellSpanH = cellH + gap;

      let col = Math.round(relX / cellSpanW) + 1;
      let row = Math.round(relY / cellSpanH) + 1;

      col = Math.max(1, Math.min(maxCols - activeDrag.w + 1, col));
      row = Math.max(1, Math.min(maxRows - activeDrag.h + 1, row));

      activeDrag.targetCol = col;
      activeDrag.targetRow = row;

      // Find all overlapping widgets
      const collidingWidgets = activeLayout.filter((w) => {
        if (!activeDrag.isNew && w.id === activeDrag.id) return false;
        const noOverlap =
          col + activeDrag.w <= w.x ||
          w.x + w.w <= col ||
          row + activeDrag.h <= w.y ||
          w.y + w.h <= row;
        return !noOverlap;
      });

      let isValidDrop = false;
      let isSwap = false;
      let swapCandidate = null;
      let swapTargetPos = null;
      let previewClass = "is-invalid";
      let badgeText = "BLOQUEADO";
      let statusMsg = "🚫 Espacio ocupado — No se puede soltar aquí";

      // Helper: searches for a legal, non-overlapping slot for candidateB
      function findBestPlacementForB(colA, rowA, candB) {
        let bestSlot = null;
        let minDistance = Infinity;

        for (let r = 1; r <= maxRows - candB.h + 1; r++) {
          for (let c = 1; c <= maxCols - candB.w + 1; c++) {
            // 1. Does B at (c, r) overlap with A at (colA, rowA)?
            const overlapsWithA = !(
              c + candB.w <= colA ||
              colA + activeDrag.w <= c ||
              r + candB.h <= rowA ||
              rowA + activeDrag.h <= r
            );
            if (overlapsWithA) continue;

            // 2. Does B at (c, r) collide with ANY other widget in activeLayout?
            const collidesWithOthers = activeLayout.some((w) => {
              if (w.id === activeDrag.id || w.id === candB.id) return false;
              const noOverlap =
                c + candB.w <= w.x ||
                w.x + w.w <= c ||
                r + candB.h <= w.y ||
                w.y + w.h <= r;
              return !noOverlap;
            });
            if (collidesWithOthers) continue;

            // Found a valid slot for B!
            const touchesOrigFootprint = !(
              c + candB.w <= activeDrag.origX ||
              activeDrag.origX + activeDrag.w <= c ||
              r + candB.h <= activeDrag.origY ||
              activeDrag.origY + activeDrag.h <= r
            );

            const isExactOrig = c === activeDrag.origX && r === activeDrag.origY;
            const dist = Math.hypot(c - activeDrag.origX, r - activeDrag.origY) - (isExactOrig ? 10 : (touchesOrigFootprint ? 2 : 0));
            if (dist < minDistance) {
              minDistance = dist;
              bestSlot = { x: c, y: r };
            }
          }
        }
        return bestSlot;
      }

      if (collidingWidgets.length === 0) {
        // Completely free slot!
        isValidDrop = true;
        isSwap = false;
        swapCandidate = null;
        swapTargetPos = null;
        previewClass = "is-valid";
        badgeText = "LIBRE";
        statusMsg = "✓ Espacio libre — Soltar para colocar";
      } else if (!activeDrag.isNew && collidingWidgets.length === 1) {
        const candidateB = collidingWidgets[0];

        // 1. Try finding a valid placement for B with A at current (col, row)
        let bestB = findBestPlacementForB(col, row, candidateB);
        let finalColA = col;
        let finalRowA = row;

        // 2. If not found at exact (col, row), try small adjustments for A that still overlap with B
        //    (covers cases where widgets differ in size, but shifting A by 1 column/row fits both!)
        if (!bestB) {
          const offsets = [
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 },
            { dx: 1, dy: 1 },
            { dx: -1, dy: 1 },
            { dx: 2, dy: 0 },
            { dx: -2, dy: 0 }
          ];

          for (const off of offsets) {
            const testCol = col + off.dx;
            const testRow = row + off.dy;
            if (
              testCol >= 1 &&
              testCol <= maxCols - activeDrag.w + 1 &&
              testRow >= 1 &&
              testRow <= maxRows - activeDrag.h + 1
            ) {
              // Ensure A still overlaps B at (testCol, testRow)
              const stillOverlapsB = !(
                testCol + activeDrag.w <= candidateB.x ||
                candidateB.x + candidateB.w <= testCol ||
                testRow + activeDrag.h <= candidateB.y ||
                candidateB.y + candidateB.h <= testRow
              );
              if (!stillOverlapsB) continue;

              // Ensure A does not collide with any other widget C
              const aCollidesOthers = activeLayout.some((w) => {
                if (w.id === activeDrag.id || w.id === candidateB.id) return false;
                const noOverlap =
                  testCol + activeDrag.w <= w.x ||
                  w.x + w.w <= testCol ||
                  testRow + activeDrag.h <= w.y ||
                  w.y + w.h <= testRow;
                return !noOverlap;
              });
              if (aCollidesOthers) continue;

              const testSlotB = findBestPlacementForB(testCol, testRow, candidateB);
              if (testSlotB) {
                bestB = testSlotB;
                finalColA = testCol;
                finalRowA = testRow;
                break;
              }
            }
          }
        }

        if (bestB) {
          isValidDrop = true;
          isSwap = true;
          swapCandidate = candidateB;
          swapTargetPos = bestB;
          col = finalColA;
          row = finalRowA;
          activeDrag.targetCol = finalColA;
          activeDrag.targetRow = finalRowA;
          previewClass = "is-swap";
          const bDef = WIDGET_DEFINITIONS[candidateB.type];
          const bName = bDef ? bDef.name : "Widget";
          badgeText = "INTERCAMBIAR";
          if (bestB.x === activeDrag.origX && bestB.y === activeDrag.origY) {
            statusMsg = `🔄 Intercambiar con ${bName}`;
          } else {
            statusMsg = `🔄 Intercambiar con ${bName} (a hueco libre ${bestB.x},${bestB.y})`;
          }
        }
      }

      activeDrag.isValidDrop = isValidDrop;
      activeDrag.isSwap = isSwap;
      activeDrag.swapCandidate = swapCandidate;
      activeDrag.swapTargetPos = swapTargetPos;

      preview.className = `drop-target-preview ${previewClass}`;
      preview.style.display = "flex";
      preview.style.gridColumn = `${col} / span ${activeDrag.w}`;
      preview.style.gridRow = `${row} / span ${activeDrag.h}`;

      preview.innerHTML = `
        <div class="drop-preview-badge">${badgeText}</div>
        <div class="drop-preview-title">${activeDrag.name}</div>
        <div class="drop-preview-coords">Columna ${col} • Fila ${row} (${activeDrag.w}x${activeDrag.h})</div>
        <div class="drop-preview-status">${statusMsg}</div>
      `;
    } else if (preview) {
      activeDrag.targetCol = null;
      activeDrag.targetRow = null;
      activeDrag.isValidDrop = false;
      activeDrag.isSwap = false;
      activeDrag.swapCandidate = null;
      activeDrag.swapTargetPos = null;
      preview.style.display = "none";
    }
  }

  async function onPointerUp() {
    const dragData = activeDrag ? { ...activeDrag } : null;
    cleanup();
    activeDrag = null;

    if (dragData && dragData.isDragging && dragData.isValidDrop && dragData.targetCol && dragData.targetRow) {
      const targetX = dragData.targetCol;
      const targetY = dragData.targetRow;

      if (dragData.isNew) {
        activeLayout.push({
          id: dragData.id,
          type: dragData.type,
          x: targetX,
          y: targetY,
          w: dragData.w,
          h: dragData.h
        });
      } else {
        const item = activeLayout.find((w) => w.id === dragData.id);
        if (item) {
          if (dragData.isSwap && dragData.swapCandidate && dragData.swapTargetPos) {
            const swapped = activeLayout.find((w) => w.id === dragData.swapCandidate.id);
            if (swapped) {
              swapped.x = dragData.swapTargetPos.x;
              swapped.y = dragData.swapTargetPos.y;
            }
          }
          item.x = targetX;
          item.y = targetY;
        }
      }

      renderGrid();

      if (apiBridge && currentDesignsData.active_design) {
        await apiBridge.save_design(currentDesignsData.active_design, activeLayout, currentGridSize);
      }
    }
  }

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("blur", onPointerCancel);
}

/* ==========================================================================
   GRID ENGINE (8x5 OR 6x4 DYNAMIC GRID)
   ========================================================================== */
function renderGrid() {
  const grid = document.getElementById("dashboard-grid");
  if (!grid) return;
  grid.innerHTML = "";

  // 1. Background grid slots (visible in Edit Mode)
  const maxCols = currentGridSize === "6x4" ? 6 : 8;
  const maxRows = currentGridSize === "6x4" ? 4 : 5;
  for (let r = 1; r <= maxRows; r++) {
    for (let c = 1; c <= maxCols; c++) {
      const slot = document.createElement("div");
      slot.className = "grid-slot";
      slot.style.gridColumn = `${c} / span 1`;
      slot.style.gridRow = `${r} / span 1`;
      slot.textContent = `${c},${r}`;
      grid.appendChild(slot);
    }
  }

  // 2. Active Widgets from activeLayout
  activeLayout.forEach((widget) => {
    const def = WIDGET_DEFINITIONS[widget.type];
    if (!def) return;

    const wrapper = document.createElement("div");
    wrapper.className = `widget-container w-${widget.w}x${widget.h}`;
    wrapper.style.gridColumn = `${widget.x} / span ${widget.w}`;
    wrapper.style.gridRow = `${widget.y} / span ${widget.h}`;
    wrapper.setAttribute("data-widget-id", widget.id);

    // Pass widget data to render (needed for shortcut widgets)
    wrapper.innerHTML = def.render(widget.id, widget);

    const card = wrapper.querySelector(".widget-card");
    const deleteBtn = wrapper.querySelector(".widget-delete-corner");
    const editBtn = wrapper.querySelector(".widget-edit-corner");

    // Drag whole card when in Edit Mode
    if (card) {
      card.addEventListener("pointerdown", (e) => {
        if (!isEditMode) return;
        if (e.target.closest(".widget-delete-corner")) return;
        if (e.target.closest(".widget-edit-corner")) return;
        if (e.button !== 0) return;
        e.preventDefault();

        const cardRect = card.getBoundingClientRect();
        const grabOffsetX = e.clientX - cardRect.left;
        const grabOffsetY = e.clientY - cardRect.top;

        initPointerDrag(e, {
          isNew: false,
          type: widget.type,
          id: widget.id,
          w: widget.w,
          h: widget.h,
          name: def.name,
          origX: widget.x,
          origY: widget.y,
          grabOffsetX: grabOffsetX,
          grabOffsetY: grabOffsetY
        });
      });

      // Shortcut 1-click launch (Normal Mode only)
      if (widget.type === "shortcut") {
        card.addEventListener("click", async (e) => {
          if (isEditMode) return;
          if (e.target.closest(".widget-delete-corner") || e.target.closest(".widget-edit-corner")) return;
          const target = widget.target;
          if (target && apiBridge) {
            await apiBridge.launch_shortcut(target);
          }
        });
      }
    }

    // Edit Corner click
    if (editBtn) {
      editBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
      editBtn.addEventListener("pointerup", (e) => e.stopPropagation());
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (widget.type === "shortcut") {
          openShortcutModal(widget);
        } else if (widget.type === "photo_2x2" || widget.type === "photo_2x3" || widget.type === "photo_3x2") {
          openPhotoModal(widget);
        } else if (widget.type === "timer") {
          openTimerModal(widget.id);
        } else if (widget.type === "slideshow") {
          openSlideshowModal(widget.id);
        }
      });
    }

    // Photo placeholder click
    const photoPh = wrapper.querySelector(".photo-placeholder");
    if (photoPh) {
      photoPh.addEventListener("click", (e) => {
        if (isEditMode) return;
        e.stopPropagation();
        openPhotoModal(widget);
      });
    }

    // Slideshow placeholder click
    const ssPh = wrapper.querySelector(".slideshow-placeholder");
    if (ssPh) {
      ssPh.addEventListener("click", (e) => {
        if (isEditMode) return;
        e.stopPropagation();
        openSlideshowModal(widget.id);
      });
    }

    // Timer display click & config button click
    const timerDisplayBox = wrapper.querySelector(".timer-display-container");
    const timerCfgBtn = wrapper.querySelector(".btn-timer-settings");
    if (timerDisplayBox) {
      timerDisplayBox.addEventListener("click", (e) => {
        if (isEditMode) return;
        e.stopPropagation();
        openTimerModal(widget.id);
      });
    }
    if (timerCfgBtn) {
      timerCfgBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
      timerCfgBtn.addEventListener("pointerup", (e) => e.stopPropagation());
      timerCfgBtn.addEventListener("click", (e) => {
        if (isEditMode) return;
        e.stopPropagation();
        openTimerModal(widget.id);
      });
    }

    // Delete Corner click
    if (deleteBtn) {
      deleteBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
      deleteBtn.addEventListener("pointerup", (e) => e.stopPropagation());
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        activeLayout = activeLayout.filter((w) => w.id !== widget.id);
        renderGrid();
        if (apiBridge && currentDesignsData.active_design) {
          await apiBridge.save_design(currentDesignsData.active_design, activeLayout, currentGridSize);
        }
      });
    }

    grid.appendChild(wrapper);
  });

  applyCurrentDataToWidgets();
  initInteractiveWidgets();
}

/* ==========================================================================
   MEDIA & AUDIO EVENT DELEGATION
   ========================================================================== */
let mediaActionCooldownUntil = 0;
let mediaOptimisticIsPlaying = null;

function setupMediaAudioDelegation(api) {
  const grid = document.getElementById("dashboard-grid");
  if (!grid) return;

  grid.addEventListener("click", async (e) => {
    if (isEditMode) return; // Completely disabled in Edit Mode!

    if (e.target.closest(".btn-play-pause")) {
      // Optimistic instant toggle for media icon
      if (!lastDashboardData) lastDashboardData = {};
      if (!lastDashboardData.media) lastDashboardData.media = {};
      const newPlayingState = !Boolean(lastDashboardData.media.is_playing);
      lastDashboardData.media.is_playing = newPlayingState;

      mediaOptimisticIsPlaying = newPlayingState;
      mediaActionCooldownUntil = Date.now() + 850;

      const playIcons = grid.querySelectorAll(".icon-play-state");
      playIcons.forEach((icon) => {
        icon._lastState = newPlayingState;
        if (newPlayingState) {
          icon.innerHTML = `<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
        } else {
          icon.innerHTML = `<path fill="currentColor" d="M8 5v14l11-7z"/>`;
        }
      });

      api.media_play_pause().catch(() => {});
    } else if (e.target.closest(".btn-next")) {
      await api.media_next();
      setTimeout(async () => {
        if (api.get_media_info) {
          const m = await api.get_media_info();
          if (m) updateMediaWidgetFromData(m);
        }
      }, 150);
    } else if (e.target.closest(".btn-prev")) {
      await api.media_previous();
      setTimeout(async () => {
        if (api.get_media_info) {
          const m = await api.get_media_info();
          if (m) updateMediaWidgetFromData(m);
        }
      }, 150);
    } else if (e.target.closest(".btn-output-mute") || e.target.closest(".btn-mute")) {
      await api.toggle_output_mute();
      setTimeout(() => pollData(api), 150);
    } else if (e.target.closest(".btn-input-mute")) {
      await api.toggle_input_mute();
      setTimeout(() => pollData(api), 150);
    }
  });

  // Track active dragging on sliders so polling never overwrites them
  grid.addEventListener("pointerdown", (e) => {
    if (isEditMode) return;
    if (e.target.classList.contains("output-volume-range") || e.target.classList.contains("volume-range")) {
      isDraggingOutputVolume = true;
      outputVolumeCooldownUntil = Date.now() + 2000;
    } else if (e.target.classList.contains("input-volume-range")) {
      isDraggingInputVolume = true;
      inputVolumeCooldownUntil = Date.now() + 2000;
    }
  });

  const stopVolumeDrag = () => {
    if (isDraggingOutputVolume) {
      isDraggingOutputVolume = false;
      outputVolumeCooldownUntil = Date.now() + 1500;
    }
    if (isDraggingInputVolume) {
      isDraggingInputVolume = false;
      inputVolumeCooldownUntil = Date.now() + 1500;
    }
  };

  window.addEventListener("pointerup", stopVolumeDrag);
  window.addEventListener("pointercancel", stopVolumeDrag);

  // Smooth continuous volume dispatchers (no lag, real-time application in Windows)
  let isSendingOutputVol = false;
  let pendingOutputVol = null;
  const sendOutputVolumeSmooth = async (val) => {
    pendingOutputVol = val;
    if (isSendingOutputVol) return;
    isSendingOutputVol = true;
    while (pendingOutputVol !== null) {
      const v = pendingOutputVol;
      pendingOutputVol = null;
      try {
        await api.set_output_volume(v);
      } catch (err) {
        console.warn("Error setting output volume:", err);
      }
    }
    isSendingOutputVol = false;
  };

  let isSendingInputVol = false;
  let pendingInputVol = null;
  const sendInputVolumeSmooth = async (val) => {
    pendingInputVol = val;
    if (isSendingInputVol) return;
    isSendingInputVol = true;
    while (pendingInputVol !== null) {
      const v = pendingInputVol;
      pendingInputVol = null;
      try {
        await api.set_input_volume(v);
      } catch (err) {
        console.warn("Error setting mic volume:", err);
      }
    }
    isSendingInputVol = false;
  };

  grid.addEventListener("input", (e) => {
    if (isEditMode) return; // Completely disabled in Edit Mode!

    if (e.target.classList.contains("output-volume-range") || e.target.classList.contains("volume-range")) {
      isDraggingOutputVolume = true;
      outputVolumeCooldownUntil = Date.now() + 2000;
      const val = parseInt(e.target.value) || 0;

      // Optimistic model sync
      if (lastDashboardData && lastDashboardData.audio) {
        if (!lastDashboardData.audio.output) lastDashboardData.audio.output = {};
        lastDashboardData.audio.output.volume = val;
      }

      // Sync all UI elements for output volume
      const cards = grid.querySelectorAll(".widget-card");
      cards.forEach((card) => {
        const text = card.querySelector(".output-volume-val-text") || card.querySelector(".volume-val-text");
        const fill = card.querySelector(".output-range-fill");
        if (text) text.textContent = `${val}%`;
        if (fill) fill.style.width = `${val}%`;
      });

      sendOutputVolumeSmooth(val);
    } else if (e.target.classList.contains("input-volume-range")) {
      isDraggingInputVolume = true;
      inputVolumeCooldownUntil = Date.now() + 2000;
      const val = parseInt(e.target.value) || 0;

      // Optimistic model sync
      if (lastDashboardData && lastDashboardData.audio) {
        if (!lastDashboardData.audio.input) lastDashboardData.audio.input = {};
        lastDashboardData.audio.input.volume = val;
      }

      // Sync all UI elements for input volume
      const cards = grid.querySelectorAll(".widget-card");
      cards.forEach((card) => {
        const text = card.querySelector(".input-volume-val-text");
        const fill = card.querySelector(".input-range-fill");
        if (text) text.textContent = `${val}%`;
        if (fill) fill.style.width = `${val}%`;
      });

      sendInputVolumeSmooth(val);
    }
  });

  grid.addEventListener("change", async (e) => {
    if (isEditMode) return;

    if (e.target.classList.contains("output-volume-range") || e.target.classList.contains("volume-range")) {
      isDraggingOutputVolume = false;
      outputVolumeCooldownUntil = Date.now() + 1500;
      const val = parseInt(e.target.value) || 0;
      await api.set_output_volume(val);
    } else if (e.target.classList.contains("input-volume-range")) {
      isDraggingInputVolume = false;
      inputVolumeCooldownUntil = Date.now() + 1500;
      const val = parseInt(e.target.value) || 0;
      await api.set_input_volume(val);
    } else if (e.target.classList.contains("output-device-select") || e.target.classList.contains("input-device-select")) {
      const devId = e.target.value;
      if (devId) {
        await api.set_default_audio_device(devId);
        setTimeout(() => pollData(api), 200);
      }
    }
  });
}

function applyCurrentDataToWidgets() {
  if (!lastDashboardData) return;
  activeLayout.forEach((w) => {
    if (w.type === "cpu") {
      updateCpuWidget(w.id, lastDashboardData.system ? lastDashboardData.system.cpu : null);
    } else if (w.type === "gpu") {
      updateGpuWidget(w.id, lastDashboardData.system ? lastDashboardData.system.gpu : null);
    } else if (w.type === "disks") {
      updateDisksWidget(w.id, lastDashboardData.system ? lastDashboardData.system.disks : null, lastDashboardData.system ? lastDashboardData.system.ram : null, lastDashboardData.system ? lastDashboardData.system.network : null);
    } else if (w.type === "summary") {
      updateSummaryWidget(w.id, lastDashboardData.system);
    } else if (w.type === "media") {
      updateMediaWidget(w.id, lastDashboardData.media);
    } else if (w.type === "audio") {
      updateAudioWidget(w.id, lastDashboardData.audio);
    } else if (w.type === "audio_meter") {
      const levels = (lastDashboardData.audio && lastDashboardData.audio.levels) ? lastDashboardData.audio.levels : null;
      if (levels) updateAudioMeterWidget(w.id, levels);
    }
  });
}

/* ==========================================================================
   MAIN DATA POLLING LOOP
   ========================================================================== */
async function pollData(api) {
  try {
    const data = await api.get_dashboard_data();
    if (!data) return;
    lastDashboardData = data;

    // Header Weather
    updateWeatherUi(data.weather);

    // Update active widgets
    applyCurrentDataToWidgets();
  } catch (err) {
    console.error("Dashboard poll error:", err);
  }
}

function setText(el, val) {
  if (el && el._lastVal !== val) {
    el._lastVal = val;
    el.textContent = val;
  }
}

function setWidth(el, pctStr) {
  if (el && el._lastWidth !== pctStr) {
    el._lastWidth = pctStr;
    el.style.width = pctStr;
  }
}

/* ==========================================================================
   WIDGET TELEMETRY UPDATERS
   ========================================================================== */
function updateCpuWidget(id, cpu) {
  if (!cpu) return;
  const elTitle = document.getElementById(`${id}_title`);
  const elPct = document.getElementById(`${id}_percent`);
  const circle = document.getElementById(`${id}_circle`);
  const elFreq = document.getElementById(`${id}_freq`);
  const elPower = document.getElementById(`${id}_power`);
  const elCores = document.getElementById(`${id}_cores`);
  const elTempBadge = document.getElementById(`${id}_temp`);

  if (elTitle && cpu.name) {
    const displayName = cpu.name.replace("Intel ", "").replace("AMD ", "").trim();
    setText(elTitle, displayName);
    elTitle.title = cpu.name;
  }

  const pct = Math.round(cpu.percent || 0);
  setText(elPct, pct);
  setCircularGauge(circle, pct);
  setText(elCores, `${cpu.cores} / ${cpu.threads}`);
  setText(elFreq, `${cpu.freq_ghz} GHz`);
  if (elPower) {
    const powerStr = cpu.power_w !== undefined ? `${cpu.power_w} W` : "-- W";
    setText(elPower, powerStr);
  }
  updateTempBadge(elTempBadge, cpu.temp_c);
}

function updateGpuWidget(id, gpu) {
  if (!gpu) return;
  const elTitle = document.getElementById(`${id}_title`);
  const elPct = document.getElementById(`${id}_percent`);
  const circle = document.getElementById(`${id}_circle`);
  const elTempBadge = document.getElementById(`${id}_temp`);
  const elVramText = document.getElementById(`${id}_vram_text`);
  const elVramBar = document.getElementById(`${id}_vram_bar`);
  const elClock = document.getElementById(`${id}_clock`);
  const elPower = document.getElementById(`${id}_power`);

  if (elTitle && gpu.name) {
    setText(elTitle, gpu.name.replace("NVIDIA GeForce ", ""));
  }

  const pct = Math.round(gpu.usage_percent || 0);
  setText(elPct, pct);
  setCircularGauge(circle, pct);
  updateTempBadge(elTempBadge, gpu.temp_c);

  setText(elVramText, `${gpu.vram_used_gb} / ${gpu.vram_total_gb} GB (${gpu.vram_percent}%)`);
  setWidth(elVramBar, `${gpu.vram_percent}%`);

  if (elClock) {
    const clockStr = gpu.clock_mhz ? `${gpu.clock_mhz} MHz` : "-- MHz";
    setText(elClock, clockStr);
  }
  if (elPower) {
    const powerStr = gpu.power_w !== undefined ? `${gpu.power_w} W` : "-- W";
    setText(elPower, powerStr);
  }
}

function updateDisksWidget(id, disks, ram, net) {
  if (ram) {
    const elRamPill = document.getElementById(`${id}_ram_pill`);
    const elRamDetails = document.getElementById(`${id}_ram_details`);
    const elRamBar = document.getElementById(`${id}_ram_bar`);
    const ramPct = Math.round(ram.percent || 0);
    setText(elRamPill, `${ramPct}%`);
    setText(elRamDetails, `${ram.used_gb} / ${ram.total_gb} GB`);
    setWidth(elRamBar, `${ramPct}%`);
  }

  if (disks && disks.length > 0) {
    const container = document.getElementById(`${id}_disks_container`);
    if (container) {
      if (!container._diskElements) {
        container._diskElements = {};
        container.innerHTML = "";
      }

      disks.forEach((disk) => {
        let el = container._diskElements[disk.id];
        if (!el) {
          el = document.createElement("div");
          el.className = "disk-row";

          const parts = disk.label.split(" ");
          const tag = parts.length > 1 ? parts[0] : "DISCO";
          const name = parts.length > 1 ? parts.slice(1).join(" ") : disk.label;

          el.innerHTML = `
            <div class="disk-header">
              <div class="disk-label-group">
                <span class="disk-tag">${tag}</span>
                <span class="disk-name">${name}</span>
              </div>
              <div class="disk-speeds">
                <span class="disk-speed-item read" title="Lectura">
                  <span class="disk-arrow">↓</span><span class="d-read">${disk.read_speed}</span>
                </span>
                <span class="disk-speed-item write" title="Escritura">
                  <span class="disk-arrow">↑</span><span class="d-write">${disk.write_speed}</span>
                </span>
              </div>
              <span class="disk-pct">${disk.usage_percent}%</span>
            </div>
            <div class="disk-bar-track">
              <div class="disk-bar-fill" style="width: ${disk.usage_percent}%"></div>
            </div>
          `;
          container.appendChild(el);
          container._diskElements[disk.id] = el;
          el._readEl = el.querySelector(".d-read");
          el._writeEl = el.querySelector(".d-write");
          el._pctEl = el.querySelector(".disk-pct");
          el._fillEl = el.querySelector(".disk-bar-fill");
        } else {
          setText(el._readEl, disk.read_speed);
          setText(el._writeEl, disk.write_speed);
          setText(el._pctEl, `${disk.usage_percent}%`);
          setWidth(el._fillEl, `${disk.usage_percent}%`);
        }
      });
    }
  }

  if (net) {
    const elDown = document.getElementById(`${id}_net_down`);
    const elUp = document.getElementById(`${id}_net_up`);
    setText(elDown, net.download);
    setText(elUp, net.upload);
  }
}

function updateSummaryWidget(id, sys) {
  if (!sys) return;
  const cpuPct = Math.round(sys.cpu ? sys.cpu.percent : 0);
  const gpuPct = Math.round(sys.gpu ? sys.gpu.usage_percent : 0);
  const ramPct = Math.round(sys.ram ? sys.ram.percent : 0);
  const vramPct = Math.round(sys.gpu ? sys.gpu.vram_percent : 0);

  let maxDiskPct = 0;
  if (sys.disks && sys.disks.length > 0) {
    maxDiskPct = Math.round(Math.max(...sys.disks.map((d) => d.usage_percent || 0)));
  }

  setWidth(document.getElementById(`${id}_cpu_bar`), `${cpuPct}%`);
  setText(document.getElementById(`${id}_cpu_val`), `${cpuPct}%`);

  setWidth(document.getElementById(`${id}_gpu_bar`), `${gpuPct}%`);
  setText(document.getElementById(`${id}_gpu_val`), `${gpuPct}%`);

  setWidth(document.getElementById(`${id}_ram_bar`), `${ramPct}%`);
  setText(document.getElementById(`${id}_ram_val`), `${ramPct}%`);

  setWidth(document.getElementById(`${id}_vram_bar`), `${vramPct}%`);
  setText(document.getElementById(`${id}_vram_val`), `${vramPct}%`);

  setWidth(document.getElementById(`${id}_disk_bar`), `${maxDiskPct}%`);
  setText(document.getElementById(`${id}_disk_val`), `${maxDiskPct}%`);

  if (sys.network) {
    setText(document.getElementById(`${id}_net_val`), `↓ ${sys.network.download}  ↑ ${sys.network.upload}`);
  }
}

function updateMediaWidget(id, media) {
  if (!media) return;
  const elCover = document.getElementById(`${id}_cover`);
  const elTitle = document.getElementById(`${id}_track_title`);
  const elArtist = document.getElementById(`${id}_track_artist`);

  const titleText = media.title || "Sin reproducción activa";
  setText(elTitle, titleText);

  const artistText = media.artist || "Esperando reproductor...";
  setText(elArtist, artistText);

  const elAppBadge = document.getElementById(`${id}_source_app`);
  if (elAppBadge && media.app_name) {
    setText(elAppBadge, media.app_name);
  }

  if (elCover) {
    if (media.thumbnail_base64) {
      if (elCover._lastThumb !== media.thumbnail_base64) {
        elCover._lastThumb = media.thumbnail_base64;
        elCover.src = `data:image/jpeg;base64,${media.thumbnail_base64}`;
      }
    } else if (!media.title || media.title === "Sin reproducción activa") {
      if (elCover._lastThumb !== "empty") {
        elCover._lastThumb = "empty";
        elCover.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' fill='%231f232d'><rect width='100' height='100'/><path fill='%23565d68' d='M50 35a15 15 0 100 30 15 15 0 000-30zm0 25a10 10 0 110-20 10 10 0 010 20z'/></svg>";
      }
    }
  }

  let isPlaying = Boolean(media && media.is_playing);
  if (Date.now() < mediaActionCooldownUntil && mediaOptimisticIsPlaying !== null) {
    if (isPlaying === mediaOptimisticIsPlaying) {
      mediaActionCooldownUntil = 0;
      mediaOptimisticIsPlaying = null;
    } else {
      isPlaying = mediaOptimisticIsPlaying;
    }
  }
  const card = document.getElementById(id);
  if (card) {
    const playIcons = card.querySelectorAll(".icon-play-state");
    playIcons.forEach((icon) => {
      if (icon._lastState !== isPlaying) {
        icon._lastState = isPlaying;
        if (isPlaying) {
          icon.innerHTML = `<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
        } else {
          icon.innerHTML = `<path fill="currentColor" d="M8 5v14l11-7z"/>`;
        }
      }
    });
  }
}

function updateAudioWidget(id, audio) {
  if (!audio) return;
  const card = document.getElementById(id);
  if (!card) return;

  const outputInfo = audio.output || { volume: audio.volume || 50, is_muted: audio.is_muted || false, devices: [] };
  const inputInfo = audio.input || { volume: 70, is_muted: false, devices: [] };

  // 1. Output Select
  const outSelect = document.getElementById(`${id}_output_select`);
  if (outSelect && document.activeElement !== outSelect) {
    const devices = outputInfo.devices || [];
    const currentId = outputInfo.device_id || "";
    const devKey = devices.map((d) => d.id).join(",") + `_${currentId}`;
    if (outSelect._lastDevKey !== devKey) {
      outSelect._lastDevKey = devKey;
      outSelect.innerHTML = "";
      if (devices.length === 0) {
        outSelect.innerHTML = `<option value="">${outputInfo.device_name || "Altavoces"}</option>`;
      } else {
        devices.forEach((d) => {
          const opt = document.createElement("option");
          opt.value = d.id;
          opt.textContent = d.name;
          if (d.id === currentId || (!currentId && d.name === outputInfo.device_name)) {
            opt.selected = true;
          }
          outSelect.appendChild(opt);
        });
      }
    }
  }

  // 2. Output Volume Slider & Text
  if (!isDraggingOutputVolume && Date.now() >= outputVolumeCooldownUntil) {
    const outRange = document.getElementById(`${id}_output_vol_range`);
    const outText = document.getElementById(`${id}_output_vol_text`);
    const outFill = document.getElementById(`${id}_output_range_fill`);
    const vol = Math.max(0, Math.min(100, outputInfo.volume !== undefined ? outputInfo.volume : 50));
    if (outRange && outRange.value != vol) outRange.value = vol;
    setText(outText, `${vol}%`);
    setWidth(outFill, `${vol}%`);
  }

  // 3. Output Mute Button
  const outMuteBtn = document.getElementById(`${id}_output_mute_btn`);
  if (outMuteBtn) {
    const isMuted = Boolean(outputInfo.is_muted || outputInfo.volume === 0);
    outMuteBtn.classList.toggle("is-muted", isMuted);
    const svg = outMuteBtn.querySelector(".audio-mute-svg");
    if (svg && svg._lastMuted !== isMuted) {
      svg._lastMuted = isMuted;
      if (isMuted) {
        svg.innerHTML = `<path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27l4.73 4.73H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
      } else {
        svg.innerHTML = `<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
      }
    }
  }

  // 4. Input Select
  const inSelect = document.getElementById(`${id}_input_select`);
  if (inSelect && document.activeElement !== inSelect) {
    const devices = inputInfo.devices || [];
    const currentId = inputInfo.device_id || "";
    const devKey = devices.map((d) => d.id).join(",") + `_${currentId}`;
    if (inSelect._lastDevKey !== devKey) {
      inSelect._lastDevKey = devKey;
      inSelect.innerHTML = "";
      if (devices.length === 0) {
        inSelect.innerHTML = `<option value="">${inputInfo.device_name || "Micrófono"}</option>`;
      } else {
        devices.forEach((d) => {
          const opt = document.createElement("option");
          opt.value = d.id;
          opt.textContent = d.name;
          if (d.id === currentId || (!currentId && d.name === inputInfo.device_name)) {
            opt.selected = true;
          }
          inSelect.appendChild(opt);
        });
      }
    }
  }

  // 5. Input Volume Slider & Text
  if (!isDraggingInputVolume && Date.now() >= inputVolumeCooldownUntil) {
    const inRange = document.getElementById(`${id}_input_vol_range`);
    const inText = document.getElementById(`${id}_input_vol_text`);
    const inFill = document.getElementById(`${id}_input_range_fill`);
    const vol = Math.max(0, Math.min(100, inputInfo.volume !== undefined ? inputInfo.volume : 70));
    if (inRange && inRange.value != vol) inRange.value = vol;
    setText(inText, `${vol}%`);
    setWidth(inFill, `${vol}%`);
  }

  // 6. Input Mute Button
  const inMuteBtn = document.getElementById(`${id}_input_mute_btn`);
  if (inMuteBtn) {
    const isMuted = Boolean(inputInfo.is_muted || inputInfo.volume === 0);
    inMuteBtn.classList.toggle("is-muted", isMuted);
  }
}

/* ==========================================================================
   AUDIO METER WIDGET (REAL-TIME VU & PEAK BARS)
   ========================================================================== */
let audioMeterInterval = null;
const audioMeterBallistics = {};

function applyMeterBallistics(stateKey, targetPct, now) {
  if (!audioMeterBallistics[stateKey]) {
    audioMeterBallistics[stateKey] = {
      currentLevel: targetPct,
      peakHold: targetPct,
      peakHoldTime: now
    };
  }
  const state = audioMeterBallistics[stateKey];

  // 1. Bar Level: Instant Attack & Smooth Exponential Decay
  if (targetPct >= state.currentLevel) {
    state.currentLevel = targetPct; // Instant rise to peak
  } else {
    // Smooth natural falloff
    const decay = Math.max(1.5, (state.currentLevel - targetPct) * 0.28);
    state.currentLevel = Math.max(targetPct, state.currentLevel - decay);
  }

  // 2. Peak Hold Marker: Holds peak for 850ms, then smoothly decays
  if (targetPct >= state.peakHold) {
    state.peakHold = targetPct;
    state.peakHoldTime = now;
  } else if (now - state.peakHoldTime > 850) {
    const peakDecay = Math.max(1.0, (state.peakHold - state.currentLevel) * 0.18);
    state.peakHold = Math.max(state.currentLevel, state.peakHold - peakDecay);
  }

  return {
    barPct: Math.min(100, Math.max(0, Math.round(state.currentLevel))),
    peakPct: Math.min(100, Math.max(0, Math.round(state.peakHold)))
  };
}

function updateAudioMeterWidget(id, levels) {
  if (!levels) return;
  const outFill = document.getElementById(`${id}_output_fill`);
  const outMarker = document.getElementById(`${id}_output_marker`);
  const outVal = document.getElementById(`${id}_output_val`);

  const inFill = document.getElementById(`${id}_input_fill`);
  const inMarker = document.getElementById(`${id}_input_marker`);
  const inVal = document.getElementById(`${id}_input_val`);

  const now = Date.now();
  const rawOut = Math.min(100, Math.max(0, levels.output_peak || 0));
  const rawIn = Math.min(100, Math.max(0, levels.input_peak || 0));

  const outB = applyMeterBallistics(`${id}_out`, rawOut, now);
  const inB = applyMeterBallistics(`${id}_in`, rawIn, now);

  const outDbEl = document.getElementById(`${id}_output_db`);
  const inDbEl = document.getElementById(`${id}_input_db`);

  if (outFill) outFill.style.clipPath = `inset(0 ${100 - outB.barPct}% 0 0 round 4px)`;
  if (outMarker) {
    outMarker.style.left = `${outB.peakPct}%`;
    outMarker.style.opacity = outB.peakPct > 0 ? "0.95" : "0";
  }
  if (outVal) setText(outVal, `${outB.barPct}%`);
  if (outDbEl) {
    if (outB.barPct === 0 || levels.output_db === undefined || levels.output_db <= -60) {
      setText(outDbEl, "-inf dB");
    } else {
      setText(outDbEl, `${Math.round(levels.output_db)} dB`);
    }
  }

  if (inFill) inFill.style.clipPath = `inset(0 ${100 - inB.barPct}% 0 0 round 4px)`;
  if (inMarker) {
    inMarker.style.left = `${inB.peakPct}%`;
    inMarker.style.opacity = inB.peakPct > 0 ? "0.95" : "0";
  }
  if (inVal) setText(inVal, `${inB.barPct}%`);
  if (inDbEl) {
    if (inB.barPct === 0 || levels.input_db === undefined || levels.input_db <= -60) {
      setText(inDbEl, "-inf dB");
    } else {
      setText(inDbEl, `${Math.round(levels.input_db)} dB`);
    }
  }
}

function startAudioMeterLoop(api) {
  if (audioMeterInterval) return;
  audioMeterInterval = setInterval(async () => {
    // Only poll if there's at least one audio_meter widget in the active layout
    const hasMeter = activeLayout.some((w) => w.type === "audio_meter");
    if (!hasMeter || !api || !api.get_audio_levels) return;
    try {
      const levels = await api.get_audio_levels();
      if (levels) {
        activeLayout.forEach((w) => {
          if (w.type === "audio_meter") {
            updateAudioMeterWidget(w.id, levels);
          }
        });
      }
    } catch (e) {
      // Ignore background audio loop errors
    }
  }, 50);
}

let mediaPollInterval = null;

function updateMediaWidgetFromData(media) {
  if (!media) return;
  if (!lastDashboardData) lastDashboardData = {};
  lastDashboardData.media = media;
  activeLayout.forEach((w) => {
    if (w.type === "media") {
      updateMediaWidget(w.id, media);
    }
  });
}

function startMediaLoop(api) {
  if (mediaPollInterval) return;
  mediaPollInterval = setInterval(async () => {
    // Only poll if there's at least one media widget in the active layout
    const hasMedia = activeLayout.some((w) => w.type === "media");
    if (!hasMedia || !api || !api.get_media_info) return;
    try {
      const media = await api.get_media_info();
      if (media) {
        updateMediaWidgetFromData(media);
      }
    } catch (e) {
      // Ignore background media loop errors
    }
  }, 250);
}

function updateWeatherUi(w) {
  if (!w) return;
  const elTemp = document.getElementById("weather-temp");
  const elCity = document.getElementById("weather-city");
  const elDesc = document.getElementById("weather-desc");
  const elIcon = document.getElementById("weather-icon");

  if (elTemp && w.temp !== undefined) setText(elTemp, `${w.temp}°C`);
  if (elCity && w.city) setText(elCity, w.city);
  if (elDesc && w.description) {
    const descText = w.last_update ? `${w.description} • ${w.last_update}` : w.description;
    setText(elDesc, descText);
  }
  if (elIcon && w.icon) {
    if (elIcon._lastIcon !== w.icon) {
      elIcon._lastIcon = w.icon;
      elIcon.innerHTML = getWeatherSvg(w.icon);
    }
  }
}

/* ==========================================================================
   SHORTCUT MODAL CONTROLLER (2-STEP WIZARD)
   ========================================================================== */
let shortcutModalWidget = null;
let shortcutTempState = {
  target: "",
  is_local: false,
  extractedIcon: null,
  customImage: null,
  title: "",
  mode: "image"
};

function openShortcutModal(widget) {
  shortcutModalWidget = widget;
  shortcutTempState = {
    target: widget.target || "",
    is_local: false,
    extractedIcon: null,
    customImage: null,
    title: widget.title || "",
    mode: widget.mode || "image"
  };

  const overlay = document.getElementById("shortcut-modal-overlay");
  if (!overlay) return;

  // Reset to Step 1 (only title + target + next)
  const step1 = document.getElementById("shortcut-step-1");
  const step2 = document.getElementById("shortcut-step-2");
  if (step1) step1.style.display = "block";
  if (step2) step2.style.display = "none";

  const inputTarget = document.getElementById("shortcut-input-target");
  if (inputTarget) {
    inputTarget.value = widget.target || "";
    setTimeout(() => inputTarget.focus(), 50);
  }

  overlay.style.display = "flex";
}

function closeShortcutModal() {
  shortcutModalWidget = null;
  const overlay = document.getElementById("shortcut-modal-overlay");
  if (overlay) overlay.style.display = "none";
}

async function handleShortcutNextStep() {
  const inputTarget = document.getElementById("shortcut-input-target");
  const target = (inputTarget ? inputTarget.value : "").trim();
  if (!target) {
    if (inputTarget) inputTarget.focus();
    return;
  }

  shortcutTempState.target = target;

  const btnNext = document.getElementById("btn-shortcut-next");
  if (btnNext) {
    btnNext.textContent = "Cargando...";
    btnNext.disabled = true;
  }

  let resolved = { is_local: false, icon: null, default_name: "" };
  try {
    if (apiBridge && apiBridge.resolve_shortcut_target) {
      resolved = await apiBridge.resolve_shortcut_target(target);
    }
  } catch (err) {
    console.warn("Could not resolve shortcut target:", err);
  } finally {
    if (btnNext) {
      btnNext.textContent = "Siguiente →";
      btnNext.disabled = false;
    }
  }

  shortcutTempState.is_local = Boolean(resolved.is_local);
  shortcutTempState.extractedIcon = resolved.icon || null;

  // Switch to Step 2
  const step1 = document.getElementById("shortcut-step-1");
  const step2 = document.getElementById("shortcut-step-2");
  if (step1) step1.style.display = "none";
  if (step2) step2.style.display = "block";

  const blockLocal = document.getElementById("step2-local-options");
  const blockWeb = document.getElementById("step2-web-options");
  const inputTitle = document.getElementById("shortcut-input-title");

  if (shortcutTempState.is_local) {
    // Show Local options, hide Web options
    if (blockLocal) blockLocal.style.display = "flex";
    if (blockWeb) blockWeb.style.display = "none";

    const previewBox = document.getElementById("local-icon-preview-box");
    const imgThumb = document.getElementById("shortcut-extracted-img");
    const statusText = document.getElementById("shortcut-icon-status-text");

    const iconToShow = shortcutTempState.customImage || resolved.icon || (shortcutModalWidget && shortcutModalWidget.image);
    if (iconToShow && previewBox && imgThumb) {
      imgThumb.src = iconToShow;
      previewBox.style.display = "flex";
      if (statusText) statusText.textContent = resolved.icon ? "Icono detectado automáticamente" : "Imagen personalizada";
    } else if (previewBox) {
      previewBox.style.display = "none";
    }

    const radioAuto = document.getElementById("radio-local-auto-icon");
    const radioText = document.getElementById("radio-local-text");
    if (shortcutModalWidget && shortcutModalWidget.mode === "text") {
      if (radioText) radioText.checked = true;
    } else {
      if (radioAuto) radioAuto.checked = true;
    }

    if (inputTitle) {
      inputTitle.value = (shortcutModalWidget && shortcutModalWidget.title) || resolved.default_name || "";
    }
  } else {
    // Show Web options, hide Local options
    if (blockLocal) blockLocal.style.display = "none";
    if (blockWeb) blockWeb.style.display = "flex";

    const radioImage = document.getElementById("radio-web-image");
    const radioText = document.getElementById("radio-web-text");
    if (shortcutModalWidget && shortcutModalWidget.mode === "text") {
      if (radioText) radioText.checked = true;
    } else {
      if (radioImage) radioImage.checked = true;
    }

    const inputWebImage = document.getElementById("shortcut-input-web-image");
    if (inputWebImage) {
      inputWebImage.value = (shortcutModalWidget && shortcutModalWidget.image) || "";
    }

    updateWebImageSectionVisibility();

    if (inputTitle) {
      inputTitle.value = (shortcutModalWidget && shortcutModalWidget.title) || resolved.default_name || "";
    }
  }
}

function handleShortcutBackStep() {
  const step1 = document.getElementById("shortcut-step-1");
  const step2 = document.getElementById("shortcut-step-2");
  if (step1) step1.style.display = "block";
  if (step2) step2.style.display = "none";
}

function updateWebImageSectionVisibility() {
  const radioImage = document.getElementById("radio-web-image");
  const block = document.getElementById("web-image-input-block");
  if (block) {
    block.style.display = (radioImage && radioImage.checked) ? "block" : "none";
  }
}

async function handleShortcutFinish() {
  if (!shortcutModalWidget) return;

  const target = shortcutTempState.target || (document.getElementById("shortcut-input-target") || {}).value || "";
  const inputTitle = document.getElementById("shortcut-input-title");
  const title = inputTitle ? inputTitle.value.trim() : "";

  let mode = "image";
  let image = "";

  if (shortcutTempState.is_local) {
    const radioText = document.getElementById("radio-local-text");
    if (radioText && radioText.checked) {
      mode = "text";
      image = "";
    } else {
      mode = "image";
      image = shortcutTempState.customImage || shortcutTempState.extractedIcon || (shortcutModalWidget && shortcutModalWidget.image) || "";
    }
  } else {
    const radioText = document.getElementById("radio-web-text");
    if (radioText && radioText.checked) {
      mode = "text";
      image = "";
    } else {
      mode = "image";
      const inputWebImg = document.getElementById("shortcut-input-web-image");
      image = inputWebImg ? inputWebImg.value.trim() : "";
    }
  }

  // Update layout entry
  const w = activeLayout.find((item) => item.id === shortcutModalWidget.id);
  if (w) {
    w.target = target;
    w.mode = mode;
    w.image = image;
    w.title = title;
  }

  closeShortcutModal();
  renderGrid();

  if (apiBridge && currentDesignsData.active_design) {
    await apiBridge.save_design(currentDesignsData.active_design, activeLayout, currentGridSize);
  }
}

function setupShortcutModal() {
  // Close buttons
  const btnClose = document.getElementById("btn-close-shortcut-modal");
  const overlay = document.getElementById("shortcut-modal-overlay");
  if (btnClose) btnClose.addEventListener("click", closeShortcutModal);
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeShortcutModal();
    });
  }

  // Step 1: Browse PC file dialog
  const btnBrowseTarget = document.getElementById("btn-browse-target");
  if (btnBrowseTarget) {
    btnBrowseTarget.addEventListener("click", async () => {
      if (!apiBridge) return;
      const filePath = await apiBridge.select_file_dialog();
      if (filePath) {
        const inputTarget = document.getElementById("shortcut-input-target");
        if (inputTarget) inputTarget.value = filePath;
      }
    });
  }

  // Step 1: Next button
  const btnNext = document.getElementById("btn-shortcut-next");
  if (btnNext) btnNext.addEventListener("click", handleShortcutNextStep);

  // Step 1: Pressing Enter in target input goes to next step
  const inputTarget = document.getElementById("shortcut-input-target");
  if (inputTarget) {
    inputTarget.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleShortcutNextStep();
      }
    });
  }

  // Step 2: Back button
  const btnBack = document.getElementById("btn-shortcut-back");
  if (btnBack) btnBack.addEventListener("click", handleShortcutBackStep);

  // Step 2: Finish button
  const btnFinish = document.getElementById("btn-shortcut-finish");
  if (btnFinish) btnFinish.addEventListener("click", handleShortcutFinish);

  // Step 2: Change local image
  const btnChangeLocal = document.getElementById("btn-change-local-image");
  if (btnChangeLocal) {
    btnChangeLocal.addEventListener("click", async () => {
      if (!apiBridge) return;
      const filePath = await apiBridge.select_image_dialog();
      if (filePath) {
        const dataUri = await apiBridge.read_image_data(filePath);
        if (dataUri) {
          shortcutTempState.customImage = dataUri;
          const imgThumb = document.getElementById("shortcut-extracted-img");
          if (imgThumb) imgThumb.src = dataUri;
          const statusText = document.getElementById("shortcut-icon-status-text");
          if (statusText) statusText.textContent = "Imagen personalizada elegida";
        }
      }
    });
  }

  // Step 2: Web image browse button
  const btnBrowseWebImage = document.getElementById("btn-browse-web-image");
  if (btnBrowseWebImage) {
    btnBrowseWebImage.addEventListener("click", async () => {
      if (!apiBridge) return;
      const filePath = await apiBridge.select_image_dialog();
      if (filePath) {
        const dataUri = await apiBridge.read_image_data(filePath);
        if (dataUri) {
          const inputWebImg = document.getElementById("shortcut-input-web-image");
          if (inputWebImg) inputWebImg.value = dataUri;
        }
      }
    });
  }

  // Step 2: Web radio toggle
  const radioWebImage = document.getElementById("radio-web-image");
  const radioWebText = document.getElementById("radio-web-text");
  if (radioWebImage) radioWebImage.addEventListener("change", updateWebImageSectionVisibility);
  if (radioWebText) radioWebText.addEventListener("change", updateWebImageSectionVisibility);
}

/* ==========================================================================
   CATALOG CATEGORY FILTERS
   ========================================================================== */
function setupCatalogCategoryFilters() {
  const filterBar = document.getElementById("drawer-category-filter");
  if (!filterBar) return;
  const filterBtns = filterBar.querySelectorAll(".drawer-cat-btn");
  const catalogList = document.getElementById("drawer-catalog-list");
  if (!catalogList) return;

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const filter = btn.getAttribute("data-filter");
      const items = catalogList.querySelectorAll(".catalog-item");
      items.forEach((item) => {
        const cat = item.getAttribute("data-category");
        if (filter === "all" || cat === filter) {
          item.style.display = "";
        } else {
          item.style.display = "none";
        }
      });
    });
  });
}

/* ==========================================================================
   INTERACTIVE UTILITIES & PRODUCTIVITY WIDGETS
   ========================================================================== */

// 1. CRONÓMETRO (STOPWATCH)
const stopwatchStates = {};

function initStopwatch(id) {
  if (!stopwatchStates[id]) {
    stopwatchStates[id] = { startTime: 0, elapsed: 0, isRunning: false, intervalId: null };
  }
  const state = stopwatchStates[id];
  const card = document.getElementById(id);
  if (!card) return;

  const display = document.getElementById(`${id}_display`);
  const btnStart = document.getElementById(`${id}_btn_start`);
  const btnReset = document.getElementById(`${id}_btn_reset`);
  const iconPlay = btnStart ? btnStart.querySelector(".sw-icon-play") : null;
  const iconPause = btnStart ? btnStart.querySelector(".sw-icon-pause") : null;

  function formatTime(ms) {
    const totalTenths = Math.floor(ms / 100);
    const tenths = totalTenths % 10;
    const totalSecs = Math.floor(ms / 1000);
    const secs = totalSecs % 60;
    const mins = Math.floor(totalSecs / 60);
    const mStr = String(mins).padStart(2, "0");
    const sStr = String(secs).padStart(2, "0");
    return `${mStr}:${sStr}<span class="stopwatch-millis">.${tenths}</span>`;
  }

  function updateDisplay() {
    if (display) display.innerHTML = formatTime(state.elapsed);
  }

  updateDisplay();
  if (state.isRunning) {
    if (btnStart) btnStart.classList.add("running");
    if (iconPlay) iconPlay.style.display = "none";
    if (iconPause) iconPause.style.display = "inline-block";
  }

  if (btnStart) {
    btnStart.onclick = (e) => {
      e.stopPropagation();
      if (isEditMode) return;
      if (!state.isRunning) {
        state.startTime = Date.now() - state.elapsed;
        state.isRunning = true;
        btnStart.classList.add("running");
        if (iconPlay) iconPlay.style.display = "none";
        if (iconPause) iconPause.style.display = "inline-block";
        state.intervalId = setInterval(() => {
          state.elapsed = Date.now() - state.startTime;
          updateDisplay();
        }, 50);
      } else {
        state.isRunning = false;
        clearInterval(state.intervalId);
        btnStart.classList.remove("running");
        if (iconPlay) iconPlay.style.display = "inline-block";
        if (iconPause) iconPause.style.display = "none";
      }
    };
  }

  if (btnReset) {
    btnReset.onclick = (e) => {
      e.stopPropagation();
      if (isEditMode) return;
      state.isRunning = false;
      clearInterval(state.intervalId);
      state.elapsed = 0;
      updateDisplay();
      if (btnStart) btnStart.classList.remove("running");
      if (iconPlay) iconPlay.style.display = "inline-block";
      if (iconPause) iconPause.style.display = "none";
    };
  }
}

// 2. TEMPORIZADOR (TIMER)
const timerStates = {};

function initTimer(id) {
  if (!timerStates[id]) {
    timerStates[id] = { totalSecs: 300, remainingSecs: 300, isRunning: false, intervalId: null };
  }
  const state = timerStates[id];
  const card = document.getElementById(id);
  if (!card) return;

  const display = document.getElementById(`${id}_display`);
  const btnStart = document.getElementById(`${id}_btn_start`);
  const btnReset = document.getElementById(`${id}_btn_reset`);
  const btnCfg = document.getElementById(`${id}_btn_cfg`);
  const displayBox = document.getElementById(`${id}_display_box`);
  const iconPlay = btnStart ? btnStart.querySelector(".tm-icon-play") : null;
  const iconPause = btnStart ? btnStart.querySelector(".tm-icon-pause") : null;

  function formatTime(s) {
    const days = Math.floor(s / 86400);
    const remD = s % 86400;
    const hours = Math.floor(remD / 3600);
    const mins = Math.floor((remD % 3600) / 60);
    const secs = remD % 60;
    if (days > 0) {
      return `${days}d ${hours}h ${String(mins).padStart(2, "0")}m`;
    }
    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function updateDisplay() {
    if (display) display.textContent = formatTime(state.remainingSecs);
  }

  updateDisplay();
  if (state.isRunning) {
    if (btnStart) btnStart.classList.add("running");
    if (iconPlay) iconPlay.style.display = "none";
    if (iconPause) iconPause.style.display = "inline-block";
  }

  if (btnCfg) {
    btnCfg.onclick = (e) => {
      e.stopPropagation();
      openTimerModal(id);
    };
  }

  if (displayBox) {
    displayBox.onclick = (e) => {
      e.stopPropagation();
      openTimerModal(id);
    };
  }

  if (btnStart) {
    btnStart.onclick = (e) => {
      e.stopPropagation();
      if (isEditMode) return;
      card.classList.remove("alarm-active");
      if (!state.isRunning) {
        if (state.remainingSecs <= 0) state.remainingSecs = state.totalSecs || 300;
        state.isRunning = true;
        btnStart.classList.add("running");
        if (iconPlay) iconPlay.style.display = "none";
        if (iconPause) iconPause.style.display = "inline-block";
        state.intervalId = setInterval(() => {
          state.remainingSecs--;
          if (state.remainingSecs <= 0) {
            state.remainingSecs = 0;
            state.isRunning = false;
            clearInterval(state.intervalId);
            btnStart.classList.remove("running");
            if (iconPlay) iconPlay.style.display = "inline-block";
            if (iconPause) iconPause.style.display = "none";
            card.classList.add("alarm-active");
            if (apiBridge && apiBridge.beep_timer) apiBridge.beep_timer();
          }
          updateDisplay();
        }, 1000);
      } else {
        state.isRunning = false;
        clearInterval(state.intervalId);
        btnStart.classList.remove("running");
        if (iconPlay) iconPlay.style.display = "inline-block";
        if (iconPause) iconPause.style.display = "none";
      }
    };
  }

  if (btnReset) {
    btnReset.onclick = (e) => {
      e.stopPropagation();
      if (isEditMode) return;
      state.isRunning = false;
      clearInterval(state.intervalId);
      state.remainingSecs = state.totalSecs || 300;
      card.classList.remove("alarm-active");
      updateDisplay();
      if (btnStart) btnStart.classList.remove("running");
      if (iconPlay) iconPlay.style.display = "inline-block";
      if (iconPause) iconPause.style.display = "none";
    };
  }
}

// 3. BLOC DE NOTAS & TAREAS (NOTES & TASKS)
let appNotesCache = null;
let activeNoteId = null;

async function loadNotesFromBackend() {
  if (appNotesCache !== null) return appNotesCache;
  try {
    if (apiBridge && apiBridge.get_notes) {
      appNotesCache = await apiBridge.get_notes();
    }
  } catch (e) {
    console.warn("Could not load notes:", e);
  }
  if (!Array.isArray(appNotesCache) || appNotesCache.length === 0) {
    appNotesCache = [
      {
        id: "note_" + Date.now(),
        title: "Mis Tareas",
        mode: "tasks",
        body: "",
        tasks: [
          { id: 1, text: "Configurar mi nuevo panel", done: true },
          { id: 2, text: "Personalizar widgets y fotos", done: false }
        ]
      }
    ];
  }
  return appNotesCache;
}

async function saveNotesToBackend() {
  if (apiBridge && apiBridge.save_notes && appNotesCache) {
    await apiBridge.save_notes(appNotesCache);
  }
}

async function initNotesWidget(id) {
  const card = document.getElementById(id);
  if (!card) return;
  const notes = await loadNotesFromBackend();

  if (!activeNoteId || !notes.some(n => n.id === activeNoteId)) {
    activeNoteId = notes[0] ? notes[0].id : null;
  }

  const listEl = document.getElementById(`${id}_notes_list`);
  const titleInput = document.getElementById(`${id}_note_title`);
  const modeTextBtn = document.getElementById(`${id}_mode_text`);
  const modeTasksBtn = document.getElementById(`${id}_mode_tasks`);
  const viewText = document.getElementById(`${id}_view_text`);
  const viewTasks = document.getElementById(`${id}_view_tasks`);
  const noteBody = document.getElementById(`${id}_note_body`);
  const taskInput = document.getElementById(`${id}_task_input`);
  const btnAddTask = document.getElementById(`${id}_btn_add_task`);
  const tasksList = document.getElementById(`${id}_tasks_list`);
  const btnNewNote = document.getElementById(`${id}_btn_new`);
  const btnDeleteNote = document.getElementById(`${id}_btn_delete_note`);

  function renderNotesSidebar() {
    if (!listEl) return;
    listEl.innerHTML = "";
    notes.forEach((n) => {
      const item = document.createElement("div");
      item.className = `note-sidebar-item ${n.id === activeNoteId ? "active" : ""}`;
      const snippet = n.mode === "tasks" ? `${(n.tasks || []).filter(t => t.done).length}/${(n.tasks || []).length} hechas` : (n.body ? n.body.slice(0, 24) : "Sin texto");
      item.innerHTML = `
        <span class="note-item-title">${n.title || "Sin título"}</span>
        <span class="note-item-snippet">${snippet}</span>
      `;
      item.onclick = (e) => {
        e.stopPropagation();
        activeNoteId = n.id;
        renderNotesSidebar();
        renderActiveEditor();
      };
      listEl.appendChild(item);
    });
  }

  function renderTasks() {
    const cur = notes.find((n) => n.id === activeNoteId);
    if (!tasksList || !cur) return;
    tasksList.innerHTML = "";
    (cur.tasks || []).forEach((t, idx) => {
      const row = document.createElement("div");
      row.className = "task-item-row";
      row.innerHTML = `
        <input type="checkbox" class="task-checkbox" ${t.done ? "checked" : ""}>
        <span class="task-text">${t.text}</span>
        <button type="button" class="task-btn-delete" title="Borrar">✕</button>
      `;
      const chk = row.querySelector(".task-checkbox");
      chk.onchange = (e) => {
        e.stopPropagation();
        t.done = chk.checked;
        saveNotesToBackend();
        renderNotesSidebar();
      };
      const del = row.querySelector(".task-btn-delete");
      del.onclick = (e) => {
        e.stopPropagation();
        cur.tasks.splice(idx, 1);
        saveNotesToBackend();
        renderTasks();
        renderNotesSidebar();
      };
      tasksList.appendChild(row);
    });
  }

  function renderActiveEditor() {
    const cur = notes.find((n) => n.id === activeNoteId);
    if (!cur) return;
    if (titleInput) titleInput.value = cur.title || "";
    if (noteBody) noteBody.value = cur.body || "";

    if (cur.mode === "tasks") {
      if (modeTasksBtn) modeTasksBtn.classList.add("active");
      if (modeTextBtn) modeTextBtn.classList.remove("active");
      if (viewText) viewText.style.display = "none";
      if (viewTasks) viewTasks.style.display = "flex";
      renderTasks();
    } else {
      if (modeTextBtn) modeTextBtn.classList.add("active");
      if (modeTasksBtn) modeTasksBtn.classList.remove("active");
      if (viewText) viewText.style.display = "flex";
      if (viewTasks) viewTasks.style.display = "none";
    }
  }

  renderNotesSidebar();
  renderActiveEditor();

  if (titleInput) {
    titleInput.oninput = () => {
      const cur = notes.find((n) => n.id === activeNoteId);
      if (cur) {
        cur.title = titleInput.value;
        saveNotesToBackend();
        renderNotesSidebar();
      }
    };
  }

  if (noteBody) {
    let debounce = null;
    noteBody.oninput = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const cur = notes.find((n) => n.id === activeNoteId);
        if (cur) {
          cur.body = noteBody.value;
          saveNotesToBackend();
          renderNotesSidebar();
        }
      }, 350);
    };
  }

  if (modeTextBtn) {
    modeTextBtn.onclick = (e) => {
      e.stopPropagation();
      const cur = notes.find((n) => n.id === activeNoteId);
      if (cur) {
        cur.mode = "text";
        saveNotesToBackend();
        renderActiveEditor();
      }
    };
  }

  if (modeTasksBtn) {
    modeTasksBtn.onclick = (e) => {
      e.stopPropagation();
      const cur = notes.find((n) => n.id === activeNoteId);
      if (cur) {
        cur.mode = "tasks";
        saveNotesToBackend();
        renderActiveEditor();
      }
    };
  }

  function handleAddTask() {
    if (!taskInput) return;
    const txt = taskInput.value.trim();
    if (!txt) return;
    const cur = notes.find((n) => n.id === activeNoteId);
    if (cur) {
      if (!Array.isArray(cur.tasks)) cur.tasks = [];
      cur.tasks.push({ id: Date.now(), text: txt, done: false });
      taskInput.value = "";
      saveNotesToBackend();
      renderTasks();
      renderNotesSidebar();
    }
  }

  if (btnAddTask) btnAddTask.onclick = handleAddTask;
  if (taskInput) {
    taskInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddTask();
      }
    };
  }

  if (btnNewNote) {
    btnNewNote.onclick = (e) => {
      e.stopPropagation();
      const newNote = {
        id: "note_" + Date.now(),
        title: "Nueva Nota",
        mode: "text",
        body: "",
        tasks: []
      };
      notes.unshift(newNote);
      activeNoteId = newNote.id;
      saveNotesToBackend();
      renderNotesSidebar();
      renderActiveEditor();
      if (titleInput) {
        titleInput.focus();
        titleInput.select();
      }
    };
  }

  if (btnDeleteNote) {
    btnDeleteNote.onclick = (e) => {
      e.stopPropagation();
      if (notes.length <= 1) {
        alert("Debes conservar al menos una nota.");
        return;
      }
      const idx = notes.findIndex((n) => n.id === activeNoteId);
      if (idx !== -1) {
        notes.splice(idx, 1);
        activeNoteId = notes[0].id;
        saveNotesToBackend();
        renderNotesSidebar();
        renderActiveEditor();
      }
    };
  }
}

// 4. MARCOS DE FOTOS (PHOTO FRAMES 2x2, 2x3, 3x2)
function initPhotoWidget(widget) {
  const card = document.getElementById(widget.id);
  if (!card) return;
  const editBtn = card.querySelector(".btn-photo-change");
  if (editBtn) {
    editBtn.onclick = (e) => {
      e.stopPropagation();
      openPhotoModal(widget);
    };
  }
  const placeholder = card.querySelector(".photo-placeholder");
  if (placeholder) {
    placeholder.onclick = (e) => {
      e.stopPropagation();
      openPhotoModal(widget);
    };
  }
}

// 5. SLIDESHOW DE FOTOS
const slideshowStates = {};

async function initSlideshowWidget(widget) {
  const id = widget.id;
  const card = document.getElementById(id);
  if (!card) return;

  if (!slideshowStates[id]) {
    let cfg = { images: [], interval: 10 };
    if (apiBridge && apiBridge.get_slideshow_config) {
      try {
        cfg = await apiBridge.get_slideshow_config(id);
      } catch (e) {}
    }
    slideshowStates[id] = {
      images: cfg.images || [],
      interval: cfg.interval || 10,
      index: 0,
      isPaused: false,
      timer: null
    };
  }

  const state = slideshowStates[id];
  const slide = document.getElementById(`${id}_slide`);
  const hint = document.getElementById(`${id}_empty_hint`);
  const counter = document.getElementById(`${id}_counter`);
  const btnPrev = document.getElementById(`${id}_btn_prev`);
  const btnNext = document.getElementById(`${id}_btn_next`);
  const btnToggle = document.getElementById(`${id}_btn_toggle`);
  const btnInterval = document.getElementById(`${id}_btn_interval`);
  const btnConfig = card.querySelector(".btn-slideshow-config");

  const INTERVAL_PRESETS = [
    { secs: 5, label: "5s" },
    { secs: 10, label: "10s" },
    { secs: 30, label: "30s" },
    { secs: 60, label: "1m" },
    { secs: 300, label: "5m" }
  ];

  function getIntervalLabel(secs) {
    const p = INTERVAL_PRESETS.find((x) => x.secs === secs);
    return p ? p.label : `${secs}s`;
  }

  function updateIntervalButton() {
    if (btnInterval) {
      btnInterval.textContent = getIntervalLabel(state.interval);
      btnInterval.title = `Frecuencia de rotación: ${getIntervalLabel(state.interval)} (clic para alternar: 5s, 10s, 30s, 1m, 5m)`;
    }
  }

  state.updateIntervalButton = updateIntervalButton;
  updateIntervalButton();

  function showSlide(idx) {
    if (!state.images || state.images.length === 0) {
      if (slide) slide.style.backgroundImage = "none";
      if (hint) hint.style.display = "flex";
      if (counter) counter.textContent = "0 / 0";
      return;
    }
    if (hint) hint.style.display = "none";
    state.index = (idx + state.images.length) % state.images.length;
    if (slide) {
      slide.style.opacity = 0;
      setTimeout(() => {
        slide.style.backgroundImage = `url('${state.images[state.index]}')`;
        slide.style.opacity = 1;
      }, 150);
    }
    if (counter) counter.textContent = `${state.index + 1} / ${state.images.length}`;
  }

  function resetTimer() {
    clearInterval(state.timer);
    if (!state.isPaused && state.images.length > 1) {
      state.timer = setInterval(() => {
        showSlide(state.index + 1);
      }, state.interval * 1000);
    }
  }

  state.showSlide = showSlide;
  state.resetTimer = resetTimer;

  showSlide(state.index);
  resetTimer();

  if (btnPrev) {
    btnPrev.onclick = (e) => {
      e.stopPropagation();
      showSlide(state.index - 1);
      resetTimer();
    };
  }
  if (btnNext) {
    btnNext.onclick = (e) => {
      e.stopPropagation();
      showSlide(state.index + 1);
      resetTimer();
    };
  }
  if (btnToggle) {
    btnToggle.onclick = (e) => {
      e.stopPropagation();
      state.isPaused = !state.isPaused;
      btnToggle.textContent = state.isPaused ? "▶" : "⏸";
      resetTimer();
    };
  }
  if (btnInterval) {
    btnInterval.onclick = (e) => {
      e.stopPropagation();
      const currentIndex = INTERVAL_PRESETS.findIndex((x) => x.secs === state.interval);
      const nextIndex = (currentIndex + 1) % INTERVAL_PRESETS.length;
      state.interval = INTERVAL_PRESETS[nextIndex].secs;
      updateIntervalButton();

      if (apiBridge && apiBridge.save_slideshow_config) {
        apiBridge.save_slideshow_config(id, { images: state.images, interval: state.interval });
      }
      resetTimer();
    };
  }
  if (hint) {
    hint.onclick = (e) => {
      e.stopPropagation();
      openSlideshowModal(id);
    };
  }
  const btnAlbum = document.getElementById(`${id}_btn_album`);
  if (btnAlbum) {
    btnAlbum.onclick = (e) => {
      e.stopPropagation();
      openSlideshowModal(id);
    };
  }
  if (btnConfig) {
    btnConfig.onclick = (e) => {
      e.stopPropagation();
      openSlideshowModal(id);
    };
  }
}

// 6. CALCULADORA (CALCULATOR)
const calcStates = {};

function initCalculator(id) {
  if (!calcStates[id]) {
    calcStates[id] = { expr: "", current: "0", op: null, prev: null, resetNext: false };
  }
  const state = calcStates[id];
  const card = document.getElementById(id);
  if (!card) return;

  const resEl = document.getElementById(`${id}_calc_result`);
  const histEl = document.getElementById(`${id}_calc_history`);
  const btnCopy = document.getElementById(`${id}_calc_copy`);

  function updateScreen() {
    if (resEl) resEl.textContent = state.current;
    if (histEl) histEl.textContent = state.expr || "\u00A0";
  }

  function compute(a, b, op) {
    switch (op) {
      case "add": return a + b;
      case "sub": return a - b;
      case "mul": return a * b;
      case "div": return b === 0 ? "Error" : a / b;
      default: return b;
    }
  }

  card.querySelectorAll(".calc-key").forEach((key) => {
    key.onclick = (e) => {
      e.stopPropagation();
      if (isEditMode) return;

      const num = key.getAttribute("data-num");
      const action = key.getAttribute("data-action");

      if (num !== null) {
        if (state.current === "0" || state.resetNext) {
          state.current = num;
          state.resetNext = false;
        } else {
          state.current += num;
        }
        updateScreen();
        return;
      }

      if (action === "dot") {
        if (state.resetNext) {
          state.current = "0.";
          state.resetNext = false;
        } else if (!state.current.includes(".")) {
          state.current += ".";
        }
        updateScreen();
      } else if (action === "clear") {
        state.current = "0";
        state.expr = "";
        state.prev = null;
        state.op = null;
        state.resetNext = false;
        updateScreen();
      } else if (action === "sign") {
        if (state.current !== "0" && state.current !== "Error") {
          state.current = state.current.startsWith("-") ? state.current.slice(1) : "-" + state.current;
          updateScreen();
        }
      } else if (action === "percent") {
        const val = parseFloat(state.current);
        if (!isNaN(val)) {
          state.current = String(val / 100);
          updateScreen();
        }
      } else if (["add", "sub", "mul", "div"].includes(action)) {
        const val = parseFloat(state.current);
        if (state.op && !state.resetNext) {
          const res = compute(state.prev, val, state.op);
          state.current = String(res);
          state.prev = res;
        } else {
          state.prev = val;
        }
        const sym = action === "add" ? "+" : action === "sub" ? "−" : action === "mul" ? "×" : "÷";
        state.op = action;
        state.expr = `${state.current} ${sym}`;
        state.resetNext = true;
        updateScreen();
      } else if (action === "equals") {
        if (state.op && state.prev !== null) {
          const val = parseFloat(state.current);
          const sym = state.op === "add" ? "+" : state.op === "sub" ? "−" : state.op === "mul" ? "×" : "÷";
          state.expr = `${state.prev} ${sym} ${val} =`;
          const res = compute(state.prev, val, state.op);
          state.current = String(res);
          state.prev = null;
          state.op = null;
          state.resetNext = true;
          updateScreen();
        }
      }
    };
  });

  if (btnCopy) {
    btnCopy.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(state.current).then(() => {
        btnCopy.textContent = "✓";
        setTimeout(() => { btnCopy.textContent = "📋"; }, 1000);
      });
    };
  }
}

// 7. CONVERSOR DE DIVISAS (CURRENCY)
let appCurrencyRates = null;

async function initCurrencyWidget(id) {
  const card = document.getElementById(id);
  if (!card) return;

  const amtInput = document.getElementById(`${id}_cur_amount`);
  const fromSel = document.getElementById(`${id}_cur_from`);
  const toSel = document.getElementById(`${id}_cur_to`);
  const resEl = document.getElementById(`${id}_cur_result`);
  const rateLabel = document.getElementById(`${id}_cur_rate_label`);
  const swapBtn = document.getElementById(`${id}_cur_swap`);

  if (!appCurrencyRates) {
    try {
      if (apiBridge && apiBridge.get_exchange_rates) {
        appCurrencyRates = await apiBridge.get_exchange_rates();
      }
    } catch (e) {
      console.warn("Could not get exchange rates:", e);
    }
  }

  function calculate() {
    const rates = appCurrencyRates || { EUR: 1, USD: 1.09, GBP: 0.86, JPY: 162.5, MXN: 18.5 };
    const amt = parseFloat(amtInput.value) || 0;
    const from = fromSel.value;
    const to = toSel.value;
    const rateFrom = rates[from] || 1;
    const rateTo = rates[to] || 1;
    const rate = rateTo / rateFrom;
    const converted = amt * rate;

    if (resEl) resEl.textContent = converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    if (rateLabel) rateLabel.textContent = `1 ${from} ≈ ${rate.toFixed(4)} ${to}`;
  }

  if (amtInput) amtInput.oninput = calculate;
  if (fromSel) fromSel.onchange = calculate;
  if (toSel) toSel.onchange = calculate;
  if (swapBtn) {
    swapBtn.onclick = (e) => {
      e.stopPropagation();
      const tmp = fromSel.value;
      fromSel.value = toSel.value;
      toSel.value = tmp;
      calculate();
    };
  }

  calculate();
}

// 8. CALENDARIO MENSUAL (CALENDAR)
const calendarStates = {};

function initCalendarWidget(id) {
  const now = new Date();
  if (!calendarStates[id]) {
    calendarStates[id] = { year: now.getFullYear(), month: now.getMonth() };
  }
  const state = calendarStates[id];
  const card = document.getElementById(id);
  if (!card) return;

  const titleEl = document.getElementById(`${id}_cal_title`);
  const gridEl = document.getElementById(`${id}_cal_grid`);
  const prevBtn = document.getElementById(`${id}_cal_prev`);
  const nextBtn = document.getElementById(`${id}_cal_next`);
  const todayBtn = document.getElementById(`${id}_cal_today`);

  const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  function renderCalendar() {
    if (titleEl) titleEl.textContent = `${MONTH_NAMES[state.month]} ${state.year}`;
    if (!gridEl) return;
    gridEl.innerHTML = "";

    const firstDayIndex = (new Date(state.year, state.month, 1).getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
    const daysInPrevMonth = new Date(state.year, state.month, 0).getDate();

    const todayDate = new Date();
    const isCurrentMonth = todayDate.getFullYear() === state.year && todayDate.getMonth() === state.month;

    // Previous month filler days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const cell = document.createElement("div");
      cell.className = "cal-day-cell other-month";
      cell.textContent = daysInPrevMonth - i;
      gridEl.appendChild(cell);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement("div");
      cell.className = "cal-day-cell";
      if (isCurrentMonth && day === todayDate.getDate()) {
        cell.classList.add("today");
      }
      cell.textContent = day;
      gridEl.appendChild(cell);
    }

    // Next month filler days (fill up to 35 or 42 cells)
    const totalCells = gridEl.children.length;
    const targetCount = totalCells <= 35 ? 35 : 42;
    for (let day = 1; day <= targetCount - totalCells; day++) {
      const cell = document.createElement("div");
      cell.className = "cal-day-cell other-month";
      cell.textContent = day;
      gridEl.appendChild(cell);
    }
  }

  renderCalendar();

  if (prevBtn) {
    prevBtn.onclick = (e) => {
      e.stopPropagation();
      state.month--;
      if (state.month < 0) {
        state.month = 11;
        state.year--;
      }
      renderCalendar();
    };
  }
  if (nextBtn) {
    nextBtn.onclick = (e) => {
      e.stopPropagation();
      state.month++;
      if (state.month > 11) {
        state.month = 0;
        state.year++;
      }
      renderCalendar();
    };
  }
  if (todayBtn) {
    todayBtn.onclick = (e) => {
      e.stopPropagation();
      state.year = now.getFullYear();
      state.month = now.getMonth();
      renderCalendar();
    };
  }
}

// 9. CONVERSOR DE UNIDADES (UNIT CONVERTER)
const UNIT_DEFINITIONS = {
  length: {
    name: "Longitud",
    units: {
      m: { name: "Metros (m)", toBase: 1 },
      km: { name: "Kilómetros (km)", toBase: 1000 },
      cm: { name: "Centímetros (cm)", toBase: 0.01 },
      mm: { name: "Milímetros (mm)", toBase: 0.001 },
      mi: { name: "Millas (mi)", toBase: 1609.34 },
      yd: { name: "Yardas (yd)", toBase: 0.9144 },
      ft: { name: "Pies (ft)", toBase: 0.3048 },
      in: { name: "Pulgadas (in)", toBase: 0.0254 }
    },
    defaultFrom: "m",
    defaultTo: "ft"
  },
  mass: {
    name: "Masa / Peso",
    units: {
      kg: { name: "Kilogramos (kg)", toBase: 1 },
      g: { name: "Gramos (g)", toBase: 0.001 },
      mg: { name: "Miligramos (mg)", toBase: 0.000001 },
      lb: { name: "Libras (lb)", toBase: 0.453592 },
      oz: { name: "Onzas (oz)", toBase: 0.0283495 }
    },
    defaultFrom: "kg",
    defaultTo: "lb"
  },
  temp: {
    name: "Temperatura",
    units: {
      C: { name: "Celsius (°C)" },
      F: { name: "Fahrenheit (°F)" },
      K: { name: "Kelvin (K)" }
    },
    defaultFrom: "C",
    defaultTo: "F"
  },
  speed: {
    name: "Velocidad",
    units: {
      kmh: { name: "km/h", toBase: 1 / 3.6 },
      ms: { name: "m/s", toBase: 1 },
      mph: { name: "mph", toBase: 0.44704 },
      kn: { name: "Nudos (kn)", toBase: 0.514444 }
    },
    defaultFrom: "kmh",
    defaultTo: "mph"
  },
  storage: {
    name: "Datos",
    units: {
      B: { name: "Bytes (B)", toBase: 1 },
      KB: { name: "Kilobytes (KB)", toBase: 1024 },
      MB: { name: "Megabytes (MB)", toBase: 1024 * 1024 },
      GB: { name: "Gigabytes (GB)", toBase: 1024 * 1024 * 1024 },
      TB: { name: "Terabytes (TB)", toBase: 1024 * 1024 * 1024 * 1024 }
    },
    defaultFrom: "GB",
    defaultTo: "MB"
  }
};

function initUnitConverter(id) {
  const card = document.getElementById(id);
  if (!card) return;

  const catSel = document.getElementById(`${id}_unit_cat`);
  const valFrom = document.getElementById(`${id}_unit_val_from`);
  const valTo = document.getElementById(`${id}_unit_val_to`);
  const selFrom = document.getElementById(`${id}_unit_from`);
  const selTo = document.getElementById(`${id}_unit_to`);

  function populateUnits() {
    const cat = catSel.value;
    const def = UNIT_DEFINITIONS[cat];
    if (!def) return;

    selFrom.innerHTML = "";
    selTo.innerHTML = "";
    Object.keys(def.units).forEach((u) => {
      const opt1 = document.createElement("option");
      opt1.value = u;
      opt1.textContent = def.units[u].name;
      selFrom.appendChild(opt1);

      const opt2 = document.createElement("option");
      opt2.value = u;
      opt2.textContent = def.units[u].name;
      selTo.appendChild(opt2);
    });

    selFrom.value = def.defaultFrom;
    selTo.value = def.defaultTo;
    convert();
  }

  function convert() {
    const cat = catSel.value;
    const def = UNIT_DEFINITIONS[cat];
    const val = parseFloat(valFrom.value);
    if (isNaN(val)) {
      valTo.value = "";
      return;
    }

    const uFrom = selFrom.value;
    const uTo = selTo.value;

    if (cat === "temp") {
      let celsius = val;
      if (uFrom === "F") celsius = (val - 32) * (5 / 9);
      else if (uFrom === "K") celsius = val - 273.15;

      let res = celsius;
      if (uTo === "F") res = celsius * (9 / 5) + 32;
      else if (uTo === "K") res = celsius + 273.15;

      valTo.value = Number(res.toFixed(4));
    } else {
      const base = val * def.units[uFrom].toBase;
      const res = base / def.units[uTo].toBase;
      valTo.value = Number(res.toFixed(6));
    }
  }

  if (catSel) catSel.onchange = populateUnits;
  if (valFrom) valFrom.oninput = convert;
  if (selFrom) selFrom.onchange = convert;
  if (selTo) selTo.onchange = convert;

  populateUnits();
}

// 10. TRADUCTOR DE TEXTO (TRANSLATOR)
function initTranslator(id) {
  const card = document.getElementById(id);
  if (!card) return;

  const selFrom = document.getElementById(`${id}_tr_from`);
  const selTo = document.getElementById(`${id}_tr_to`);
  const swapBtn = document.getElementById(`${id}_tr_swap`);
  const inputEl = document.getElementById(`${id}_tr_input`);
  const outputEl = document.getElementById(`${id}_tr_output`);
  const pasteBtn = document.getElementById(`${id}_tr_paste`);
  const copyBtn = document.getElementById(`${id}_tr_copy`);
  const doBtn = document.getElementById(`${id}_tr_btn_do`);

  async function translate() {
    const text = inputEl.value.trim();
    if (!text) {
      outputEl.value = "";
      return;
    }
    outputEl.value = "Traduciendo...";
    try {
      if (apiBridge && apiBridge.translate_text) {
        const res = await apiBridge.translate_text(text, selFrom.value, selTo.value);
        if (res && res.translatedText) {
          outputEl.value = res.translatedText;
        } else if (res && res.error) {
          outputEl.value = res.error;
        }
      }
    } catch (e) {
      outputEl.value = "Error al traducir.";
    }
  }

  if (doBtn) doBtn.onclick = (e) => { e.stopPropagation(); translate(); };
  if (inputEl) {
    inputEl.onkeydown = (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        translate();
      }
    };
  }

  if (swapBtn) {
    swapBtn.onclick = (e) => {
      e.stopPropagation();
      const tmp = selFrom.value;
      selFrom.value = selTo.value;
      selTo.value = tmp;
      const tmpText = inputEl.value;
      inputEl.value = outputEl.value;
      outputEl.value = tmpText;
    };
  }

  if (pasteBtn) {
    pasteBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          inputEl.value = text;
          translate();
        }
      } catch (err) {
        console.warn("Could not read clipboard:", err);
      }
    };
  }

  if (copyBtn) {
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      if (!outputEl.value) return;
      navigator.clipboard.writeText(outputEl.value).then(() => {
        copyBtn.textContent = "✓";
        setTimeout(() => { copyBtn.textContent = "📋 Copiar"; }, 1000);
      });
    };
  }
}

// DISPATCHER: INITIALIZE ALL INTERACTIVE WIDGETS
function initInteractiveWidgets() {
  activeLayout.forEach((w) => {
    if (w.type === "stopwatch") {
      initStopwatch(w.id);
    } else if (w.type === "timer") {
      initTimer(w.id);
    } else if (w.type === "notes") {
      initNotesWidget(w.id);
    } else if (w.type === "photo_2x2" || w.type === "photo_2x3" || w.type === "photo_3x2") {
      initPhotoWidget(w);
    } else if (w.type === "slideshow") {
      initSlideshowWidget(w);
    } else if (w.type === "calculator") {
      initCalculator(w.id);
    } else if (w.type === "currency") {
      initCurrencyWidget(w.id);
    } else if (w.type === "calendar") {
      initCalendarWidget(w.id);
    } else if (w.type === "unit_converter") {
      initUnitConverter(w.id);
    } else if (w.type === "translator") {
      initTranslator(w.id);
    }
  });
}

/* ==========================================================================
   PHOTO CONFIG MODAL LOGIC (LOCAL FILE OR WEB URL)
   ========================================================================== */
let currentEditingPhotoWidget = null;
let currentPhotoPreviewUri = "";

function setupPhotoModal() {
  const overlay = document.getElementById("photo-modal-overlay");
  const btnClose = document.getElementById("btn-close-photo-modal");
  const btnCancel = document.getElementById("btn-cancel-photo-modal");
  const btnSave = document.getElementById("btn-save-photo-modal");
  const radioLocal = document.getElementById("radio-photo-local");
  const radioUrl = document.getElementById("radio-photo-url");
  const blockLocal = document.getElementById("photo-local-block");
  const blockUrl = document.getElementById("photo-url-block");
  const inputLocalPath = document.getElementById("photo-input-local-path");
  const inputUrl = document.getElementById("photo-input-url");
  const btnBrowseLocal = document.getElementById("btn-browse-photo-local");
  const btnPreviewUrl = document.getElementById("btn-preview-photo-url");
  const previewImg = document.getElementById("photo-modal-preview-img");
  const previewPh = document.getElementById("photo-modal-preview-placeholder");

  function close() {
    if (overlay) overlay.style.display = "none";
    currentEditingPhotoWidget = null;
    currentPhotoPreviewUri = "";
  }

  if (btnClose) btnClose.onclick = close;
  if (btnCancel) btnCancel.onclick = close;
  if (overlay) {
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };
  }

  function setPreview(uri) {
    currentPhotoPreviewUri = uri || "";
    if (currentPhotoPreviewUri) {
      if (previewImg) {
        previewImg.style.backgroundImage = `url('${currentPhotoPreviewUri}')`;
        previewImg.style.display = "block";
      }
      if (previewPh) previewPh.style.display = "none";
    } else {
      if (previewImg) {
        previewImg.style.backgroundImage = "none";
        previewImg.style.display = "none";
      }
      if (previewPh) previewPh.style.display = "flex";
    }
  }

  function updateSourceToggle() {
    if (radioLocal && radioLocal.checked) {
      if (blockLocal) blockLocal.style.display = "block";
      if (blockUrl) blockUrl.style.display = "none";
    } else {
      if (blockLocal) blockLocal.style.display = "none";
      if (blockUrl) blockUrl.style.display = "block";
    }
  }

  if (radioLocal) radioLocal.onchange = updateSourceToggle;
  if (radioUrl) radioUrl.onchange = updateSourceToggle;

  if (btnBrowseLocal) {
    btnBrowseLocal.onclick = async (e) => {
      e.stopPropagation();
      if (!apiBridge) return;
      const filePath = await apiBridge.select_image_dialog();
      if (filePath) {
        if (inputLocalPath) inputLocalPath.value = filePath;
        const dataUri = await apiBridge.read_image_data(filePath);
        if (dataUri) setPreview(dataUri);
      }
    };
  }

  if (btnPreviewUrl) {
    btnPreviewUrl.onclick = (e) => {
      e.stopPropagation();
      const url = inputUrl ? inputUrl.value.trim() : "";
      if (url) setPreview(url);
    };
  }

  if (inputUrl) {
    inputUrl.oninput = () => {
      const url = inputUrl.value.trim();
      if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
        setPreview(url);
      }
    };
  }

  if (btnSave) {
    btnSave.onclick = async (e) => {
      e.stopPropagation();
      if (!currentEditingPhotoWidget) return;
      const w = currentEditingPhotoWidget;
      const imageToSave = currentPhotoPreviewUri.trim();
      w.image = imageToSave;

      const card = document.getElementById(w.id);
      const container = document.getElementById(`${w.id}_container`);
      if (container) {
        if (imageToSave) {
          container.innerHTML = `<div class="photo-img-fill" style="background-image: url('${imageToSave}');"></div>`;
          if (card) card.classList.add("has-photo");
        } else {
          container.innerHTML = `
            <div class="photo-placeholder">
              <svg viewBox="0 0 24 24"><path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
              <span>Haz clic en 📷 para elegir una foto</span>
            </div>
          `;
          if (card) card.classList.remove("has-photo");
        }
      }

      if (apiBridge && currentDesignsData.active_design) {
        await apiBridge.save_design(currentDesignsData.active_design, activeLayout, currentGridSize);
      }
      close();
    };
  }
}

function openPhotoModal(widget) {
  currentEditingPhotoWidget = widget;
  const overlay = document.getElementById("photo-modal-overlay");
  if (!overlay) return;

  const radioLocal = document.getElementById("radio-photo-local");
  const radioUrl = document.getElementById("radio-photo-url");
  const blockLocal = document.getElementById("photo-local-block");
  const blockUrl = document.getElementById("photo-url-block");
  const inputLocalPath = document.getElementById("photo-input-local-path");
  const inputUrl = document.getElementById("photo-input-url");

  const currentImg = widget.image || "";
  const isWebUrl = currentImg.startsWith("http://") || currentImg.startsWith("https://");

  if (isWebUrl) {
    if (radioUrl) radioUrl.checked = true;
    if (inputUrl) inputUrl.value = currentImg;
    if (inputLocalPath) inputLocalPath.value = "";
    if (blockLocal) blockLocal.style.display = "none";
    if (blockUrl) blockUrl.style.display = "block";
  } else {
    if (radioLocal) radioLocal.checked = true;
    if (inputLocalPath) inputLocalPath.value = currentImg.startsWith("data:") ? "Imagen local cargada" : currentImg;
    if (inputUrl) inputUrl.value = "";
    if (blockLocal) blockLocal.style.display = "block";
    if (blockUrl) blockUrl.style.display = "none";
  }

  const previewImg = document.getElementById("photo-modal-preview-img");
  const previewPh = document.getElementById("photo-modal-preview-placeholder");
  currentPhotoPreviewUri = currentImg;
  if (currentImg) {
    if (previewImg) {
      previewImg.style.backgroundImage = `url('${currentImg}')`;
      previewImg.style.display = "block";
    }
    if (previewPh) previewPh.style.display = "none";
  } else {
    if (previewImg) {
      previewImg.style.backgroundImage = "none";
      previewImg.style.display = "none";
    }
    if (previewPh) previewPh.style.display = "flex";
  }

  overlay.style.display = "flex";
}

/* ==========================================================================
   TIMER MODAL LOGIC (DAYS, HOURS, MINS, SECS)
   ========================================================================== */
let currentEditingTimerId = null;

function setupTimerModal() {
  const overlay = document.getElementById("timer-modal-overlay");
  const btnClose = document.getElementById("btn-close-timer-modal");
  const btnCancel = document.getElementById("btn-cancel-timer-modal");
  const btnSave = document.getElementById("btn-save-timer-modal");
  const inDays = document.getElementById("timer-input-days");
  const inHours = document.getElementById("timer-input-hours");
  const inMins = document.getElementById("timer-input-mins");
  const inSecs = document.getElementById("timer-input-secs");
  const presets = document.querySelectorAll(".btn-timer-preset");

  function close() {
    if (overlay) overlay.style.display = "none";
    currentEditingTimerId = null;
  }

  if (btnClose) btnClose.onclick = close;
  if (btnCancel) btnCancel.onclick = close;
  if (overlay) {
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };
  }

  presets.forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const secs = parseInt(btn.getAttribute("data-secs"), 10) || 60;
      const d = Math.floor(secs / 86400);
      const h = Math.floor((secs % 86400) / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      if (inDays) inDays.value = d;
      if (inHours) inHours.value = h;
      if (inMins) inMins.value = m;
      if (inSecs) inSecs.value = s;
    };
  });

  if (btnSave) {
    btnSave.onclick = (e) => {
      e.stopPropagation();
      if (!currentEditingTimerId) return;
      const id = currentEditingTimerId;
      const d = Math.max(0, parseInt(inDays.value, 10) || 0);
      const h = Math.max(0, Math.min(23, parseInt(inHours.value, 10) || 0));
      const m = Math.max(0, Math.min(59, parseInt(inMins.value, 10) || 0));
      const s = Math.max(0, Math.min(59, parseInt(inSecs.value, 10) || 0));
      const total = d * 86400 + h * 3600 + m * 60 + s;
      if (total <= 0) return;

      if (!timerStates[id]) {
        timerStates[id] = { totalSecs: total, remainingSecs: total, isRunning: false, intervalId: null };
      }
      const state = timerStates[id];
      state.totalSecs = total;
      state.remainingSecs = total;

      const card = document.getElementById(id);
      if (card) card.classList.remove("alarm-active");

      // Guardar tiempo configurado sin iniciar automáticamente
      const btnStart = document.getElementById(`${id}_btn_start`);
      const iconPlay = btnStart ? btnStart.querySelector(".tm-icon-play") : null;
      const iconPause = btnStart ? btnStart.querySelector(".tm-icon-pause") : null;
      const display = document.getElementById(`${id}_display`);

      clearInterval(state.intervalId);
      state.isRunning = false;
      if (btnStart) btnStart.classList.remove("running");
      if (iconPlay) iconPlay.style.display = "inline-block";
      if (iconPause) iconPause.style.display = "none";

      function formatTime(s) {
        const days = Math.floor(s / 86400);
        const remD = s % 86400;
        const hours = Math.floor(remD / 3600);
        const mins = Math.floor((remD % 3600) / 60);
        const secs = remD % 60;
        if (days > 0) {
          return `${days}d ${hours}h ${String(mins).padStart(2, "0")}m`;
        }
        if (hours > 0) {
          return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
        }
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      }

      if (display) display.textContent = formatTime(state.remainingSecs);

      close();
    };
  }
}

function openTimerModal(id) {
  currentEditingTimerId = id;
  const overlay = document.getElementById("timer-modal-overlay");
  if (!overlay) return;

  const state = timerStates[id] || { totalSecs: 300, remainingSecs: 300 };
  const total = state.totalSecs || 300;
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const inDays = document.getElementById("timer-input-days");
  const inHours = document.getElementById("timer-input-hours");
  const inMins = document.getElementById("timer-input-mins");
  const inSecs = document.getElementById("timer-input-secs");

  if (inDays) inDays.value = d;
  if (inHours) inHours.value = h;
  if (inMins) inMins.value = m;
  if (inSecs) inSecs.value = s;

  overlay.style.display = "flex";
}

/* ==========================================================================
   SLIDESHOW ALBUM MODAL (LOCAL MULTIPLE OR WEB URL + THUMBNAILS & DELETE)
   ========================================================================== */
let currentEditingSlideshowId = null;
let currentSlideshowAlbumImages = [];

function setupSlideshowModal() {
  const overlay = document.getElementById("slideshow-modal-overlay");
  const btnClose = document.getElementById("btn-close-slideshow-modal");
  const btnCancel = document.getElementById("btn-cancel-slideshow-modal");
  const btnSave = document.getElementById("btn-save-slideshow-modal");
  const radioLocal = document.getElementById("radio-slideshow-local");
  const radioUrl = document.getElementById("radio-slideshow-url");
  const blockLocal = document.getElementById("slideshow-local-block");
  const blockUrl = document.getElementById("slideshow-url-block");
  const btnBrowseLocal = document.getElementById("btn-browse-slideshow-local");
  const inputUrl = document.getElementById("slideshow-input-url");
  const btnAddUrl = document.getElementById("btn-add-slideshow-url");
  const selInterval = document.getElementById("slideshow-modal-interval");
  const countLabel = document.getElementById("slideshow-modal-count");
  const thumbsGrid = document.getElementById("slideshow-thumbnails-grid");

  function close() {
    if (overlay) overlay.style.display = "none";
    currentEditingSlideshowId = null;
    currentSlideshowAlbumImages = [];
  }

  if (btnClose) btnClose.onclick = close;
  if (btnCancel) btnCancel.onclick = close;
  if (overlay) {
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };
  }

  // Radio toggles
  if (radioLocal && radioUrl && blockLocal && blockUrl) {
    radioLocal.onchange = () => {
      if (radioLocal.checked) {
        blockLocal.style.display = "block";
        blockUrl.style.display = "none";
      }
    };
    radioUrl.onchange = () => {
      if (radioUrl.checked) {
        blockLocal.style.display = "none";
        blockUrl.style.display = "block";
      }
    };
  }

  // Add from PC (multiple selection dialog)
  if (btnBrowseLocal) {
    btnBrowseLocal.onclick = async (e) => {
      e.stopPropagation();
      if (!apiBridge || !apiBridge.select_multiple_images_dialog) return;
      try {
        btnBrowseLocal.disabled = true;
        const originalText = btnBrowseLocal.textContent;
        btnBrowseLocal.textContent = "Cargando fotos seleccionadas...";
        const filePaths = await apiBridge.select_multiple_images_dialog();
        if (filePaths && filePaths.length > 0) {
          for (const fp of filePaths) {
            const dataUri = await apiBridge.read_image_data(fp);
            if (dataUri) {
              currentSlideshowAlbumImages.push(dataUri);
            }
          }
          renderModalThumbnails();
        }
        btnBrowseLocal.textContent = originalText;
        btnBrowseLocal.disabled = false;
      } catch (err) {
        console.error("Error adding local photos to slideshow:", err);
        btnBrowseLocal.disabled = false;
      }
    };
  }

  // Add from Web URL
  function addWebPhoto() {
    if (!inputUrl) return;
    const url = inputUrl.value.trim();
    if (!url) return;

    currentSlideshowAlbumImages.push(url);
    inputUrl.value = "";
    renderModalThumbnails();
  }

  if (btnAddUrl) {
    btnAddUrl.onclick = (e) => {
      e.stopPropagation();
      addWebPhoto();
    };
  }

  if (inputUrl) {
    inputUrl.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addWebPhoto();
      }
    };
  }

  // Save Album
  if (btnSave) {
    btnSave.onclick = async (e) => {
      e.stopPropagation();
      if (!currentEditingSlideshowId) return;
      const id = currentEditingSlideshowId;
      const intervalVal = parseInt(selInterval ? selInterval.value : "10", 10) || 10;

      if (!slideshowStates[id]) {
        slideshowStates[id] = {
          images: [],
          interval: intervalVal,
          index: 0,
          isPaused: false,
          timer: null
        };
      }

      const state = slideshowStates[id];
      state.images = [...currentSlideshowAlbumImages];
      state.interval = intervalVal;
      if (state.index >= state.images.length) {
        state.index = 0;
      }

      // Sync interval button on widget if present
      if (typeof state.updateIntervalButton === "function") {
        state.updateIntervalButton();
      }

      // Save to backend config
      if (apiBridge && apiBridge.save_slideshow_config) {
        try {
          await apiBridge.save_slideshow_config(id, { images: state.images, interval: state.interval });
        } catch (err) {
          console.error("Error saving slideshow config:", err);
        }
      }

      // Also sync activeLayout item if exists
      const layoutWidget = activeLayout.find((w) => w.id === id);
      if (layoutWidget) {
        layoutWidget.images = state.images;
        layoutWidget.interval = state.interval;
      }

      // Refresh slide display and timer
      if (typeof state.showSlide === "function") {
        state.showSlide(state.index);
      }
      if (typeof state.resetTimer === "function") {
        state.resetTimer();
      }

      close();
    };
  }
}

function renderModalThumbnails() {
  const thumbsGrid = document.getElementById("slideshow-thumbnails-grid");
  const countLabel = document.getElementById("slideshow-modal-count");
  if (!thumbsGrid || !countLabel) return;

  const total = currentSlideshowAlbumImages.length;
  countLabel.textContent = `${total} ${total === 1 ? "foto" : "fotos"}`;
  thumbsGrid.innerHTML = "";

  if (total === 0) {
    thumbsGrid.innerHTML = `
      <div class="slideshow-empty-album">
        <span>No hay fotos en el álbum todavía. Elige fotos de tu PC o añade URLs para empezar.</span>
      </div>
    `;
    return;
  }

  currentSlideshowAlbumImages.forEach((imgUri, index) => {
    const card = document.createElement("div");
    card.className = "slideshow-thumb-card";
    card.innerHTML = `
      <div class="slideshow-thumb-img" style="background-image: url('${imgUri}')"></div>
      <span class="slideshow-thumb-num">#${index + 1}</span>
      <button type="button" class="slideshow-thumb-del" title="Eliminar foto del álbum">🗑</button>
    `;

    const btnDel = card.querySelector(".slideshow-thumb-del");
    if (btnDel) {
      btnDel.onclick = (e) => {
        e.stopPropagation();
        currentSlideshowAlbumImages.splice(index, 1);
        renderModalThumbnails();
      };
    }

    thumbsGrid.appendChild(card);
  });
}

function openSlideshowModal(id) {
  const overlay = document.getElementById("slideshow-modal-overlay");
  if (!overlay) return;
  currentEditingSlideshowId = id;

  const state = slideshowStates[id] || { images: [], interval: 10 };
  currentSlideshowAlbumImages = Array.isArray(state.images) ? [...state.images] : [];

  const radioLocal = document.getElementById("radio-slideshow-local");
  const radioUrl = document.getElementById("radio-slideshow-url");
  const blockLocal = document.getElementById("slideshow-local-block");
  const blockUrl = document.getElementById("slideshow-url-block");
  const inputUrl = document.getElementById("slideshow-input-url");
  const selInterval = document.getElementById("slideshow-modal-interval");

  if (radioLocal) radioLocal.checked = true;
  if (radioUrl) radioUrl.checked = false;
  if (blockLocal) blockLocal.style.display = "block";
  if (blockUrl) blockUrl.style.display = "none";
  if (inputUrl) {
    inputUrl.value = "";
    inputUrl.style.borderColor = "";
  }
  if (selInterval) selInterval.value = String(state.interval || 10);

  renderModalThumbnails();
  overlay.style.display = "flex";
}

/* ==========================================================================
   NEW DESIGN MODAL (MODERNO E INTEGRADO)
   ========================================================================== */
function setupNewDesignModal() {
  const overlay = document.getElementById("new-design-modal-overlay");
  const btnClose = document.getElementById("btn-close-new-design-modal");
  const btnCancel = document.getElementById("btn-cancel-new-design-modal");
  const btnConfirm = document.getElementById("btn-confirm-new-design");
  const inputName = document.getElementById("input-new-design-name");
  const selectGrid = document.getElementById("select-new-design-grid");
  const radioClone = document.getElementById("radio-design-clone");

  function close() {
    if (overlay) overlay.style.display = "none";
  }

  if (btnClose) btnClose.onclick = close;
  if (btnCancel) btnCancel.onclick = close;
  if (overlay) {
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };
  }

  if (inputName) {
    inputName.oninput = () => {
      inputName.style.borderColor = "";
    };
    inputName.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (btnConfirm) btnConfirm.click();
      }
    };
  }

  if (btnConfirm) {
    btnConfirm.onclick = async (e) => {
      e.stopPropagation();
      const name = inputName ? inputName.value.trim() : "";
      if (!name) {
        if (inputName) {
          inputName.style.borderColor = "var(--accent-red)";
          inputName.focus();
        }
        return;
      }

      const newGridSize = selectGrid ? selectGrid.value : currentGridSize;
      const shouldClone = radioClone ? radioClone.checked : true;
      const newLayout = shouldClone ? JSON.parse(JSON.stringify(activeLayout)) : [];

      currentDesignsData.designs[name] = {
        grid_size: newGridSize,
        layout: newLayout
      };
      currentDesignsData.active_design = name;
      activeLayout = newLayout;
      currentGridSize = newGridSize;

      const lCols = currentGridSize === "6x4" ? 6 : 8;
      const lRows = currentGridSize === "6x4" ? 4 : 5;
      refitLayoutToGrid(lCols, lRows);
      applyGridSize(currentGridSize);

      if (apiBridge) {
        await apiBridge.save_design(name, activeLayout, currentGridSize);
        await apiBridge.set_active_design(name);
      }

      updateCurrentDesignLabel(name);
      renderDesignsList();
      renderGrid();
      close();

      const dropdown = document.getElementById("designs-dropdown");
      const wrapper = document.getElementById("designs-menu-wrapper");
      if (dropdown) dropdown.style.display = "none";
      if (wrapper) wrapper.classList.remove("open");
    };
  }
}

function openNewDesignModal() {
  const overlay = document.getElementById("new-design-modal-overlay");
  const inputName = document.getElementById("input-new-design-name");
  const selectGrid = document.getElementById("select-new-design-grid");
  const radioClone = document.getElementById("radio-design-clone");

  if (inputName) {
    inputName.value = "";
    inputName.style.borderColor = "";
  }
  if (selectGrid) selectGrid.value = currentGridSize;
  if (radioClone) radioClone.checked = true;

  if (overlay) overlay.style.display = "flex";
  if (inputName) setTimeout(() => inputName.focus(), 50);
}

/* ==========================================================================
   CUSTOM CONFIRM MODAL (NO ALERT/CONFIRM FEOS)
   ========================================================================== */
let confirmResolver = null;

function showConfirmDialog(title, message) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    const overlay = document.getElementById("confirm-modal-overlay");
    const titleEl = document.getElementById("confirm-modal-title");
    const msgEl = document.getElementById("confirm-modal-message");
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (overlay) overlay.style.display = "flex";
  });
}

function setupConfirmModal() {
  const overlay = document.getElementById("confirm-modal-overlay");
  const btnCancel = document.getElementById("btn-confirm-cancel");
  const btnOk = document.getElementById("btn-confirm-ok");

  function close(res) {
    if (overlay) overlay.style.display = "none";
    if (confirmResolver) {
      confirmResolver(res);
      confirmResolver = null;
    }
  }

  if (btnCancel) btnCancel.onclick = () => close(false);
  if (btnOk) btnOk.onclick = () => close(true);
  if (overlay) {
    overlay.onclick = (e) => {
      if (e.target === overlay) close(false);
    };
  }
}


document.addEventListener("DOMContentLoaded", initApp);

