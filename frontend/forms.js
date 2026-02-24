// ============================================================
// FORM TEMPLATES - Template literals for asset data forms
// ============================================================

// SHARED: Photo Attachment Section
const photoAttachmentTemplate = `
  <div class="form-section">
    <div class="form-section-title">Photo Attachment</div>
    <div class="form-group">
      <label class="photo-upload" id="photo-upload-label">
        <input type="file" id="photo" name="photo" accept="image/*" capture="environment" />
        <span class="photo-upload-text">📷 Tap to capture or select photo</span>
        <img id="photo-preview" class="photo-preview" alt="Preview" />
      </label>
    </div>
  </div>
`;

// ==================== POLE FORM TEMPLATE ====================
const poleFormTemplate = `
  <!-- CORE SPECIFICATION -->
  <div class="form-section">
    <div class="form-section-title">Core Specification</div>

    <div class="form-group">
      <label for="material">Material</label>
      <select id="material" name="material">
        <option value="Wood">Wood</option>
        <option value="Steel">Steel</option>
        <option value="Concrete">Concrete</option>
        <option value="Composite">Composite</option>
      </select>
    </div>

    <div class="form-group">
      <label for="treatment">Treatment Type</label>
      <select id="treatment" name="treatment">
        <option value="Creosote">Creosote</option>
        <option value="Water Soluble (CCA)">Water Soluble (CCA)</option>
        <option value="Light Oil">Light Oil</option>
        <option value="N/A">N/A</option>
      </select>
    </div>

    <div class="form-group">
      <label for="stoutness">Pole Stoutness</label>
      <select id="stoutness" name="stoutness">
        <option value="Light">Light</option>
        <option value="Medium">Medium</option>
        <option value="Stout">Stout</option>
      </select>
    </div>

    <div class="form-group">
      <label for="height">Height / Class</label>
      <select id="height" name="height">
        <option value="9m">9m</option>
        <option value="11m">11m</option>
        <option value="13m">13m</option>
      </select>
    </div>

    <div class="form-group">
      <label for="transformers">Number of Transformers</label>
      <input type="number" id="transformers" name="transformers" min="0" max="4" value="0" />
    </div>
  </div>

  <!-- INSPECTION / CONDITION -->
  <div class="form-section">
    <div class="form-section-title">Inspection / Condition</div>

    <div class="form-group">
      <label>Pole Top Rot</label>
      <div class="traffic-light" data-field="topRot">
        <button type="button" class="traffic-light-btn green" data-value="None">None</button>
        <button type="button" class="traffic-light-btn yellow" data-value="Minor">Minor</button>
        <button type="button" class="traffic-light-btn orange" data-value="Significant">Significant</button>
        <button type="button" class="traffic-light-btn red" data-value="Critical">Critical</button>
      </div>
    </div>

    <div class="form-group">
      <label>External Rot (Ground Level)</label>
      <div class="traffic-light" data-field="externalRot">
        <button type="button" class="traffic-light-btn green" data-value="None">None</button>
        <button type="button" class="traffic-light-btn yellow" data-value="Surface Softening">Surface</button>
        <button type="button" class="traffic-light-btn red" data-value="Advanced Decay">Decay</button>
      </div>
    </div>

    <div class="form-group">
      <label>Woodpecker / Bird Damage</label>
      <div class="traffic-light" data-field="birdDamage">
        <button type="button" class="traffic-light-btn green" data-value="None">None</button>
        <button type="button" class="traffic-light-btn yellow" data-value="Low">Low</button>
        <button type="button" class="traffic-light-btn orange" data-value="Medium">Medium</button>
        <button type="button" class="traffic-light-btn red" data-value="High">High</button>
      </div>
    </div>

    <div class="form-group">
      <label for="verticality">Verticality</label>
      <select id="verticality" name="verticality">
        <option value="Plumb">Plumb</option>
        <option value="Leaning <5°">Leaning &lt;5°</option>
        <option value="Leaning >5°">Leaning &gt;5°</option>
      </select>
    </div>

    <div class="form-group">
      <label>Steel Corrosion (if applicable)</label>
      <div class="traffic-light" data-field="steelCorrosion">
        <button type="button" class="traffic-light-btn green" data-value="None">None</button>
        <button type="button" class="traffic-light-btn yellow" data-value="Surface Rust">Surface</button>
        <button type="button" class="traffic-light-btn orange" data-value="Pitting">Pitting</button>
        <button type="button" class="traffic-light-btn red" data-value="Section Loss">Section Loss</button>
      </div>
    </div>

    <div class="form-group">
      <label for="soundTest">Sound Test Result</label>
      <select id="soundTest" name="soundTest">
        <option value="Solid">Solid</option>
        <option value="Hollow">Hollow</option>
        <option value="Indeterminate">Indeterminate</option>
      </select>
    </div>
  </div>

  ${photoAttachmentTemplate}
`;

