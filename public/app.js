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

    // Navigation State
    navigation: {
      active: false,
      destinationName: 'Central City Hospital',
      destLat: 27.7250,
      destLng: 85.3350,
      distanceRemainingKm: 2.8,
      etaMinutes: 7,
      instruction: 'Turn right in 350m onto Main Avenue',
      turnType: 'TURN_RIGHT',
      stepIndex: 1
    },

    // GPS Location & Trail
    location: {
      lat: 27.71724,
      lng: 85.32400,
      alt: 1350,
      heading: 0,
      satellites: 0
    },
    trail: [],
    logs: [],
    simRunning: false,
    simInterval: null,
    simRouteIndex: 0
  };

  // Turn-by-Turn Navigation & GPS Waypoints
  const demoRoute = [
    { lat: 27.71724, lng: 85.32400, speed: 0, heading: 45, turn: 'STRAIGHT', inst: 'Head north on Ring Road', dist: 3.2, eta: 9 },
    { lat: 27.71790, lng: 85.32490, speed: 28, heading: 50, turn: 'TURN_RIGHT', inst: 'Turn right in 350m onto Main Avenue', dist: 2.8, eta: 7 },
    { lat: 27.71880, lng: 85.32620, speed: 45, heading: 60, turn: 'STRAIGHT', inst: 'Continue straight on Main Avenue for 1.2 km', dist: 2.2, eta: 5 },
    { lat: 27.71995, lng: 85.32830, speed: 58, heading: 65, turn: 'STRAIGHT', inst: 'Continue straight past Tech Park', dist: 1.6, eta: 4 },
    { lat: 27.72120, lng: 85.33080, speed: 64, heading: 75, turn: 'TURN_LEFT', inst: 'Turn left in 200m at Hospital Junction', dist: 1.1, eta: 3 },
    { lat: 27.72250, lng: 85.33250, speed: 38, heading: 40, turn: 'STRAIGHT', inst: 'Approaching hospital emergency wing', dist: 0.5, eta: 1 },
    { lat: 27.72400, lng: 85.33420, speed: 18, heading: 35, turn: 'DESTINATION', inst: 'You have reached your destination: Central City Hospital', dist: 0.0, eta: 0 }
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

  // Leaflet Map Setup (Uses 100% Free OpenStreetMap - ZERO API Key Required)
  let map, marker, destinationMarker, polyline, baseTileLayer;

  function initMap() {
    map = L.map('leaflet-map', {
      zoomControl: true,
      attributionControl: true
    }).setView([state.location.lat, state.location.lng], 15);

    // Classic Colorful OpenStreetMap (Direct CDN tile server)
    baseTileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    baseTileLayer.on('tileerror', function() {
      if (!map._hasFallenBack) {
        map._hasFallenBack = true;
        console.info('Switching to secondary map tile mirror...');
        try { map.removeLayer(baseTileLayer); } catch(e) {}
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 19,
          attribution: '&copy; Esri &copy; OpenStreetMap contributors'
        }).addTo(map);
      }
    });

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

        if (isOnline) {
          if (data.gps) {
            updateLocation(data.gps.latitude, data.gps.longitude, data.gps.speedKmH, data.gps.heading);
            updateSpeedometer(data.gps.speedKmH);
            els.satellitesCount.textContent = data.gps.satellites || '0';
          }
          if (data.sensors) {
            if (data.sensors.helmetWorn !== undefined) updateWearStatus(data.sensors.helmetWorn);
            if (data.sensors.batteryVoltage !== undefined) updateBattery(data.sensors.batteryVoltage, data.sensors.isCharging);
            if (data.sensors.totalG !== undefined) updateIMU(data.sensors.totalG, data.sensors.tiltAngle, data.sensors.accelX, data.sensors.accelY, data.sensors.accelZ);
          }
        } else {
          // If offline and simulation is not actively running, show 0 km/h standby
          if (!state.simRunning) {
            updateSpeedometer(0);
            if (data.sensors) {
              if (data.sensors.batteryVoltage !== undefined && data.sensors.batteryVoltage > 0) {
                updateBattery(data.sensors.batteryVoltage, data.sensors.isCharging);
              }
              updateWearStatus(false);
            }
            els.satellitesCount.textContent = '0 (Offline)';
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
    els.toggleLayerBtn.addEventListener('click', () => {
      map.removeLayer(baseTileLayer);
      baseTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      addLog('MAP', 'OpenStreetMap layer refreshed.', 'info');
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
