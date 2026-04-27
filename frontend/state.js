// Shared configuration and application state

const AppConfig = {
  API_BASE: "http://127.0.0.1:5000",
};

const AppState = {
  // Current work order loaded on the map
  currentWorkOrder: null,

  // Active drawing tool (null | "Pole" | "Transformer" | "Cable")
  currentTool: null,

  // Cable creation: first click stores start node
  cableStartNode: null,

  // Cable form-first: stores properties after form submit, before drawing
  pendingCableProperties: null,

  // Pending asset data while the form modal is open
  pendingAssetGeometry: null,
  pendingAssetType: null,
  pendingPhotoBase64: null,

  // Editing an existing asset (null when creating new)
  editingAssetId: null,

  // Accepting a design asset — stores the design ID and original feature
  pendingAcceptDesignId: null,
  pendingAcceptDesignFeature: null,

  // Connectivity
  isServerReachable: false,

  // Sync queue count (kept in sync for UI badge)
  pendingSyncCount: 0,
};

window.AppConfig = AppConfig;
window.AppState = AppState;
