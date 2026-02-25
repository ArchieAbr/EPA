// Leaflet map setup and rendering helpers
const MapController = (() => {
  const DEFAULT_CENTER = [53.81, -1.56];
  const DEFAULT_ZOOM = 14;

  let map = null;
  let designLayer = null;
  let featureClickHandler = null;

  const calculateLineLength = (coordinates) => {
    let totalLength = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lon1, lat1] = coordinates[i];
      const [lon2, lat2] = coordinates[i + 1];
      totalLength += haversineDistance(lat1, lon1, lat2, lon2);
    }
    return totalLength;
  };

  const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const initMap = () => {
    map = L.map("map").setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);
    return map;
  };

  const setBounds = (bounds) => {
    if (!map || !bounds) return;
    map.setView([bounds.center[0], bounds.center[1]], bounds.zoom);
    if (bounds.maxBounds && bounds.maxBounds.length === 2) {
      const maxBounds = L.latLngBounds(
        [bounds.maxBounds[0][0], bounds.maxBounds[0][1]],
        [bounds.maxBounds[1][0], bounds.maxBounds[1][1]],
      );
      map.setMaxBounds(maxBounds);
      map.setMinZoom(bounds.minZoom || bounds.zoom - 2);
      map.options.maxBoundsViscosity = 1.0;
    }
  };

  const renderJobPackLayers = (workOrder) => {
    if (!map) return;
    if (designLayer) {
      map.removeLayer(designLayer);
    }
    if (!workOrder || !workOrder.design_assets) {
      console.warn("No work order loaded, skipping design layer render");
      return;
    }

    designLayer = L.layerGroup().addTo(map);

    L.geoJSON(workOrder.design_assets, {
      style: {
        color: "#2c3e50",
        dashArray: "5, 10",
        weight: 3,
        opacity: 0.8,
      },
      pointToLayer: (f, latlng) => {
        const assetType = f.properties.asset_type || f.properties.type || "";
        if (assetType.toLowerCase() === "transformer") {
          const size = 12;
          return L.marker(latlng, {
            icon: L.divIcon({
              className: "transformer-marker",
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
              html: `<div style="width:${size}px;height:${size}px;background:#2c3e50;border:2px solid #fff;transform:rotate(45deg);"></div>`,
            }),
          });
        }
        return L.circleMarker(latlng, {
          radius: 5,
          fillColor: "#2c3e50",
          color: "#fff",
          weight: 1,
          fillOpacity: 1,
        });
      },
      onEachFeature: (feature, layer) => {
        const assetType =
          feature.properties.asset_type || feature.properties.type || "Unknown";

        if (feature.geometry.type === "LineString") {
          const coords = feature.geometry.coordinates;
          const length = calculateLineLength(coords);
          const lengthStr =
            length < 1000
              ? `${length.toFixed(1)}m`
              : `${(length / 1000).toFixed(2)}km`;

          layer.bindPopup(
            `<b>DESIGN: ${assetType}</b><br>Length: ${lengthStr}<br>Status: ${feature.properties.status}`,
          );

          const midIdx = Math.floor(coords.length / 2);
          const midPoint = coords[midIdx];
          const label = L.marker([midPoint[1], midPoint[0]], {
            icon: L.divIcon({
              className: "cable-length-label",
              html: `<span>${lengthStr}</span>`,
              iconSize: [50, 20],
              iconAnchor: [25, 10],
            }),
          });
          designLayer.addLayer(label);
        } else {
          layer.bindPopup(
            `<b>DESIGN: ${assetType}</b><br>Status: ${feature.properties.status}`,
          );
        }
      },
    }).addTo(designLayer);
  };

  const bindFeatureClick = (handler) => {
    featureClickHandler = handler;
  };

  const renderSingleRedMarker = (feature) => {
    if (!map) return;
    const marker = L.circleMarker(
      [feature.geometry.coordinates[1], feature.geometry.coordinates[0]],
      {
        radius: 7,
        fillColor: "#e74c3c",
        color: "#c0392b",
        weight: 2,
        fillOpacity: 1,
      },
    );

    if (featureClickHandler) {
      marker.on("click", (e) => {
        featureClickHandler(e);
        L.DomEvent.stopPropagation(e);
      });
    }

    const p = feature.properties;
    const syncStatus = feature.pending_sync === 1 ? "Unsynced" : "Synced";
    const photoHtml = p.photo
      ? `<img src="${p.photo}" style="width:100%; max-height:100px; object-fit:cover; border-radius:4px; margin:8px 0;">`
      : "";

    let popupContent = "";

    if (p.assetType === "Transformer") {
      const gradeColors = {
        1: "#27ae60",
        2: "#2ecc71",
        3: "#f1c40f",
        4: "#e67e22",
        5: "#e74c3c",
      };
      const getGradeDot = (grade) => {
        const color = gradeColors[grade] || "#95a5a6";
        return `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${color}; margin-right:4px;"></span>`;
      };

      const tankIssues = p.tankIssues || {};
      const issuesList = [];
      if (tankIssues.surfaceRust) issuesList.push("Surface Rust");
      if (tankIssues.pitting) issuesList.push("Pitting");
      if (tankIssues.weepingOil) issuesList.push("Weeping Oil");
      if (tankIssues.activeLeak) issuesList.push("Active Leak");
      const issuesText = issuesList.length > 0 ? issuesList.join(", ") : "None";

      const gmtData =
        p.mounting === "Ground Mounted" &&
        (p.oilAcidity || p.moistureContent || p.breakdownStrength)
          ? `<hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
           <b>Oil Analysis</b><br>
           Acidity: ${p.oilAcidity ?? "—"} mgKOH/g<br>
           Moisture: ${p.moistureContent ?? "—"} ppm<br>
           Breakdown: ${p.breakdownStrength ?? "—"} kV`
          : "";

      popupContent = `
        <div style="min-width:220px; font-size:0.85rem;">
          <b style="font-size:1rem;">${p.name}</b><br>
          <span style="color:#7f8c8d;">${syncStatus}</span>
          ${photoHtml}
          <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
          <b>Specification</b><br>
          ${p.mounting || "—"} | ${p.rating || "—"} kVA<br>
          ${p.manufacturer || "—"} (${p.yearOfManufacture || "—"})<br>
          Serial: ${p.serialNo || "—"}<br>
          Cooling: ${p.coolingMedium || "—"}<br>
          Breather: ${p.breatherType || "—"}
          <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
          <b>Condition</b><br>
          ${getGradeDot(p.tankGrade)}Tank Grade: ${p.tankGrade || "—"}<br>
          Issues: ${issuesText}<br>
          ${getGradeDot(p.finsGrade)}Fins Grade: ${p.finsGrade || "—"}<br>
          Bushings: ${p.bushings || "—"}<br>
          Silica Gel: ${p.silicaGel || "—"}<br>
          Oil Level: ${p.oilLevel || "—"}
          ${gmtData}
          <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
          <b>CoF</b><br>
          Bunding: ${p.bunding || "—"}<br>
          Watercourse: ${p.watercourseProximity || "—"}
          <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
          <button onclick="deleteAsset(${feature.id})" style="width:100%; padding:6px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer;">Delete Asset</button>
        </div>
      `;
    } else {
      const conditionColors = {
        None: "#27ae60",
        Minor: "#f1c40f",
        "Surface Softening": "#f1c40f",
        Low: "#f1c40f",
        "Surface Rust": "#f1c40f",
        Significant: "#e67e22",
        Medium: "#e67e22",
        Pitting: "#e67e22",
        Critical: "#e74c3c",
        "Advanced Decay": "#e74c3c",
        High: "#e74c3c",
        "Section Loss": "#e74c3c",
      };

      const getConditionDot = (value) => {
        const color = conditionColors[value] || "#95a5a6";
        return `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${color}; margin-right:4px;"></span>`;
      };

      popupContent = `
        <div style="min-width:200px; font-size:0.85rem;">
          <b style="font-size:1rem;">${p.name}</b><br>
          <span style="color:#7f8c8d;">${syncStatus}</span>
          ${photoHtml}
          <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
          <b>Specification</b><br>
          ${p.material || "—"} | ${p.height || "—"} | ${p.stoutness || "—"}<br>
          Treatment: ${p.treatment || "—"}<br>
          Transformers: ${p.transformers ?? "—"}
          <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
          <b>Condition</b><br>
          ${getConditionDot(p.topRot)}Top Rot: ${p.topRot || "—"}<br>
          ${getConditionDot(p.externalRot)}External Rot: ${p.externalRot || "—"}<br>
          ${getConditionDot(p.birdDamage)}Bird Damage: ${p.birdDamage || "—"}<br>
          Verticality: ${p.verticality || "—"}<br>
          ${getConditionDot(p.steelCorrosion)}Steel Corrosion: ${p.steelCorrosion || "—"}<br>
          Sound Test: ${p.soundTest || "—"}
          <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
          <button onclick="deleteAsset(${feature.id})" style="width:100%; padding:6px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer;">Delete Asset</button>
        </div>
      `;
    }

    if (feature.pending_sync === 1) {
      marker.setStyle({ fillOpacity: 0.5, dashArray: "2, 2" });
    }
    marker.bindPopup(popupContent, { maxWidth: 300 });
    marker.addTo(map);
  };

  const renderSingleRedLine = (feature) => {
    if (!map) return;
    const latlngs = feature.geometry.coordinates.map((coord) => [
      coord[1],
      coord[0],
    ]);

    const polyline = L.polyline(latlngs, {
      color: "#e74c3c",
      weight: 4,
      opacity: 0.8,
    });

    const syncStatus = feature.pending_sync === 1 ? "(Unsynced)" : "Synced";
    const p = feature.properties;

    const formatCondition = (value) => {
      const colors = {
        None: "#27ae60",
        Minor: "#f39c12",
        Significant: "#e67e22",
        Critical: "#e74c3c",
      };
      const color = colors[value] || "#999";
      return `<span style="color:${color}; font-weight:bold;">${value || "N/A"}</span>`;
    };

    let popupContent = `
      <div style="min-width:200px;">
        <b style="font-size:14px;">${p.name || "Cable"}</b>
        <span style="float:right; font-size:11px; color:#666;">${syncStatus}</span>
        <hr style="margin:8px 0; border:none; border-top:1px solid #ddd;">
    `;

    if (p.voltageLevel || p.cableType || p.conductorMaterial) {
      popupContent += `
        <div style="margin-bottom:8px;">
          <b style="font-size:11px; color:#666;">SPECIFICATION</b><br>
          ${p.voltageLevel ? `<b>Voltage:</b> ${p.voltageLevel}<br>` : ""}
          ${p.cableType ? `<b>Type:</b> ${p.cableType}<br>` : ""}
          ${p.conductorMaterial ? `<b>Conductor:</b> ${p.conductorMaterial}<br>` : ""}
          ${p.crossSectionalArea ? `<b>CSA:</b> ${p.crossSectionalArea} mm²<br>` : ""}
          ${p.cores ? `<b>Cores:</b> ${p.cores}<br>` : ""}
          ${p.installationYear ? `<b>Installed:</b> ${p.installationYear}<br>` : ""}
        </div>
      `;
    }

    if (p.dutyFactor || p.situation || p.topography) {
      popupContent += `
        <div style="margin-bottom:8px;">
          <b style="font-size:11px; color:#666;">ENVIRONMENT</b><br>
          ${p.dutyFactor ? `<b>Duty Factor:</b> ${p.dutyFactor}<br>` : ""}
          ${p.situation ? `<b>Situation:</b> ${p.situation}<br>` : ""}
          ${p.topography ? `<b>Topography:</b> ${p.topography}<br>` : ""}
        </div>
      `;
    }

    if (p.sheathCondition || p.jointCondition) {
      popupContent += `
        <div style="margin-bottom:8px;">
          <b style="font-size:11px; color:#666;">CONDITION</b><br>
          ${p.sheathCondition ? `<b>Sheath:</b> ${formatCondition(p.sheathCondition)}<br>` : ""}
          ${p.jointCondition ? `<b>Joints:</b> ${formatCondition(p.jointCondition)}<br>` : ""}
          ${p.jointsCount !== undefined ? `<b>Joint Count:</b> ${p.jointsCount}<br>` : ""}
          ${p.historicalFaults !== undefined ? `<b>Historical Faults:</b> ${p.historicalFaults}<br>` : ""}
        </div>
      `;
    }

    if (p.knownIssues) {
      const issues = [];
      if (p.knownIssues.thirdPartyDamageRisk) issues.push("Third Party Risk");
      if (p.knownIssues.partialDischarge) issues.push("Partial Discharge");
      if (p.knownIssues.thermalIssues) issues.push("Thermal Issues");
      if (issues.length > 0) {
        popupContent += `
          <div style="margin-bottom:8px;">
            <b style="font-size:11px; color:#666;">ISSUES</b><br>
            <span style="color:#e74c3c;">${issues.join(", ")}</span>
          </div>
        `;
      }
    }

    popupContent += `
        <button onclick="deleteAsset(${feature.id})" style="width:100%; padding:6px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer;">Delete Asset</button>
      </div>
    `;

    if (feature.pending_sync === 1) {
      polyline.setStyle({ dashArray: "10, 10", opacity: 0.5 });
    }
    polyline.bindPopup(popupContent, { maxWidth: 300 });
    polyline.addTo(map);
  };

  const clearRedLayers = () => {
    if (!map) return;
    map.eachLayer((layer) => {
      if (
        (layer instanceof L.CircleMarker &&
          layer.options.fillColor === "#e74c3c") ||
        (layer instanceof L.Polyline && layer.options.color === "#e74c3c")
      ) {
        map.removeLayer(layer);
      }
    });
  };

  const loadAsBuilt = async () => {
    clearRedLayers();
    const localFeatures = await DB.getAssets();
    localFeatures.forEach((f) => {
      if (f.geometry.type === "Point") renderSingleRedMarker(f);
      if (f.geometry.type === "LineString") renderSingleRedLine(f);
    });
  };

  return {
    initMap,
    setBounds,
    renderJobPackLayers,
    loadAsBuilt,
    bindFeatureClick,
    getMap: () => map,
  };
})();

window.MapController = MapController;