// ==================== TRANSFORMER FORM TEMPLATE ====================
const transformerFormTemplate = `
  <!-- CORE SPECIFICATION -->
  <div class="form-section">
    <div class="form-section-title">Core Specification</div>

    <div class="form-group">
      <label for="tx-mounting">Mounting Type</label>
      <select id="tx-mounting" name="tx-mounting" onchange="toggleGMTFields()">
        <option value="Pole Mounted">Pole Mounted (PMT)</option>
        <option value="Ground Mounted">Ground Mounted (GMT)</option>
      </select>
    </div>

    <div class="form-group">
      <label for="tx-rating">Rating (kVA)</label>
      <select id="tx-rating" name="tx-rating">
        <option value="25">25 kVA</option>
        <option value="50">50 kVA</option>
        <option value="100">100 kVA</option>
        <option value="200">200 kVA</option>
        <option value="315">315 kVA</option>
        <option value="500">500 kVA</option>
        <option value="750">750 kVA</option>
        <option value="1000">1000 kVA</option>
      </select>
    </div>

    <div class="form-group">
      <label for="tx-manufacturer">Manufacturer</label>
      <input type="text" id="tx-manufacturer" name="tx-manufacturer" placeholder="e.g., ABB, Siemens" />
    </div>

    <div class="form-group">
      <label for="tx-serial">Serial Number</label>
      <input type="text" id="tx-serial" name="tx-serial" placeholder="Enter serial number" />
    </div>

    <div class="form-group">
      <label for="tx-year">Year of Manufacture</label>
      <input type="number" id="tx-year" name="tx-year" min="1950" max="2030" placeholder="e.g., 2015" />
    </div>

    <div class="form-group">
      <label for="tx-cooling">Cooling Medium</label>
      <select id="tx-cooling" name="tx-cooling">
        <option value="Mineral Oil">Mineral Oil</option>
        <option value="Midel (Ester)">Midel (Ester)</option>
        <option value="Dry Type">Dry Type</option>
      </select>
    </div>

    <div class="form-group">
      <label for="tx-breather">Breather Type</label>
      <select id="tx-breather" name="tx-breather">
        <option value="Free Breathing">Free Breathing</option>
        <option value="Hermetically Sealed">Hermetically Sealed</option>
      </select>
    </div>
  </div>

  <!-- INSPECTION / CONDITION -->
  <div class="form-section">
    <div class="form-section-title">Inspection / Condition</div>

    <div class="form-group">
      <label>Main Tank Condition (Grade 1-5)</label>
      <div class="grade-selector" data-field="tx-tankGrade">
        <button type="button" class="grade-btn grade-1" data-value="1">1 New</button>
        <button type="button" class="grade-btn grade-2" data-value="2">2 Good</button>
        <button type="button" class="grade-btn grade-3" data-value="3">3 Fair</button>
        <button type="button" class="grade-btn grade-4" data-value="4">4 Poor</button>
        <button type="button" class="grade-btn grade-5" data-value="5">5 Failed</button>
      </div>
    </div>

    <div class="form-group">
      <label>Main Tank Issues</label>
      <div class="checkbox-group">
        <label class="checkbox-item">
          <input type="checkbox" name="tx-surfaceRust" value="1" />
          Surface Rust
        </label>
        <label class="checkbox-item">
          <input type="checkbox" name="tx-pitting" value="1" />
          Pitting
        </label>
        <label class="checkbox-item">
          <input type="checkbox" name="tx-weepingOil" value="1" />
          Weeping Oil
        </label>
        <label class="checkbox-item">
          <input type="checkbox" name="tx-activeLeak" value="1" />
          Active Leak
        </label>
      </div>
    </div>

    <div class="form-group">
      <label>Cooling Fins / Radiator (Grade 1-5)</label>
      <div class="grade-selector" data-field="tx-finsGrade">
        <button type="button" class="grade-btn grade-1" data-value="1">1</button>
        <button type="button" class="grade-btn grade-2" data-value="2">2</button>
        <button type="button" class="grade-btn grade-3" data-value="3">3</button>
        <button type="button" class="grade-btn grade-4" data-value="4">4</button>
        <button type="button" class="grade-btn grade-5" data-value="5">5</button>
      </div>
    </div>

    <div class="form-group">
      <label for="tx-bushings">Bushings</label>
      <select id="tx-bushings" name="tx-bushings">
        <option value="Good">Good</option>
        <option value="Chipped">Chipped</option>
        <option value="Cracked">Cracked</option>
        <option value="Leaking">Leaking</option>
      </select>
    </div>

    <div class="form-group">
      <label for="tx-silicaGel">Silica Gel State</label>
      <select id="tx-silicaGel" name="tx-silicaGel">
        <option value="Blue/Orange (Good)">Blue/Orange (Good)</option>
        <option value="Pink/Green (Saturated)">Pink/Green (Saturated)</option>
      </select>
    </div>

    <div class="form-group">
      <label for="tx-oilLevel">Oil Level</label>
      <select id="tx-oilLevel" name="tx-oilLevel">
        <option value="Normal">Normal</option>
        <option value="Low">Low</option>
        <option value="Critical">Critical</option>
      </select>
    </div>
  </div>

  <!-- ADVANCED DATA (GMT ONLY) -->
  <div id="gmt-only-fields" class="form-section gmt-only-section">
    <div class="form-section-title">Advanced Data (Ground Mounted)</div>

    <div class="form-group">
      <label for="tx-oilAcidity">Oil Acidity (mgKOH/g)</label>
      <input type="number" id="tx-oilAcidity" name="tx-oilAcidity" step="0.01" min="0" placeholder="e.g., 0.15" />
    </div>

    <div class="form-group">
      <label for="tx-moisture">Moisture Content (ppm)</label>
      <input type="number" id="tx-moisture" name="tx-moisture" min="0" placeholder="e.g., 25" />
    </div>

    <div class="form-group">
      <label for="tx-breakdown">Breakdown Strength (kV)</label>
      <input type="number" id="tx-breakdown" name="tx-breakdown" min="0" placeholder="e.g., 45" />
    </div>
  </div>

  <!-- CONSEQUENCE OF FAILURE -->
  <div class="form-section">
    <div class="form-section-title">Consequence of Failure (CoF)</div>

    <div class="form-group">
      <label for="tx-bunding">Bunding</label>
      <select id="tx-bunding" name="tx-bunding">
        <option value="None">None</option>
        <option value="Concrete">Concrete</option>
        <option value="Gravel">Gravel</option>
      </select>
    </div>

    <div class="form-group">
      <label for="tx-watercourse">Proximity to Watercourse</label>
      <select id="tx-watercourse" name="tx-watercourse">
        <option value=">50m">&gt;50m</option>
        <option value="10-50m">10-50m</option>
        <option value="<10m">&lt;10m (Critical)</option>
      </select>
    </div>
  </div>

  ${photoAttachmentTemplate}
`;

