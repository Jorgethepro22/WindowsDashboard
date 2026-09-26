// WindowsDashboard V2 - Modular Grid Engine & Pointer-Events Drag & Drop

let apiBridge = null;
let currentDesignsData = { active_design: "Predeterminado", designs: {} };
let activeLayout = [];
let currentGridSize = "8x5";
let isEditMode = false;
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

  // Setup Designs and Edit Mode
  await setupDesigns(apiBridge);
  setupEditMode();
  setupWidgetDrawer();
  setupMediaAudioDelegation(apiBridge);
  setupShortcutModal();
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
    btnNewDesign.addEventListener("click", async (e) => {
      e.stopPropagation();
      const name = prompt("Introduce el nombre del nuevo diseño:");
      if (!name || !name.trim()) return;
      const cleanName = name.trim();
      currentDesignsData.designs[cleanName] = {
        grid_size: currentGridSize,
        layout: JSON.parse(JSON.stringify(activeLayout))
      };
      currentDesignsData.active_design = cleanName;
      await api.save_design(cleanName, activeLayout, currentGridSize);
      updateCurrentDesignLabel(cleanName);
      renderDesignsList();
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
      alert(`Diseño "${name}" actualizado con éxito.`);
    });

    const btnDelete = item.querySelector(".btn-delete");
    if (btnDelete) {
      btnDelete.addEventListener("click", async () => {
        if (confirm(`¿Eliminar el diseño "${name}"?`)) {
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
        }
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

  if (btnEdit) {
    btnEdit.addEventListener("click", async () => {
      isEditMode = !isEditMode;
      if (isEditMode) {
        document.body.classList.add("edit-mode");
        btnEdit.classList.add("active");
        if (editBadge) editBadge.style.display = "inline-block";
        if (drawer) drawer.style.display = "flex";
        if (circle) circle.style.display = "none";
      } else {
        document.body.classList.remove("edit-mode");
        btnEdit.classList.remove("active");
        if (editBadge) editBadge.style.display = "none";
        if (drawer) drawer.style.display = "none";
        if (circle) circle.style.display = "none";
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

    // Edit Corner click (shortcut config modal)
    if (editBtn) {
      editBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
      editBtn.addEventListener("pointerup", (e) => e.stopPropagation());
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openShortcutModal(widget);
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
}

/* ==========================================================================
   MEDIA & AUDIO EVENT DELEGATION
   ========================================================================== */
function setupMediaAudioDelegation(api) {
  const grid = document.getElementById("dashboard-grid");
  if (!grid) return;

  grid.addEventListener("click", async (e) => {
    if (isEditMode) return; // Completely disabled in Edit Mode!

    if (e.target.closest(".btn-play-pause")) {
      await api.media_play_pause();
    } else if (e.target.closest(".btn-next")) {
      await api.media_next();
    } else if (e.target.closest(".btn-prev")) {
      await api.media_previous();
    } else if (e.target.closest(".btn-output-mute") || e.target.closest(".btn-mute")) {
      await api.toggle_output_mute();
    } else if (e.target.closest(".btn-input-mute")) {
      await api.toggle_input_mute();
    }
  });

  grid.addEventListener("input", (e) => {
    if (isEditMode) return; // Completely disabled in Edit Mode!

    if (e.target.classList.contains("output-volume-range") || e.target.classList.contains("volume-range")) {
      isUpdatingOutputVolumeManually = true;
      const val = parseInt(e.target.value) || 0;

      const card = e.target.closest(".widget-card");
      if (card) {
        const text = card.querySelector(".output-volume-val-text") || card.querySelector(".volume-val-text");
        const fill = card.querySelector(".output-range-fill");
        if (text) text.textContent = `${val}%`;
        if (fill) fill.style.width = `${val}%`;
      }

      clearTimeout(outputVolumeDebounceTimer);
      outputVolumeDebounceTimer = setTimeout(async () => {
        await api.set_output_volume(val);
        setTimeout(() => {
          isUpdatingOutputVolumeManually = false;
        }, 400);
      }, 40);
    } else if (e.target.classList.contains("input-volume-range")) {
      isUpdatingInputVolumeManually = true;
      const val = parseInt(e.target.value) || 0;

      const card = e.target.closest(".widget-card");
      if (card) {
        const text = card.querySelector(".input-volume-val-text");
        const fill = card.querySelector(".input-range-fill");
        if (text) text.textContent = `${val}%`;
        if (fill) fill.style.width = `${val}%`;
      }

      clearTimeout(inputVolumeDebounceTimer);
      inputVolumeDebounceTimer = setTimeout(async () => {
        await api.set_input_volume(val);
        setTimeout(() => {
          isUpdatingInputVolumeManually = false;
        }, 400);
      }, 40);
    }
  });

  grid.addEventListener("change", async (e) => {
    if (isEditMode) return;

    if (e.target.classList.contains("output-device-select") || e.target.classList.contains("input-device-select")) {
      const devId = e.target.value;
      if (devId) {
        await api.set_default_audio_device(devId);
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

  const isPlaying = Boolean(media && media.is_playing);
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
  if (!isUpdatingOutputVolumeManually) {
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
  if (!isUpdatingInputVolumeManually) {
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
   SHORTCUT MODAL CONTROLLER (STREAM DECK CONFIG)
   ========================================================================== */
let shortcutModalWidgetId = null;

function openShortcutModal(widget) {
  shortcutModalWidgetId = widget.id;
  const overlay = document.getElementById("shortcut-modal-overlay");
  if (!overlay) return;
  overlay.style.display = "flex";

  // Populate fields from widget data
  const inputTarget = document.getElementById("shortcut-input-target");
  const inputImage = document.getElementById("shortcut-input-image");
  const inputText = document.getElementById("shortcut-input-text");
  const radioImage = document.getElementById("radio-mode-image");
  const radioText = document.getElementById("radio-mode-text");

  if (inputTarget) inputTarget.value = widget.target || "";
  if (inputImage) inputImage.value = widget.image || "";
  if (inputText) inputText.value = widget.title || "";

  const mode = widget.mode || "image";
  if (mode === "text" && radioText) {
    radioText.checked = true;
  } else if (radioImage) {
    radioImage.checked = true;
  }

  updateShortcutModalSections();
  updateShortcutPreview();
}

function closeShortcutModal() {
  shortcutModalWidgetId = null;
  const overlay = document.getElementById("shortcut-modal-overlay");
  if (overlay) overlay.style.display = "none";
}

function getShortcutMode() {
  const radioText = document.getElementById("radio-mode-text");
  return (radioText && radioText.checked) ? "text" : "image";
}

function updateShortcutModalSections() {
  const mode = getShortcutMode();
  const sectionImage = document.getElementById("shortcut-section-image");
  const sectionText = document.getElementById("shortcut-section-text");
  if (sectionImage) sectionImage.style.display = mode === "image" ? "flex" : "none";
  if (sectionText) sectionText.style.display = "flex"; // Always visible (caption for image, or main text)
}

function updateShortcutPreview() {
  const previewContent = document.getElementById("shortcut-preview-content");
  if (!previewContent) return;

  const mode = getShortcutMode();
  const image = (document.getElementById("shortcut-input-image") || {}).value || "";
  const text = (document.getElementById("shortcut-input-text") || {}).value || "";

  let html = "";
  if (mode === "image" && image) {
    html = `
      <div class="shortcut-img-fill" style="background-image: url('${image}');"></div>
      ${text ? `<div class="shortcut-caption-overlay">${text}</div>` : ""}
    `;
  } else if (mode === "text" || text) {
    html = `
      <div class="shortcut-text-fill">
        <span class="shortcut-text-label">${text || "Acceso Directo"}</span>
      </div>
    `;
  } else {
    html = `
      <div class="shortcut-placeholder">
        <svg class="shortcut-ph-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
        <span class="shortcut-ph-text">Configurar</span>
      </div>
    `;
  }
  previewContent.innerHTML = html;

  // Apply/remove has-image class on preview card
  const previewCard = document.getElementById("shortcut-live-preview");
  if (previewCard) {
    if (mode === "image" && image) {
      previewCard.classList.add("has-image");
    } else {
      previewCard.classList.remove("has-image");
    }
  }
}

async function saveShortcutModal() {
  if (!shortcutModalWidgetId) return;

  const target = (document.getElementById("shortcut-input-target") || {}).value || "";
  const image = (document.getElementById("shortcut-input-image") || {}).value || "";
  const title = (document.getElementById("shortcut-input-text") || {}).value || "";
  const mode = getShortcutMode();

  // Update widget in activeLayout
  const widget = activeLayout.find((w) => w.id === shortcutModalWidgetId);
  if (widget) {
    widget.target = target;
    widget.image = image;
    widget.title = title;
    widget.mode = mode;
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
  const btnCancel = document.getElementById("btn-cancel-shortcut-modal");
  const btnSave = document.getElementById("btn-save-shortcut-modal");
  const overlay = document.getElementById("shortcut-modal-overlay");

  if (btnClose) btnClose.addEventListener("click", closeShortcutModal);
  if (btnCancel) btnCancel.addEventListener("click", closeShortcutModal);
  if (btnSave) btnSave.addEventListener("click", saveShortcutModal);

  // Click overlay to close
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeShortcutModal();
    });
  }

  // Mode radio toggle
  const radioImage = document.getElementById("radio-mode-image");
  const radioText = document.getElementById("radio-mode-text");
  if (radioImage) radioImage.addEventListener("change", () => { updateShortcutModalSections(); updateShortcutPreview(); });
  if (radioText) radioText.addEventListener("change", () => { updateShortcutModalSections(); updateShortcutPreview(); });

  // Live preview on input
  const inputImage = document.getElementById("shortcut-input-image");
  const inputText = document.getElementById("shortcut-input-text");
  if (inputImage) inputImage.addEventListener("input", updateShortcutPreview);
  if (inputText) inputText.addEventListener("input", updateShortcutPreview);

  // Browse Target (file dialog)
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

  // Browse Image (image dialog + convert to data URI)
  const btnBrowseImage = document.getElementById("btn-browse-image");
  if (btnBrowseImage) {
    btnBrowseImage.addEventListener("click", async () => {
      if (!apiBridge) return;
      const filePath = await apiBridge.select_image_dialog();
      if (filePath) {
        const dataUri = await apiBridge.read_image_data(filePath);
        if (dataUri) {
          const imgInput = document.getElementById("shortcut-input-image");
          if (imgInput) imgInput.value = dataUri;
          updateShortcutPreview();
        }
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", initApp);
