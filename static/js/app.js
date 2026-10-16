/**
 * Kavach Smart Helmet - IoE Navigation, Speed Monitoring & Accident Detection
 * Django Frontend Application Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State - Defaults to Standby / Waiting for Real ESP32 Data
  const state = {
    connected: false,
    helmetWorn: false,
    speed: 0.0,
    maxSpeed: 0.0,
    avgSpeed: 0.0,
    totalDistance: 0.0,
    tripMinutes: 0,
    overspeedLimit: 60.0,
    overspeedAlert: false,

    // MPU6050 6-DOF IMU
    totalG: 1.00,
    tiltAngle: 0.0,
    accelX: 0.00,
    accelY: 0.00,
    accelZ: 1.00,
    peakG: 1.00,

    // Required Li-Ion Battery Telemetry
    batteryPercent: 0,
    batteryVoltage: 0.0,
    isCharging: false,

    // Emergency & 15-Second Accident Window
    sosActive: false,
    accidentActive: false,
    inCountdown: false,
    countdownTimer: null,
    countdownRemaining: 15,

    // Navigation State (Dombivli / Kalyan, Maharashtra, India)
    navigation: {
      active: false,
      destinationName: 'Dombivli Railway Station',
      destLat: 19.2184,
      destLng: 73.0867,
      distanceRemainingKm: 2.1,
      etaMinutes: 6,
      instruction: 'Head towards Dombivli Station Road',
      turnType: 'STRAIGHT',
      stepIndex: 1
    },

    // GPS Location & Trail (Default Dombivli, Maharashtra until ESP32 GPS lock)
    location: {
      lat: 19.2184,
      lng: 73.0867,
      alt: 15,
      heading: 0,
      satellites: 8
    },
    trail: [],
    logs: [],
    simRunning: false,
    simInterval: null,
    simRouteIndex: 0
  };

  // Turn-by-Turn Navigation & GPS Waypoints (Dombivli - Thakurli - Kalyan Corridor)
  const demoRoute = [
    { lat: 19.21840, lng: 73.08670, speed: 0, heading: 45, turn: 'STRAIGHT', inst: 'Head north on Station Road', dist: 2.8, eta: 8 },
    { lat: 19.22010, lng: 73.08950, speed: 28, heading: 50, turn: 'TURN_RIGHT', inst: 'Turn right towards Kopar Road', dist: 2.3, eta: 6 },
    { lat: 19.22230, lng: 73.09350, speed: 42, heading: 60, turn: 'STRAIGHT', inst: 'Continue straight along Thakurli link road', dist: 1.8, eta: 5 },
    { lat: 19.22460, lng: 73.09780, speed: 35, heading: 55, turn: 'TURN_LEFT', inst: 'Approaching Thakurli Station Junction', dist: 1.2, eta: 3 },
    { lat: 19.22850, lng: 73.10600, speed: 48, heading: 70, turn: 'STRAIGHT', inst: 'Continue towards Kalyan Junction', dist: 0.7, eta: 2 },
    { lat: 19.23610, lng: 73.13070, speed: 15, heading: 40, turn: 'DESTINATION', inst: 'You have reached destination: Kalyan Junction', dist: 0.0, eta: 0 }
  ];

  // DOM Elements Cache
  const els = {
    // Header
    connectionChip: document.getElementById('connection-status-chip'),
    connectionLabel: document.getElementById('connection-label'),
    headerWearChip: document.getElementById('header-wear-chip'),
    headerWearText: document.getElementById('header-wear-text'),
    headerOverspeedChip: document.getElementById('header-overspeed-chip'),
    batteryFill: document.getElementById('battery-fill'),
    batteryPctText: document.getElementById('battery-pct-text'),
    batteryVoltageText: document.getElementById('battery-voltage-text'),
    batteryChargingIcon: document.getElementById('battery-charging-icon'),
    soundToggleBtn: document.getElementById('sound-toggle-btn'),
    soundIcon: document.getElementById('sound-icon'),
    toggleSimBtn: document.getElementById('toggle-sim-btn'),
    
    // Emergency Banner
    emergencyBanner: document.getElementById('emergency-banner'),
    emergencyTitle: document.getElementById('emergency-title'),
    emergencyCoords: document.getElementById('emergency-coords'),
    emergencyTime: document.getElementById('emergency-time'),
    emergencySpeed: document.getElementById('emergency-speed'),
    emergencyMapsBtn: document.getElementById('emergency-maps-btn'),
    resolveEmergencyBtn: document.getElementById('resolve-emergency-btn'),
    whatsappSosLink: document.getElementById('whatsapp-sos-link'),
    manualSosTriggerBtn: document.getElementById('manual-sos-trigger-btn'),
    
    // 15-Second Accident Modal
    accidentModal: document.getElementById('accident-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    countdownSeconds: document.getElementById('countdown-seconds'),
    countdownProgress: document.getElementById('countdown-progress'),
    modalImpactForce: document.getElementById('modal-impact-force'),
    modalImpactTilt: document.getElementById('modal-impact-tilt'),
    modalImpactSpeed: document.getElementById('modal-impact-speed'),
    cancelAccidentBtn: document.getElementById('cancel-accident-btn'),
    instantAlertBtn: document.getElementById('instant-alert-btn'),

    // Map & Navigation HUD
    satellitesCount: document.getElementById('satellites-count'),
    centerMapBtn: document.getElementById('center-map-btn'),
    clearTrailBtn: document.getElementById('clear-trail-btn'),
    toggleLayerBtn: document.getElementById('toggle-layer-btn'),
    hudLat: document.getElementById('hud-lat'),
    hudLng: document.getElementById('hud-lng'),
    hudAlt: document.getElementById('hud-alt'),
    hudHeading: document.getElementById('hud-heading'),
    navTurnIcon: document.getElementById('nav-turn-icon'),
    navInstructionText: document.getElementById('nav-instruction-text'),
    navDestName: document.getElementById('nav-dest-name'),
    navDistRem: document.getElementById('nav-dist-rem'),
    navEtaMin: document.getElementById('nav-eta-min'),
    replayNavVoiceBtn: document.getElementById('replay-nav-voice-btn'),

    // Helmet Wear Card
    wearGraphicContainer: document.getElementById('wear-graphic-container'),
    helmetVisual: document.getElementById('helmet-visual'),
    helmetVisualIcon: document.getElementById('helmet-visual-icon'),
    wearStateBadge: document.getElementById('wear-state-badge'),
    wearDesc: document.getElementById('wear-desc'),

    // Speed Monitoring
    speedVal: document.getElementById('speed-val'),
    speedoArcFill: document.getElementById('speedo-arc-fill'),
    speedMax: document.getElementById('speed-max'),
    speedAvg: document.getElementById('speed-avg'),
    totalDistanceVal: document.getElementById('total-distance-val'),
    tripTimeVal: document.getElementById('trip-time-val'),
    speedLimitTag: document.getElementById('speed-limit-tag'),
    overspeedLimitLabel: document.getElementById('overspeed-limit-label'),
    overspeedLimitSlider: document.getElementById('overspeed-limit-slider'),

    // MPU6050 IMU Card
    gForceBadge: document.getElementById('g-force-badge'),
    gForceBar: document.getElementById('g-force-bar'),
    tiltAngleBadge: document.getElementById('tilt-angle-badge'),
    tiltBar: document.getElementById('tilt-bar'),
    axVal: document.getElementById('ax-val'),
    ayVal: document.getElementById('ay-val'),
    azVal: document.getElementById('az-val'),

    // Logs Feed
    logStream: document.getElementById('log-stream'),
    clearLogsBtn: document.getElementById('clear-logs-btn'),
    exportLogsBtn: document.getElementById('export-logs-btn'),

    // Simulator Drawer
    simDrawer: document.getElementById('simulator-drawer'),
    simDrawerToggle: document.getElementById('sim-drawer-toggle'),
    simMinimizeBtn: document.getElementById('sim-minimize-btn'),
    simAutoDriveBtn: document.getElementById('sim-auto-drive-btn'),
    simStopDriveBtn: document.getElementById('sim-stop-drive-btn'),
    simSpeedSlider: document.getElementById('sim-speed-slider'),
    simSpeedVal: document.getElementById('sim-speed-val'),
    simWearToggle: document.getElementById('sim-wear-toggle'),
    simChargeToggle: document.getElementById('sim-charge-toggle'),
    simBattSlider: document.getElementById('sim-batt-slider'),
    simBattVal: document.getElementById('sim-batt-val'),
    simCrashBtn: document.getElementById('sim-crash-btn'),
    simSosButton: document.getElementById('sim-sos-button'),
    simGforceSlider: document.getElementById('sim-gforce-slider'),
    simGforceVal: document.getElementById('sim-gforce-val'),
    jsonPreview: document.getElementById('json-preview'),
    copyJsonBtn: document.getElementById('copy-json-btn')
  };

  // Leaflet Map Setup (Uses 100% Free Open-Source OpenStreetMap & CartoDB - ZERO API Key Required)
  let map, marker, destinationMarker, polyline, baseTileLayer;

  function initMap() {
    if (typeof L === 'undefined') {
      console.warn('Leaflet not loaded yet, retrying in 200ms...');
      setTimeout(initMap, 200);
      return;
    }

    try {
      map = L.map('leaflet-map', {
        zoomControl: true,
        attributionControl: true
      }).setView([state.location.lat, state.location.lng], 13);

      // 100% Free, High-Resolution Esri World Street Map (Zero API Key, Zero Watermarks, Never Blocked)
      baseTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri &copy; OpenStreetMap contributors'
      });

      // Automatic failover to Google Maps tile server if Esri is unreachable
      baseTileLayer.on('tileerror', function() {
        console.info('Switching to Google Maps tile mirror...');
        map.removeLayer(baseTileLayer);
        baseTileLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          attribution: '&copy; Google Maps'
        }).addTo(map);
      });

      baseTileLayer.addTo(map);
    } catch (e) {
      console.error('Error initializing Leaflet map:', e);
    }

    // Custom Glowing Helmet Marker
    const helmetIcon = L.divIcon({
      className: 'custom-helmet-pin',
      html: `
        <div class="pin-pulse"></div>
        <div class="pin-body">
          <i class="fa-solid fa-motorcycle"></i>
        </div>
      `,
      iconSize: [42, 42],
      iconAnchor: [21, 21]
    });

    marker = L.marker([state.location.lat, state.location.lng], { icon: helmetIcon }).addTo(map);

    // Destination Pin
    const destIcon = L.divIcon({
      className: 'custom-dest-pin',
      html: `
        <div class="dest-pin-body">
          <i class="fa-solid fa-flag-checkered"></i>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 36]
    });

    destinationMarker = L.marker([state.navigation.destLat, state.navigation.destLng], { icon: destIcon })
      .addTo(map)
      .bindPopup(`<b>Destination:</b> ${state.navigation.destinationName}`);

    // GPS Route Trail Polyline
    polyline = L.polyline([[state.location.lat, state.location.lng]], {
      color: '#3b82f6',
      weight: 4,
      opacity: 0.9,
      dashArray: '3, 6'
    }).addTo(map);

    // Set initial map viewport centered at default coordinates (Dombivli) until ESP32 NEO-M8N GPS lock arrives
    map.setView([state.location.lat, state.location.lng], 15);
  }

  // Update Location on Map & HUD
  function updateLocation(lat, lng, speed = 0, heading = 0) {
    state.location.lat = lat;
    state.location.lng = lng;
    state.location.heading = heading;

    if (marker) {
      marker.setLatLng([lat, lng]);
      const pinBody = document.querySelector('.pin-body');
      if (pinBody && heading) {
        pinBody.style.transform = `rotate(${heading}deg)`;
      }
    }

    if (polyline) {
      polyline.addLatLng([lat, lng]);
    }

    // Update navigation route polyline start if destination is active
    if (navRoutePolyline && state.navigation.active && state.navigation.destLat) {
      navRoutePolyline.setLatLngs([[lat, lng], [state.navigation.destLat, state.navigation.destLng]]);
    }

    // Update HUD
    els.hudLat.textContent = `${lat.toFixed(5)}° N`;
    els.hudLng.textContent = `${lng.toFixed(5)}° E`;
    els.hudHeading.textContent = `${Math.round(heading)}° ${getCompassHeading(heading)}`;
    els.whatsappSosLink.href = `https://wa.me/?text=EMERGENCY%20SOS%20from%20Kavach%20Smart%20Helmet!%20Location:%20https://maps.google.com/?q=${lat},${lng}`;
    els.emergencyMapsBtn.href = `https://maps.google.com/?q=${lat},${lng}`;

    updateJsonPreview();
  }

  function getCompassHeading(deg) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(deg / 45) % 8];
  }

  // Update Helmet Wear State
  function updateWearStatus(isWorn) {
    state.helmetWorn = isWorn;
    if (isWorn) {
      els.headerWearChip.className = 'status-chip wear-chip';
      els.headerWearText.textContent = 'Helmet Worn';
      els.wearStateBadge.className = 'wear-state-badge safe';
      els.wearStateBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> HELMET PROPERLY WORN';
      els.wearDesc.textContent = 'IR Beam engaged. Helmet properly secured on rider.';
      els.helmetVisual.classList.remove('unworn');
      window.audioEngine.playHelmetWorn();
    } else {
      els.headerWearChip.className = 'status-chip wear-chip danger';
      els.headerWearText.textContent = 'Helmet Not Worn';
      els.wearStateBadge.className = 'wear-state-badge danger';
      els.wearStateBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> HELMET NOT WORN';
      els.wearDesc.textContent = 'IR sensor detected helmet is removed! Voice reminder: "Please wear your helmet."';
      els.helmetVisual.classList.add('unworn');
      window.audioEngine.playHelmetRemoved();
    }
    updateJsonPreview();
  }

  // Update Speedometer & Speed Statistics
  function updateSpeedometer(speed) {
    state.speed = speed;
    els.speedVal.textContent = Math.round(speed);

    // SVG Speedometer Arc (max 100 km/h)
    const maxSpeedScale = 100;
    const clampedSpeed = Math.min(speed, maxSpeedScale);
    const strokeDash = 235.6; // Full arc length
    const offset = strokeDash - (clampedSpeed / maxSpeedScale) * strokeDash;
    els.speedoArcFill.style.strokeDashoffset = offset;

    // Check Max Speed
    if (speed > state.maxSpeed) {
      state.maxSpeed = Math.round(speed * 10) / 10;
      els.speedMax.innerHTML = `${state.maxSpeed} <small>km/h</small>`;
    }

    // Overspeed check (> 60 km/h)
    const isOverspeed = speed >= state.overspeedLimit;
    if (isOverspeed) {
      els.headerOverspeedChip.classList.remove('hidden');
      els.speedVal.classList.add('danger');
      if (!state.overspeedAlert) {
        state.overspeedAlert = true;
        window.audioEngine.playOverspeedAlert();
        addLog('OVERSPEED', `Speed exceeded limit: ${speed.toFixed(1)} km/h (Limit: ${state.overspeedLimit} km/h). Voice: "Please reduce your speed."`, 'warning');
      }
    } else {
      els.headerOverspeedChip.classList.add('hidden');
      els.speedVal.classList.remove('danger');
      state.overspeedAlert = false;
    }

    updateJsonPreview();
  }

  // Update MPU6050 IMU Data
  function updateIMU(totalG, tiltDeg, ax = 0.02, ay = -0.05, az = 0.99) {
    state.totalG = totalG;
    state.tiltAngle = tiltDeg;
    state.accelX = ax;
    state.accelY = ay;
    state.accelZ = az;

    els.gForceBadge.textContent = `${totalG.toFixed(2)} g`;
    els.tiltAngleBadge.textContent = `${tiltDeg.toFixed(1)}°`;
    els.axVal.textContent = `${ax.toFixed(2)}g`;
    els.ayVal.textContent = `${ay.toFixed(2)}g`;
    els.azVal.textContent = `${az.toFixed(2)}g`;

    // Progress bar fills
    const gPct = Math.min((totalG / 6.0) * 100, 100);
    const tiltPct = Math.min((tiltDeg / 90.0) * 100, 100);
    els.gForceBar.style.width = `${gPct}%`;
    els.tiltBar.style.width = `${tiltPct}%`;

    // Auto-detect Crash (Total G > 3.5g OR Tilt > 60 deg)
    if ((totalG >= 3.5 || tiltDeg >= 60) && !state.inCountdown && !state.accidentActive) {
      triggerAccidentCountdown(totalG, tiltDeg);
    }

    updateJsonPreview();
  }

  // 15-Second Accident Countdown Window
  function triggerAccidentCountdown(gForce, tilt) {
    state.inCountdown = true;
    state.countdownRemaining = 15;
    
    els.modalImpactForce.textContent = `${gForce.toFixed(2)} g`;
    els.modalImpactTilt.textContent = `${tilt.toFixed(1)}°`;
    els.modalImpactSpeed.textContent = `${state.speed.toFixed(1)} km/h`;
    els.accidentModal.classList.remove('hidden');

    // Voice announcement
    window.audioEngine.speakAccidentPrompt();
    addLog('ACCIDENT_ALERT', `MPU6050 Crash/Tilt Detected (${gForce.toFixed(2)}g, ${tilt.toFixed(1)}°). 15-second cancellation countdown started.`, 'warning');

    // Ticking countdown loop
    const totalCircumference = 2 * Math.PI * 52; // r=52 -> 326.7
    els.countdownProgress.style.strokeDasharray = totalCircumference;

    if (state.countdownTimer) clearInterval(state.countdownTimer);

    state.countdownTimer = setInterval(() => {
      state.countdownRemaining--;
      els.countdownSeconds.textContent = state.countdownRemaining;
      
      const offset = totalCircumference - (state.countdownRemaining / 15) * totalCircumference;
      els.countdownProgress.style.strokeDashoffset = offset;

      // Audio tick
      window.audioEngine.playCountdownTick(state.countdownRemaining);

      // Countdown expired -> Real Accident Confirmed!
      if (state.countdownRemaining <= 0) {
        clearInterval(state.countdownTimer);
        confirmAccidentImpact(gForce, tilt);
      }
    }, 1000);
  }

  // Cancel Accident / False Alarm (Rider Pressed Push Button)
  function cancelAccidentAlert() {
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    state.inCountdown = false;
    els.accidentModal.classList.add('hidden');
    window.audioEngine.speakCancelledPrompt();
    addLog('ACCIDENT_CANCEL', 'Accident alert cancelled by rider (Push button pressed within 15s window). False alarm avoided.', 'success');

    fetch('/api/emergency/cancel/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => {});
  }

  // Confirm Critical Accident (Countdown Expired or Instant Dispatch)
  function confirmAccidentImpact(gForce, tilt) {
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    state.inCountdown = false;
    state.accidentActive = true;
    els.accidentModal.classList.add('hidden');

    // Show Critical Emergency Banner
    els.emergencyTitle.textContent = 'CRITICAL ALERT: SEVERE ACCIDENT CONFIRMED';
    els.emergencyCoords.textContent = `${state.location.lat.toFixed(5)}° N, ${state.location.lng.toFixed(5)}° E`;
    els.emergencyTime.textContent = new Date().toLocaleTimeString();
    els.emergencySpeed.textContent = `${state.speed.toFixed(1)} km/h`;
    els.emergencyBanner.classList.remove('hidden');

    window.audioEngine.startSosSiren();
    addLog('CRITICAL_ACCIDENT', `CRITICAL ACCIDENT CONFIRMED! Emergency medical and police dispatch notified with live GPS coordinates.`, 'danger');

    fetch('/api/emergency/accident/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gForce, tilt, confirmed: true })
    }).catch(() => {});
  }

  // Trigger Manual SOS Distress
  function triggerSos(source = 'Manual SOS') {
    state.sosActive = true;
    els.emergencyTitle.textContent = 'CRITICAL ALERT: EMERGENCY SOS TRIGGERED';
    els.emergencyCoords.textContent = `${state.location.lat.toFixed(5)}° N, ${state.location.lng.toFixed(5)}° E`;
    els.emergencyTime.textContent = new Date().toLocaleTimeString();
    els.emergencySpeed.textContent = `${state.speed.toFixed(1)} km/h`;
    els.emergencyBanner.classList.remove('hidden');

    window.audioEngine.startSosSiren();
    addLog('EMERGENCY_SOS', `EMERGENCY SOS Triggered from [${source}]! Live GPS coordinates dispatched to emergency contacts.`, 'danger');

    fetch('/api/emergency/sos/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'trigger' })
    }).catch(() => {});
  }

  // Resolve Emergency Alert
  function resolveEmergency() {
    state.sosActive = false;
    state.accidentActive = false;
    els.emergencyBanner.classList.add('hidden');
    window.audioEngine.stopSosSiren();
    addLog('EMERGENCY_RESOLVED', 'Emergency alert marked as resolved by operator.', 'info');

    fetch('/api/emergency/sos/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' })
    }).catch(() => {});
  }

  // Navigation Turn-by-Turn Update
  function updateNavigationGuidance(step) {
    state.navigation.instruction = step.inst;
    state.navigation.distanceRemainingKm = step.dist;
    state.navigation.etaMinutes = step.eta;
    state.navigation.turnType = step.turn;

    els.navInstructionText.textContent = step.inst;
    els.navDistRem.textContent = `${step.dist.toFixed(1)} km`;
    els.navEtaMin.textContent = `${step.eta} mins`;

    // Turn icon mapping
    if (step.turn === 'TURN_LEFT') {
      els.navTurnIcon.innerHTML = '<i class="fa-solid fa-arrow-turn-up fa-rotate-270"></i>';
      window.audioEngine.speakTurnLeft();
    } else if (step.turn === 'TURN_RIGHT') {
      els.navTurnIcon.innerHTML = '<i class="fa-solid fa-arrow-turn-up fa-rotate-90"></i>';
      window.audioEngine.speakTurnRight();
    } else if (step.turn === 'STRAIGHT') {
      els.navTurnIcon.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
      window.audioEngine.speakContinueStraight();
    } else if (step.turn === 'DESTINATION') {
      els.navTurnIcon.innerHTML = '<i class="fa-solid fa-flag-checkered"></i>';
      window.audioEngine.speakDestinationReached();
    }

    addLog('NAVIGATION', `Voice Guidance: "${step.inst}"`, 'info');
  }

  // Dashboard Live Navigation Sync (from Mobile App or Cloud Server)
  let navRoutePolyline = null;
  function updateDashboardNavigation(navData) {
    if (!navData) return;

    if (navData.active && navData.destLat && navData.destLng) {
      state.navigation.active = true;
      state.navigation.destinationName = navData.destinationName || 'Selected Destination';
      state.navigation.destLat = parseFloat(navData.destLat);
      state.navigation.destLng = parseFloat(navData.destLng);
      state.navigation.distanceRemainingKm = parseFloat(navData.distanceRemainingKm) || 0.0;
      state.navigation.etaMinutes = parseInt(navData.etaMinutes) || 0;
      state.navigation.instruction = navData.instruction || `Head towards ${state.navigation.destinationName}`;
      state.navigation.turnType = navData.turnType || 'DESTINATION';

      // Update HUD elements
      if (els.navDestName) els.navDestName.textContent = state.navigation.destinationName;
      if (els.navDistRem) els.navDistRem.textContent = `${state.navigation.distanceRemainingKm.toFixed(1)} km`;
      if (els.navEtaMin) els.navEtaMin.textContent = `${state.navigation.etaMinutes} mins`;
      if (els.navInstructionText) els.navInstructionText.textContent = state.navigation.instruction;

      // Update Turn Icon
      if (els.navTurnIcon) {
        if (state.navigation.turnType === 'TURN_LEFT') {
          els.navTurnIcon.innerHTML = '<i class="fa-solid fa-arrow-turn-up fa-rotate-270"></i>';
        } else if (state.navigation.turnType === 'TURN_RIGHT') {
          els.navTurnIcon.innerHTML = '<i class="fa-solid fa-arrow-turn-up fa-rotate-90"></i>';
        } else if (state.navigation.turnType === 'STRAIGHT') {
          els.navTurnIcon.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
        } else {
          els.navTurnIcon.innerHTML = '<i class="fa-solid fa-flag-checkered" style="color:#ef4444;"></i>';
        }
      }

      // Update or create Destination Marker on Leaflet Map
      if (map) {
        if (destinationMarker) {
          destinationMarker.setLatLng([state.navigation.destLat, state.navigation.destLng]);
          destinationMarker.setPopupContent(`<b>Destination:</b> ${state.navigation.destinationName}`);
        } else {
          const destIcon = L.divIcon({
            className: 'custom-dest-pin',
            html: `<div class="dest-pin-body"><i class="fa-solid fa-flag-checkered"></i></div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 36]
          });
          destinationMarker = L.marker([state.navigation.destLat, state.navigation.destLng], { icon: destIcon }).addTo(map);
          destinationMarker.bindPopup(`<b>Destination:</b> ${state.navigation.destinationName}`);
        }

        // Draw/Update road navigation polyline connecting rider to destination
        const riderPos = [state.location.lat, state.location.lng];
        const destPos = [state.navigation.destLat, state.navigation.destLng];
        if (navRoutePolyline) {
          navRoutePolyline.setLatLngs([riderPos, destPos]);
        } else {
          navRoutePolyline = L.polyline([riderPos, destPos], {
            color: '#10b981',
            weight: 5,
            opacity: 0.85,
            dashArray: '8, 8'
          }).addTo(map);
        }
      }
    } else if (navData.active === false && state.navigation.active) {
      state.navigation.active = false;
      if (els.navDestName) els.navDestName.textContent = 'Standby';
      if (els.navDistRem) els.navDistRem.textContent = '0.0 km';
      if (els.navEtaMin) els.navEtaMin.textContent = '-- mins';
      if (els.navInstructionText) els.navInstructionText.textContent = 'Awaiting Navigation Target / Live GPS';
      if (els.navTurnIcon) els.navTurnIcon.innerHTML = '<i class="fa-solid fa-location-dot"></i>';

      if (navRoutePolyline && map) {
        map.removeLayer(navRoutePolyline);
        navRoutePolyline = null;
      }
    }
  }

  // Battery Update (Required Li-Ion Sensing)
  function updateBattery(voltage, isCharging) {
    state.batteryVoltage = voltage;
    state.isCharging = isCharging;
    const pct = Math.round(Math.min(Math.max(((voltage - 3.3) / (4.2 - 3.3)) * 100, 0), 100));
    state.batteryPercent = pct;

    els.batteryFill.style.width = `${pct}%`;
    els.batteryPctText.textContent = `${pct}%`;
    els.batteryVoltageText.textContent = `(${voltage.toFixed(2)}V)`;

    if (isCharging) {
      els.batteryChargingIcon.classList.remove('hidden');
      els.batteryFill.style.backgroundColor = '#00ff9d';
    } else {
      els.batteryChargingIcon.classList.add('hidden');
      els.batteryFill.style.backgroundColor = pct < 20 ? '#ff3366' : '#00f3ff';
    }

    updateJsonPreview();
  }

  // Add Incident Log to Stream
  function addLog(type, message, severity = 'info') {
    const timeStr = new Date().toLocaleTimeString();
    const logItem = document.createElement('div');
    logItem.className = `log-item log-${severity}`;
    logItem.innerHTML = `
      <div class="log-time">${timeStr}</div>
      <div class="log-type-tag">${type}</div>
      <div class="log-msg">${message}</div>
    `;

    els.logStream.insertBefore(logItem, els.logStream.firstChild);
    if (els.logStream.children.length > 50) {
      els.logStream.removeChild(els.logStream.lastChild);
    }
    state.logs.unshift({ type, message, severity, timestamp: new Date().toISOString() });
  }

  // Update ESP32 JSON Payload Preview Box
  function updateJsonPreview() {
    const payload = {
      deviceId: "KAVACH-ESP32-01",
      latitude: parseFloat(state.location.lat.toFixed(5)),
      longitude: parseFloat(state.location.lng.toFixed(5)),
      speed: state.speed,
      maxSpeed: state.maxSpeed,
      avgSpeed: state.avgSpeed,
      totalDistance: state.totalDistance,
      helmetWorn: state.helmetWorn,
      totalG: parseFloat(state.totalG.toFixed(2)),
      tiltAngle: parseFloat(state.tiltAngle.toFixed(1)),
      overspeedAlert: state.overspeedAlert,
      batteryVoltage: parseFloat(state.batteryVoltage.toFixed(2)),
      batteryPercent: state.batteryPercent,
      isCharging: state.isCharging,
      sosActive: state.sosActive
    };
    els.jsonPreview.textContent = JSON.stringify(payload, null, 2);
  }

  // Auto Ride Simulation Engine
  function startAutoDriveSimulation() {
    if (state.simRunning) return;
    state.simRunning = true;
    els.simAutoDriveBtn.disabled = true;
    els.simStopDriveBtn.disabled = false;
    addLog('SIMULATOR', 'Auto-ride simulation started with turn-by-turn navigation.', 'info');

    state.simInterval = setInterval(() => {
      state.simRouteIndex = (state.simRouteIndex + 1) % demoRoute.length;
      const point = demoRoute[state.simRouteIndex];

      updateLocation(point.lat, point.lng, point.speed, point.heading);
      updateSpeedometer(point.speed);
      updateNavigationGuidance(point);
      
      // Minor natural IMU fluctuations
      const randG = 1.0 + (point.speed > 40 ? 0.25 : 0.05) + Math.random() * 0.15;
      const randTilt = 2.0 + (point.turn !== 'STRAIGHT' ? 18.0 : 3.0) + Math.random() * 2.0;
      updateIMU(randG, randTilt);

      // Distance increment
      state.totalDistance = Math.round((state.totalDistance + 0.1) * 10) / 10;
      els.totalDistanceVal.innerHTML = `${state.totalDistance} <small>km</small>`;
    }, 3500);
  }

  function stopAutoDriveSimulation() {
    state.simRunning = false;
    if (state.simInterval) clearInterval(state.simInterval);
    els.simAutoDriveBtn.disabled = false;
    els.simStopDriveBtn.disabled = true;
    addLog('SIMULATOR', 'Auto-ride simulation paused.', 'info');
  }

  // Update Connection Status (True Live State vs Disconnected)
  function updateConnectionStatus(isOnline, secondsAgo = 0) {
    state.connected = isOnline;
    if (isOnline) {
      els.connectionChip.className = 'status-chip online';
      els.connectionLabel.textContent = 'ESP32 Connected (Live)';
    } else {
      els.connectionChip.className = 'status-chip offline';
      const timeMsg = secondsAgo > 0 ? ` (${secondsAgo}s ago)` : '';
      els.connectionLabel.textContent = `ESP32 Disconnected${timeMsg}`;
    }
  }

  // Django REST Polling for Live Telemetry Updates
  function pollDjangoTelemetry() {
    fetch('/api/telemetry/latest/')
      .then(res => res.json())
      .then(data => {
        const isOnline = data.online === true;
        updateConnectionStatus(isOnline, data.secondsSinceLastSeen);

        // Always sync GPS location if available
        if (data.gps && data.gps.latitude && data.gps.longitude) {
          updateLocation(data.gps.latitude, data.gps.longitude, data.gps.speedKmH, data.gps.heading);
          updateSpeedometer(data.gps.speedKmH);
          if (els.satellitesCount) {
            els.satellitesCount.textContent = isOnline ? (data.gps.satellites || '0') : `${data.gps.satellites || 0} (Standby)`;
          }
        }

        // Always sync navigation state from mobile app / backend!
        if (data.navigation) {
          updateDashboardNavigation(data.navigation);
        }

        if (isOnline) {
          if (data.sensors) {
            if (data.sensors.helmetWorn !== undefined) updateWearStatus(data.sensors.helmetWorn);
            if (data.sensors.batteryVoltage !== undefined) updateBattery(data.sensors.batteryVoltage, data.sensors.isCharging);
            if (data.sensors.totalG !== undefined) updateIMU(data.sensors.totalG, data.sensors.tiltAngle, data.sensors.accelX, data.sensors.accelY, data.sensors.accelZ);
          }
        } else {
          // If offline and simulator is not actively running, show standby state for hardware sensors
          if (!state.simRunning) {
            updateWearStatus(false);
            updateBattery(0, false);
            updateIMU(0, 0, 0, 0, 0);
            updateSpeedometer(0);
          }
        }
      })
      .catch(() => {
        updateConnectionStatus(false);
      });
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // Audio Toggle
    els.soundToggleBtn.addEventListener('click', () => {
      const isMuted = window.audioEngine.toggleMute();
      els.soundIcon.className = isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    });

    // Simulator Drawer Toggle
    const toggleDrawer = () => {
      els.simDrawer.classList.toggle('collapsed');
      const isCollapsed = els.simDrawer.classList.contains('collapsed');
      els.simMinimizeBtn.innerHTML = isCollapsed ? '<i class="fa-solid fa-chevron-up"></i>' : '<i class="fa-solid fa-chevron-down"></i>';
    };
    els.toggleSimBtn.addEventListener('click', toggleDrawer);
    els.simDrawerToggle.addEventListener('click', toggleDrawer);

    // Map Actions
    els.centerMapBtn.addEventListener('click', () => map.setView([state.location.lat, state.location.lng], 16));
    els.clearTrailBtn.addEventListener('click', () => {
      polyline.setLatLngs([[state.location.lat, state.location.lng]]);
      addLog('MAP', 'GPS route trail cleared from map.', 'info');
    });
    let currentTileLayerIndex = 0;
    const tileLayers = [
      { name: 'Esri World Street Map', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', maxZ: 19 },
      { name: 'Google Roadmap', url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', maxZ: 20 },
      { name: 'Satellite Imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZ: 19 }
    ];

    els.toggleLayerBtn.addEventListener('click', () => {
      map.removeLayer(baseTileLayer);
      currentTileLayerIndex = (currentTileLayerIndex + 1) % tileLayers.length;
      const selected = tileLayers[currentTileLayerIndex];
      baseTileLayer = L.tileLayer(selected.url, {
        maxZoom: selected.maxZ,
        attribution: '&copy; ' + selected.name
      }).addTo(map);
      addLog('MAP', `Switched map style to ${selected.name}.`, 'info');
    });

    // Replay Nav Voice Prompt
    els.replayNavVoiceBtn.addEventListener('click', () => {
      updateNavigationGuidance(demoRoute[state.simRouteIndex]);
    });

    // Emergency Buttons
    els.resolveEmergencyBtn.addEventListener('click', resolveEmergency);
    els.manualSosTriggerBtn.addEventListener('click', () => triggerSos('Web Emergency Button'));
    els.cancelAccidentBtn.addEventListener('click', cancelAccidentAlert);
    els.closeModalBtn.addEventListener('click', cancelAccidentAlert);
    els.instantAlertBtn.addEventListener('click', () => confirmAccidentImpact(4.5, 75.0));

    // Voice Assistance Buttons
    document.querySelectorAll('.btn-voice-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const voiceType = btn.dataset.voice;
        if (voiceType === 'WEAR_HELMET') {
          window.audioEngine.speakWearPrompt();
          addLog('VOICE', 'Voice prompt dispatched: "Please wear your helmet."', 'info');
        } else if (voiceType === 'REDUCE_SPEED') {
          window.audioEngine.speakReduceSpeedPrompt();
          addLog('VOICE', 'Voice prompt dispatched: "Please reduce your speed."', 'warning');
        } else if (voiceType === 'TURN_LEFT') {
          window.audioEngine.speakTurnLeft();
          addLog('VOICE', 'Voice prompt dispatched: "Turn left."', 'info');
        } else if (voiceType === 'TURN_RIGHT') {
          window.audioEngine.speakTurnRight();
          addLog('VOICE', 'Voice prompt dispatched: "Turn right."', 'info');
        } else if (voiceType === 'STRAIGHT') {
          window.audioEngine.speakContinueStraight();
          addLog('VOICE', 'Voice prompt dispatched: "Continue straight."', 'info');
        } else if (voiceType === 'DESTINATION') {
          window.audioEngine.speakDestinationReached();
          addLog('VOICE', 'Voice prompt dispatched: "You have reached your destination."', 'success');
        }
      });
    });

    // Overspeed Slider
    els.overspeedLimitSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.overspeedLimit = val;
      els.overspeedLimitLabel.textContent = `${val} km/h`;
      els.speedLimitTag.textContent = `Limit: ${val} km/h`;
      updateSpeedometer(state.speed);

      fetch('/api/config/overspeed/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limitKmH: val })
      }).catch(() => {});
    });

    // Simulator Interactive Controls
    els.simAutoDriveBtn.addEventListener('click', startAutoDriveSimulation);
    els.simStopDriveBtn.addEventListener('click', stopAutoDriveSimulation);

    els.simSpeedSlider.addEventListener('input', (e) => {
      const spd = parseFloat(e.target.value);
      els.simSpeedVal.textContent = spd;
      updateSpeedometer(spd);
    });

    els.simWearToggle.addEventListener('change', (e) => {
      updateWearStatus(e.target.checked);
    });

    els.simChargeToggle.addEventListener('change', (e) => {
      updateBattery(state.batteryVoltage, e.target.checked);
    });

    els.simBattSlider.addEventListener('input', (e) => {
      const volt = parseFloat(e.target.value);
      els.simBattVal.textContent = `${volt.toFixed(2)}V (${Math.round(((volt - 3.3) / 0.9) * 100)}%)`;
      updateBattery(volt, state.isCharging);
    });

    els.simGforceSlider.addEventListener('input', (e) => {
      const g = parseFloat(e.target.value);
      els.simGforceVal.textContent = g.toFixed(1);
      updateIMU(g, g > 3.0 ? 65.0 : 5.0);
    });

    els.simCrashBtn.addEventListener('click', () => {
      els.simGforceSlider.value = 4.5;
      els.simGforceVal.textContent = "4.5";
      updateIMU(4.5, 75.0);
    });

    els.simSosButton.addEventListener('click', () => {
      triggerSos('Simulated Push Button (GPIO 19)');
    });

    // Copy JSON preview
    els.copyJsonBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(els.jsonPreview.textContent);
      els.copyJsonBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
      setTimeout(() => {
        els.copyJsonBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
      }, 1800);
    });

    // Clear logs
    els.clearLogsBtn.addEventListener('click', () => {
      state.logs = [];
      els.logStream.innerHTML = '';
      addLog('SYSTEM', 'Incident logs cleared.', 'info');
    });

    // Export logs to JSON
    els.exportLogsBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state.logs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kavach-smart-helmet-telemetry-${Date.now()}.json`;
      a.click();
    });
  }

  // Live Backend Telemetry Polling (Syncs directly with ESP32 & Mobile App)
  async function pollDjangoTelemetry() {
    try {
      const res = await fetch('/api/telemetry/latest', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (!res.ok) return;
      const data = await res.json();

      const isOnline = Boolean(data.online);
      updateConnectionStatus(isOnline);

      // GPS Position & Speed
      if (data.gps && data.gps.latitude !== null && data.gps.longitude !== null) {
        const lat = parseFloat(data.gps.latitude);
        const lng = parseFloat(data.gps.longitude);
        const speed = parseFloat(data.gps.speedKmH || 0);
        const heading = parseFloat(data.gps.heading || 0);
        updateLocation(lat, lng, speed, heading);
        updateSpeedometer(speed);

        if (els.hudAlt) els.hudAlt.textContent = `${Math.round(data.gps.altitudeMeters || 15)} m`;
      }

      // Helmet Wear Detection
      if (data.sensors && data.sensors.helmetWorn !== undefined) {
        const worn = Boolean(data.sensors.helmetWorn);
        if (state.helmetWorn !== worn) {
          updateWearStatus(worn);
        }
      }

      // Li-Ion Battery Telemetry
      if (data.sensors && (data.sensors.batteryVoltage !== undefined || data.sensors.batteryPercent !== undefined)) {
        const voltage = parseFloat(data.sensors.batteryVoltage || 4.12);
        const charging = Boolean(data.sensors.isCharging);
        updateBattery(voltage, charging);
      }

      // MPU6050 IMU
      if (data.sensors && data.sensors.totalG !== undefined) {
        const totalG = parseFloat(data.sensors.totalG || 1.0);
        const tilt = parseFloat(data.sensors.tiltAngle || 0.0);
        updateIMU(totalG, tilt);
      }

      // Emergency Alerts
      if (data.sensors && data.sensors.sosActive && !state.sosActive) {
        triggerSos('Helmet SOS Button / Mobile App');
      }
      if (data.emergency && data.emergency.accidentTriggered && !state.accidentActive) {
        triggerAccidentAlert(state.totalG || 4.2, state.tiltAngle || 70);
      }
    } catch (e) {
      console.warn('Django telemetry poll error:', e);
    }
  }

  // Initialization Sequence
  initMap();
  setupEventListeners();

  // Initial State: Start with real disconnected/standby values
  updateConnectionStatus(false);
  updateSpeedometer(0);
  updateIMU(1.00, 0.0);
  updateWearStatus(false);
  updateBattery(4.12, false);

  // Poll immediately and keep polling every 1.5 seconds for true real-time data
  pollDjangoTelemetry();
  setInterval(pollDjangoTelemetry, 1500);

  addLog('SYSTEM', 'Kavach Smart Helmet Dashboard initialized. Ready for ESP32 telemetry.', 'info');
});
