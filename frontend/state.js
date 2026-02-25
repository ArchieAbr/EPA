// Shared configuration and state containers
const AppConfig = {
  API_BASE: "http://127.0.0.1:5000",
};

const AppState = {
  currentWorkOrder: null,
  currentTool: null,
  cableStartNode: null,
  pendingAssetGeometry: null,
  pendingAssetType: null,
  pendingPhotoBase64: null,
  isServerReachable: false,
};

window.AppConfig = AppConfig;
window.AppState = AppState;