// ==================== CABLE FORM TEMPLATE ====================
const cableFormTemplate = `
  <!-- CORE SPECIFICATION -->
  <div class="form-section">
    <div class="form-section-title">Core Specification</div>
    
    <div class="form-group">
      <label for="cable-voltage">Voltage Level</label>
      <select id="cable-voltage" name="cable-voltage">
        <option value="">-- Select --</option>
        <option value="LV">LV (Low Voltage)</option>
        <option value="HV">HV (High Voltage)</option>
        <option value="20kV">20kV</option>
        <option value="33kV">33kV</option>
      </select>
    </div>

    <div class="form-group">
      <label for="cable-type">Cable Type</label>
      <select id="cable-type" name="cable-type">
        <option value="">-- Select --</option>
        <option value="PILC">PILC (Paper Insulated Lead Covered)</option>
        <option value="XLPE">XLPE (Cross-Linked Polyethylene)</option>
        <option value="CAS">CAS (Consac Aluminium Sheathed)</option>
        <option value="Consac">Consac</option>
        <option value="Waveform">Waveform</option>
      </select>
    </div>

    <div class="form-group">
      <label for="cable-conductor">Conductor Material</label>
      <select id="cable-conductor" name="cable-conductor">
        <option value="">-- Select --</option>
        <option value="Copper">Copper</option>
        <option value="Aluminium">Aluminium</option>
        <option value="ACSR">ACSR (Aluminium Conductor Steel Reinforced)</option>
      </select>
    </div>

    <div class="form-group">
      <label for="cable-csa">Cross-Sectional Area (mm²)</label>
      <select id="cable-csa" name="cable-csa">
        <option value="">-- Select --</option>
        <option value="25">25 mm²</option>
        <option value="35">35 mm²</option>
        <option value="50">50 mm²</option>
        <option value="70">70 mm²</option>
        <option value="95">95 mm²</option>
        <option value="120">120 mm²</option>
        <option value="150">150 mm²</option>
        <option value="185">185 mm²</option>
        <option value="240">240 mm²</option>
        <option value="300">300 mm²</option>
      </select>
    </div>

    <div class="form-group">
      <label for="cable-cores">Number of Cores</label>
      <select id="cable-cores" name="cable-cores">
        <option value="">-- Select --</option>
        <option value="1">1 Core</option>
        <option value="3">3 Core</option>
        <option value="4">4 Core</option>
      </select>
    </div>

    <div class="form-group">
      <label for="cable-year">Installation Year</label>
      <input type="number" id="cable-year" name="cable-year" min="1900" max="2099" placeholder="e.g. 1985" />
    </div>
  </div>

  <!-- LOADING & ENVIRONMENT -->
  <div class="form-section">
    <div class="form-section-title">Loading & Environment</div>

    <div class="form-group">
      <label for="cable-duty">Duty Factor (%)</label>
      <select id="cable-duty" name="cable-duty">
        <option value="">-- Select --</option>
        <option value="<50">&lt;50% (Lightly Loaded)</option>
        <option value="50-75">50-75% (Normal)</option>
        <option value="75-100">75-100% (Heavily Loaded)</option>
        <option value=">100">&gt;100% (Overloaded)</option>
      </select>
    </div>

    <div class="form-group">
      <label for="cable-situation">Situation</label>
      <select id="cable-situation" name="cable-situation">
        <option value="">-- Select --</option>
        <option value="Direct Buried">Direct Buried</option>
        <option value="Ducted">Ducted</option>
        <option value="Trough">Trough</option>
        <option value="Submarine">Submarine</option>
        <option value="Overhead">Overhead (ABC)</option>
      </select>
    </div>

    <div class="form-group">
      <label for="cable-topography">Topography</label>
      <select id="cable-topography" name="cable-topography">
        <option value="">-- Select --</option>
        <option value="Urban">Urban</option>
        <option value="Rural">Rural</option>
        <option value="Coastal">Coastal</option>
        <option value="Industrial">Industrial</option>
      </select>
    </div>
  </div>

  <!-- CONDITION ASSESSMENT -->
  <div class="form-section">
    <div class="form-section-title">Condition Assessment</div>

    <div class="form-group">
      <label>Sheath Condition</label>
      <div class="traffic-light" data-field="cable-sheath">
        <button type="button" class="traffic-light-btn green" data-value="None">None</button>
        <button type="button" class="traffic-light-btn yellow" data-value="Minor">Minor</button>
        <button type="button" class="traffic-light-btn orange" data-value="Significant">Signif.</button>
        <button type="button" class="traffic-light-btn red" data-value="Critical">Critical</button>
      </div>
    </div>

    <div class="form-group">
      <label>Joint Condition</label>
      <div class="traffic-light" data-field="cable-joints">
        <button type="button" class="traffic-light-btn green" data-value="None">None</button>
        <button type="button" class="traffic-light-btn yellow" data-value="Minor">Minor</button>
        <button type="button" class="traffic-light-btn orange" data-value="Significant">Signif.</button>
        <button type="button" class="traffic-light-btn red" data-value="Critical">Critical</button>
      </div>
    </div>

    <div class="form-group">
      <label for="cable-joints-count">Number of Joints</label>
      <input type="number" id="cable-joints-count" name="cable-joints-count" min="0" placeholder="e.g. 2" />
    </div>

    <div class="form-group">
      <label for="cable-faults">Historical Fault Count</label>
      <input type="number" id="cable-faults" name="cable-faults" min="0" placeholder="e.g. 0" />
    </div>

    <div class="form-group checkbox-group">
      <label class="checkbox-group-title">Known Issues</label>
      <label>
        <input type="checkbox" name="cable-thirdParty" id="cable-thirdParty" />
        Third Party Damage Risk
      </label>
      <label>
        <input type="checkbox" name="cable-partialDischarge" id="cable-partialDischarge" />
        Partial Discharge Detected
      </label>
      <label>
        <input type="checkbox" name="cable-thermal" id="cable-thermal" />
        Thermal Issues
      </label>
    </div>
  </div>

  ${photoAttachmentTemplate}
`;

// ============================================================
// FORM TEMPLATE REGISTRY
// ============================================================
const formTemplates = {
  Pole: poleFormTemplate,
  Transformer: transformerFormTemplate,
  Cable: cableFormTemplate,
};

// Helper function to get form template by asset type
function getFormTemplate(assetType) {
  return formTemplates[assetType] || poleFormTemplate;
}
