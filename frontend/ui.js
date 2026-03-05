// UI helpers for panels, modals, and controls
const UI = (() => {
  const statusBadge = document.getElementById("status");
  const woModal = document.getElementById("wo-selector-modal");
  const woListContainer = document.getElementById("wo-list-container");
  const toolsPanel = document.getElementById("tools-panel");
  const actionsPanel = document.getElementById("actions-panel");

  const showWorkOrderSelector = () => {
    woModal.style.display = "flex";
  };

  const hideWorkOrderSelector = () => {
    woModal.style.display = "none";
  };

  const setWorkOrderListLoading = () => {
    woListContainer.innerHTML = "<p>Loading work orders...</p>";
  };

  const renderWorkOrderList = (workOrders, currentId, onSelect) => {
    if (!workOrders || workOrders.length === 0) {
      woListContainer.innerHTML = "<p>No work orders available.</p>";
      return;
    }

    woListContainer.innerHTML = workOrders
      .map(
        (wo) => `
        <div class="wo-item ${currentId === wo.id ? "wo-item-active" : ""}" data-wo-id="${wo.id}">
          <div class="wo-item-header">
            <span class="wo-item-id">${wo.id}</span>
            <span class="wo-item-priority ${wo.priority || "normal"}">${wo.priority || "normal"}</span>
          </div>
          <div class="wo-item-name">${wo.name}</div>
          <div class="wo-item-footer">
            <span class="wo-item-status ${wo.status}">${wo.status}</span>
          </div>
        </div>
      `,
      )
      .join("");

    woListContainer.querySelectorAll(".wo-item").forEach((item) => {
      item.addEventListener("click", () => onSelect(item.dataset.woId));
    });
  };

  const updateWorkOrderUI = (workOrder) => {
    const detailsContainer = document.getElementById("wo-details");
    if (!workOrder || !detailsContainer) return;

    detailsContainer.innerHTML = `
      <div class="wo-active-header">
        <span class="wo-active-id">${workOrder.id}</span>
        <button class="wo-change-btn" onclick="openWorkOrderSelector()">Change</button>
      </div>
      <h3>${workOrder.name}</h3>
      <p>${workOrder.description}</p>
      <div class="wo-meta">
        <span class="wo-status-badge ${workOrder.status}">${workOrder.status}</span>
        ${workOrder.priority ? `<span class="wo-priority-badge ${workOrder.priority}">${workOrder.priority}</span>` : ""}
      </div>
      <div class="wo-stats">
        <div class="wo-stat">
          <span class="wo-stat-value">${workOrder.design_assets?.length || 0}</span>
          <span class="wo-stat-label">Design Assets</span>
        </div>
      </div>
    `;
  };

  const showToolsPanel = () => {
    if (toolsPanel) toolsPanel.style.display = "block";
    if (actionsPanel) actionsPanel.style.display = "block";
  };

  const setMapCursor = (cursor) => {
    const mapEl = document.getElementById("map");
    if (mapEl) mapEl.style.cursor = cursor || "";
  };

  const updateStatus = (state) => {
    if (!statusBadge) return;
    if (state === "online") {
      statusBadge.innerHTML = "● Online";
      statusBadge.className = "online";
    } else if (state === "offline") {
      statusBadge.innerHTML = "● Offline Mode";
      statusBadge.className = "offline";
    } else {
      statusBadge.innerHTML = "● Checking...";
      statusBadge.className = "checking";
    }
  };

  // Modal + form controls
  const openAssetModal = (assetType) => {
    document.getElementById("modal-title").textContent = `New ${assetType}`;
    document.getElementById("asset-modal").classList.add("active");

    const container = document.getElementById("form-fields-container");
    container.innerHTML = getFormTemplate(assetType);

    initTrafficLights();
    initGradeSelectors();
    initPhotoCapture();
    resetTrafficLights();
    resetGradeSelectors();
    clearPhotoPreview();

    if (assetType === "Transformer") {
      const gmtFields = document.getElementById("gmt-only-fields");
      if (gmtFields) gmtFields.classList.remove("active");
    }

    setMapCursor("");
  };

  const closeAssetModal = () => {
    document.getElementById("asset-modal").classList.remove("active");
    AppState.pendingAssetGeometry = null;
    AppState.pendingAssetType = null;
    AppState.pendingPhotoBase64 = null;
  };

  // Traffic lights
  const initTrafficLights = () => {
    document.querySelectorAll(".traffic-light").forEach((container) => {
      container.querySelectorAll(".traffic-light-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          container
            .querySelectorAll(".traffic-light-btn")
            .forEach((b) => b.classList.remove("selected"));
          this.classList.add("selected");
        });
      });
    });
  };

  const resetTrafficLights = () => {
    document.querySelectorAll(".traffic-light-btn").forEach((btn) => {
      btn.classList.remove("selected");
    });
    document.querySelectorAll(".traffic-light").forEach((container) => {
      const greenBtn = container.querySelector(".traffic-light-btn.green");
      if (greenBtn) greenBtn.classList.add("selected");
    });
  };

  const getTrafficLightValue = (fieldName) => {
    const container = document.querySelector(
      `.traffic-light[data-field="${fieldName}"]`,
    );
    const selected = container?.querySelector(".traffic-light-btn.selected");
    return selected ? selected.dataset.value : "None";
  };

  // Grade selectors
  const initGradeSelectors = () => {
    document.querySelectorAll(".grade-selector").forEach((container) => {
      container.querySelectorAll(".grade-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          container
            .querySelectorAll(".grade-btn")
            .forEach((b) => b.classList.remove("selected"));
          this.classList.add("selected");
        });
      });
    });
  };

  const resetGradeSelectors = () => {
    document
      .querySelectorAll(".grade-btn")
      .forEach((btn) => btn.classList.remove("selected"));
    document.querySelectorAll(".grade-selector").forEach((container) => {
      const grade1Btn = container.querySelector(".grade-btn.grade-1");
      if (grade1Btn) grade1Btn.classList.add("selected");
    });
  };

  const getGradeValue = (fieldName) => {
    const container = document.querySelector(
      `.grade-selector[data-field="${fieldName}"]`,
    );
    const selected = container?.querySelector(".grade-btn.selected");
    return selected ? parseInt(selected.dataset.value) : 1;
  };

  const toggleGMTFields = () => {
    const mountingSelect = document.getElementById("tx-mounting");
    const gmtFields = document.getElementById("gmt-only-fields");
    if (!mountingSelect || !gmtFields) return;
    if (mountingSelect.value === "Ground Mounted") {
      gmtFields.classList.add("active");
    } else {
      gmtFields.classList.remove("active");
    }
  };

  // Photo capture
  const initPhotoCapture = () => {
    const photoInput = document.getElementById("photo");
    const preview = document.getElementById("photo-preview");
    if (!photoInput || !preview) return;

    photoInput.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (event) {
        AppState.pendingPhotoBase64 = event.target.result;
        preview.src = AppState.pendingPhotoBase64;
        preview.classList.add("has-image");
        const label = document.querySelector(".photo-upload-text");
        if (label) label.textContent = "✓ Photo captured";
      };
      reader.readAsDataURL(file);
    });
  };

  const clearPhotoPreview = () => {
    AppState.pendingPhotoBase64 = null;
    const preview = document.getElementById("photo-preview");
    if (preview) {
      preview.src = "";
      preview.classList.remove("has-image");
    }
    const label = document.querySelector(".photo-upload-text");
    if (label) label.textContent = "📷 Tap to capture or select photo";
  };

  const showStartPointPopup = (latlng) => {
    L.popup()
      .setLatLng(latlng)
      .setContent("<b>Start Point Selected</b><br>Click next pole to connect.")
      .openOn(MapController.getMap());
  };

  const clearPopup = () => {
    MapController.getMap()?.closePopup();
  };

  // Sync badge
  const updateSyncBadge = (count) => {
    const badge = document.getElementById("sync-badge");
    if (!badge) return;
    if (count > 0) {
      badge.style.display = "block";
      badge.textContent = `${count} pending`;
    } else {
      badge.style.display = "none";
    }
  };

  return {
    showWorkOrderSelector,
    hideWorkOrderSelector,
    setWorkOrderListLoading,
    renderWorkOrderList,
    updateWorkOrderUI,
    showToolsPanel,
    setMapCursor,
    updateStatus,
    updateSyncBadge,
    openAssetModal,
    closeAssetModal,
    initTrafficLights,
    initGradeSelectors,
    resetTrafficLights,
    resetGradeSelectors,
    getTrafficLightValue,
    getGradeValue,
    toggleGMTFields,
    initPhotoCapture,
    clearPhotoPreview,
    showStartPointPopup,
    clearPopup,
  };
})();

window.UI = UI;
window.toggleGMTFields = UI.toggleGMTFields;
window.closeAssetModal = UI.closeAssetModal;
window.initTrafficLights = UI.initTrafficLights;
window.initGradeSelectors = UI.initGradeSelectors;
