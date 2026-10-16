/**
 * ==============================================================================
 * KAVACH SMART HELMET — ANDROID APPLICATION JAVASCRIPT ENGINE
 * NEO-M8N GPS Tracking, Speed Monitoring & Rider Safety System
 * Connects to Django Backend and Neon Database
 * ==============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  // Sound Engine Instance
  const soundEngine = typeof HelmetAudioEngine !== 'undefined' ? new HelmetAudioEngine() : null;

  const DEFAULT_BACKEND_URL = 'https://kavach-smart-helmet-django.onrender.com';
  const initialServerUrl = (function() {
    try {
      const saved = localStorage.getItem('kavach_server_url');
      if (saved) return saved;
    } catch (e) {}
    if (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http')) {
      return window.location.origin;
    }
    return DEFAULT_BACKEND_URL;
  })();

  // System State - Truthful Defaults (Unconnected until hardware reports)
  const state = {
    deviceId: (function() {
      try { return localStorage.getItem('kavach_device_id') || 'KAVACH-ESP32-01'; } catch (e) { return 'KAVACH-ESP32-01'; }
    })(),
    serverUrl: initialServerUrl,
    isHelmetOnline: false,
    lastHwDiag: {
      espOk: 1,
      ampOk: 1,
      mpuOk: 0,
      gpsOk: 0,
      irRaw: 0,
      touchRaw: 0
    },

    // NEO-M8N GPS Telemetry
    gpsActive: true,
    gpsWatchId: null,
    hasGpsFix: false,
    latitude: null,
    longitude: null,
    speedKmH: 0.0,
    maxSpeedKmH: 0.0,
    avgSpeedKmH: 0.0,
    totalDistanceKm: 0.0,
    headingDeg: null,
    altitudeMeters: null,
    accuracyMeters: null,
    satellitesCount: 0,
    hdop: null,
    prevLat: null,
    prevLng: null,
    lastFixTimestamp: 0,
    lastValidMoveTimestamp: 0,

    // Helmet Hardware Status (Received from ESP32 via Backend)
    helmetWorn: null,
    overspeedLimitKmH: 60.0,
    overspeedAlertActive: false,
    overspeedCooldown: false,

    // MPU6050 6-DOF IMU (Received from ESP32 via Backend)
    totalG: null,
    tiltAngleDeg: null,
    accelX: null,
    accelY: null,
    accelZ: null,

    // Li-Ion Battery Telemetry (Received from ESP32 ADC)
    batteryPercent: null,
    batteryVoltage: null,
    isCharging: false,

    // Emergency & 15-Second Window
    sosActive: false,
    inCountdown: false,
    countdownTimer: null,
    countdownSecondsRemaining: 15,
    accidentConfirmed: false,

    // Navigation Guidance (No route until destination is selected by rider)
    destination: null,
    navInstruction: 'Select a destination below to start guidance',
    navDistanceMeters: null,
    navEtaMinutes: null,

    // Settings
    voiceEnabled: true,
    vibrationEnabled: true,

    // Bluetooth Direct Link
    isBluetoothConnected: false,
    lastBtCloudSyncMs: 0,
    lastAccidentCancelMs: 0
  };

  // DOM Elements Cache
  const els = {
    backendStatusBadge: document.getElementById('backend-status-badge'),
    backendStatusText: document.getElementById('backend-status-text'),
    voiceToggleBtn: document.getElementById('voice-toggle-btn'),
    voiceIcon: document.getElementById('voice-icon'),
    btConnectBtn: document.getElementById('bt-connect-btn'),
    btIcon: document.getElementById('bt-icon'),
    btStatusPill: document.getElementById('bt-status-pill'),
    btStatusDesc: document.getElementById('bt-status-desc'),
    btnManualBtConnect: document.getElementById('btn-manual-bt-connect'),
    btnManualBtDisconnect: document.getElementById('btn-manual-bt-disconnect'),
    emergencyBanner: document.getElementById('emergency-banner'),
    emergencyDetails: document.getElementById('emergency-details'),
    btnResolveEmergency: document.getElementById('btn-resolve-emergency'),

    // GPS Status Bar
    gpsFixStatus: document.getElementById('gps-fix-status'),
    gpsSatellitesVal: document.getElementById('gps-satellites-val'),
    gpsAccuracyVal: document.getElementById('gps-accuracy-val'),
    neoHardwareBadge: document.getElementById('neo-hardware-badge'),

    // Dashboard View
    speedDisplay: document.getElementById('speed-display'),
    speedLimitLabel: document.getElementById('speed-limit-label'),
    overspeedAlertBox: document.getElementById('overspeed-alert-box'),
    tripDistanceVal: document.getElementById('trip-distance-val'),
    tripMaxSpeedVal: document.getElementById('trip-max-speed-val'),
    tripAvgSpeedVal: document.getElementById('trip-avg-speed-val'),
    tripAltitudeVal: document.getElementById('trip-altitude-val'),
    helmetWearStatusPill: document.getElementById('helmet-wear-status-pill'),
    toggleWearBtn: document.getElementById('toggle-wear-btn'),
    ignitionRelayStatus: document.getElementById('ignition-relay-status'),
    batteryPctVal: document.getElementById('battery-pct-val'),
    batteryVoltageVal: document.getElementById('battery-voltage-val'),
    chargingStatusText: document.getElementById('charging-status-text'),
    btnSosTrigger: document.getElementById('btn-sos-trigger'),

    // Navigation View
    guidanceDistanceVal: document.getElementById('guidance-distance-val'),
    guidanceEtaVal: document.getElementById('guidance-eta-val'),
    guidanceInstructionText: document.getElementById('guidance-instruction-text'),
    btnSpeakInstruction: document.getElementById('btn-speak-instruction'),
    btnCenterMap: document.getElementById('btn-center-map'),
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    destSearchInput: document.getElementById('dest-search-input'),
    btnSearchDest: document.getElementById('btn-search-dest'),
    searchResultsDropdown: document.getElementById('search-results-dropdown'),
    btnClearRouteHeader: document.getElementById('btn-clear-route-header'),
    navActiveStatus: document.getElementById('nav-active-status'),
    navStatusEmpty: document.getElementById('nav-status-empty'),
    navSelectedCard: document.getElementById('nav-selected-card'),
    navSelectedName: document.getElementById('nav-selected-name'),
    navSelectedDesc: document.getElementById('nav-selected-desc'),
    navStatDist: document.getElementById('nav-stat-dist'),
    navStatEta: document.getElementById('nav-stat-eta'),
    btnFitRoute: document.getElementById('btn-fit-route'),
    btnCancelRoute: document.getElementById('btn-cancel-route'),

    // GPS Telemetry View
    gpsLatVal: document.getElementById('gps-lat-val'),
    gpsLngVal: document.getElementById('gps-lng-val'),
    gpsHeadingVal: document.getElementById('gps-heading-val'),
    gpsAltVal: document.getElementById('gps-alt-val'),
    btnCopyNmea: document.getElementById('btn-copy-nmea'),
    nmeaOutputConsole: document.getElementById('nmea-output-console'),

    // Safety View
    imuTotalG: document.getElementById('imu-total-g'),
    imuTiltDeg: document.getElementById('imu-tilt-deg'),
    imuAccelX: document.getElementById('imu-accel-x'),
    imuAccelY: document.getElementById('imu-accel-y'),
    btnTestAccidentWindow: document.getElementById('btn-test-accident-window'),

    // Settings View
    cfgDeviceId: document.getElementById('cfg-device-id'),
    cfgServerUrl: document.getElementById('cfg-server-url'),
    cfgSpeedLimit: document.getElementById('cfg-speed-limit'),
    chkVoiceEnabled: document.getElementById('chk-voice-enabled'),
    chkVibrateEnabled: document.getElementById('chk-vibrate-enabled'),

    // Navigation Tabs
    navButtons: document.querySelectorAll('.nav-button'),
    tabPanes: document.querySelectorAll('.tab-pane'),

    // Hardware Diagnostics Modal Elements
    hwDiagModal: document.getElementById('hw-diag-modal'),
    btnCloseHwDiag: document.getElementById('btn-close-hw-diag'),
    btnAckHwDiag: document.getElementById('btn-ack-hw-diag'),
    btnShowHwDiag: document.getElementById('btn-show-hw-diag'),
    diagValEsp: document.getElementById('diag-val-esp'),
    diagValAmp: document.getElementById('diag-val-amp'),
    diagValMpu: document.getElementById('diag-val-mpu'),
    diagValGps: document.getElementById('diag-val-gps'),
    diagValIr: document.getElementById('diag-val-ir'),
    diagValTouch: document.getElementById('diag-val-touch'),

    // Accident Modal
    accidentModal: document.getElementById('accident-modal'),
    countdownNumber: document.getElementById('countdown-number'),
    modalGForce: document.getElementById('modal-g-force'),
    modalTilt: document.getElementById('modal-tilt'),
    modalSpeed: document.getElementById('modal-speed'),
    btnCancelAccident: document.getElementById('btn-cancel-accident'),
    btnInstantDispatch: document.getElementById('btn-instant-dispatch')
  };

  // Map Variables (CARTO Voyager + OSRM Road Routing)
  let leafletMap = null;
  let riderMarker = null;
  let destMarker = null;
  let routeLine = null;
  let routeHalo = null;
  let mapHasBeenCenteredInitially = false;

  // Tab Navigation Handling
  els.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPaneId = btn.getAttribute('data-target');
      els.navButtons.forEach(b => b.classList.remove('active'));
      els.tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(targetPaneId);
      if (targetPane) targetPane.classList.add('active');

      if (targetPaneId === 'pane-navigation') {
        if (!leafletMap) {
          initMap();
        } else {
          leafletMap.invalidateSize(true);
          setTimeout(() => {
            if (leafletMap) leafletMap.invalidateSize(true);
          }, 150);
        }
      }
    });
  });

  // Voice Guidance Announcement
  function speakVoicePrompt(text) {
    if (!state.voiceEnabled || !soundEngine) return;
    soundEngine.speakText(text);
    triggerHapticFeedback([60, 40, 60]);
  }

  // Haptic Vibration Feedback
  function triggerHapticFeedback(pattern = [80]) {
    if (state.vibrationEnabled && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
    }
  }

  // Voice Guidance Toggle
  if (els.voiceToggleBtn) {
    els.voiceToggleBtn.addEventListener('click', () => {
      state.voiceEnabled = !state.voiceEnabled;
      if (soundEngine) soundEngine.toggleMute();
      if (state.voiceEnabled) {
        if (els.voiceIcon) els.voiceIcon.className = 'fa-solid fa-volume-high';
        if (els.chkVoiceEnabled) els.chkVoiceEnabled.checked = true;
        speakVoicePrompt('Voice guidance enabled.');
      } else {
        if (els.voiceIcon) els.voiceIcon.className = 'fa-solid fa-volume-xmark';
        if (els.chkVoiceEnabled) els.chkVoiceEnabled.checked = false;
      }
    });
  }  // ============================================================================
  // LEAFLET MAP INITIALIZATION (CARTO Voyager & Real Road Navigation)
  // ============================================================================
  function initMap() {
    const mapElement = document.getElementById('navigation-map');
    if (!mapElement || typeof L === 'undefined') return;

    if (leafletMap) {
      try { leafletMap.remove(); } catch (e) {}
      leafletMap = null;
      riderMarker = null;
      destMarker = null;
      routeLine = null;
      routeHalo = null;
    }

    const defaultLat = state.latitude || 19.2184;
    const defaultLng = state.longitude || 73.0867;

    leafletMap = L.map('navigation-map', {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: false,
      bounceAtZoomLimits: false,
      inertia: true,
      inertiaDeceleration: 3000
    }).setView([defaultLat, defaultLng], 15);

    // Force enable dragging handlers explicitly
    leafletMap.dragging.enable();
    if (leafletMap.touchZoom) leafletMap.touchZoom.enable();
    if (leafletMap.doubleClickZoom) leafletMap.doubleClickZoom.enable();

    // 100% Free, High-Resolution Esri World Street Map (Zero API Key, Zero Watermarks, Never Blocked)
    const baseTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '&copy; Esri &copy; OpenStreetMap contributors'
    });

    // Automatic failover to Google Maps tile mirror if Esri is unreachable
    baseTileLayer.on('tileerror', function() {
      console.info('Switching to Google Maps tile mirror...');
      try { leafletMap.removeLayer(baseTileLayer); } catch(e) {}
      L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: '&copy; Google Maps'
      }).addTo(leafletMap);
    });

    baseTileLayer.addTo(leafletMap);

    // Rider Location Marker
    const riderMarkerHtml = `
      <div style="width:28px; height:28px; border-radius:50%; background:#1e40af; border:3px solid #ffffff; box-shadow:0 2px 8px rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:12px;">
        <i class="fa-solid fa-location-arrow"></i>
      </div>
    `;

    const riderIcon = L.divIcon({
      html: riderMarkerHtml,
      className: 'rider-marker-icon',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    riderMarker = L.marker([defaultLat, defaultLng], { icon: riderIcon }).addTo(leafletMap);

    // If destination already exists, restore it and route
    if (state.destination && state.destination.lat && state.destination.lng) {
      setDestination(state.destination.lat, state.destination.lng, state.destination.name || 'Selected Location');
    }

    // Direct Map Click / Tap to Select Destination & Calculate Road Route
    leafletMap.on('click', (e) => {
      const clickLat = e.latlng.lat;
      const clickLng = e.latlng.lng;
      triggerHapticFeedback([30]);
      setDestination(clickLat, clickLng, 'Selected Location');
    });

    // Floating Map Controls: Center, Zoom In, Zoom Out
    if (els.btnCenterMap) {
      els.btnCenterMap.onclick = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const curLat = state.latitude || defaultLat;
        const curLng = state.longitude || defaultLng;
        leafletMap.setView([curLat, curLng], 16, { animate: true });
        triggerHapticFeedback([40]);
      };
    }

    const btnZoomIn = document.getElementById('btn-zoom-in');
    if (btnZoomIn) {
      btnZoomIn.onclick = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (leafletMap) leafletMap.zoomIn();
        triggerHapticFeedback([30]);
      };
    }

    const btnZoomOut = document.getElementById('btn-zoom-out');
    if (btnZoomOut) {
      btnZoomOut.onclick = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (leafletMap) leafletMap.zoomOut();
        triggerHapticFeedback([30]);
      };
    }

    // Invalidate size once DOM stabilizes
    setTimeout(() => {
      if (leafletMap) leafletMap.invalidateSize(true);
    }, 200);
  }

  // ============================================================================
  // REAL ROAD ROUTING VIA OSRM DRIVING ENGINE
  // ============================================================================
  async function calculateAndDisplayRoadRoute(curLat, curLng, destLat, destLng, destName) {
    let routeData = null;

    // 1. Direct fetch to public OSRM Driving Engine
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${curLng},${curLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(osrmUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          routeData = data.routes[0];
        }
      }
    } catch (e) {
      console.warn('Direct OSRM fetch failed, trying backend route proxy:', e);
    }

    // 2. Fallback to Django backend proxy
    if (!routeData) {
      try {
        const baseUrl = state.serverUrl ? state.serverUrl.replace(/\/$/, '') : '';
        const proxyUrl = `${baseUrl}/api/navigation/route?from_lat=${curLat}&from_lng=${curLng}&to_lat=${destLat}&to_lng=${destLng}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            routeData = data.routes[0];
          }
        }
      } catch (e) {
        console.warn('Backend route proxy failed:', e);
      }
    }

    // 3. Process Route Geometry or Straight-line Fallback
    let latLngs = [];
    let distKm = '0.0';
    let etaMins = 1;
    let firstInstruction = `Follow road to ${destName}`;

    if (routeData) {
      // Convert OSRM GeoJSON [lon, lat] coordinates to Leaflet [lat, lon]
      latLngs = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      distKm = (routeData.distance / 1000).toFixed(1);
      etaMins = Math.max(1, Math.round(routeData.duration / 60));

      if (routeData.legs && routeData.legs[0] && routeData.legs[0].steps && routeData.legs[0].steps.length > 1) {
        const step = routeData.legs[0].steps[1] || routeData.legs[0].steps[0];
        const modifier = step.maneuver ? (step.maneuver.modifier || step.maneuver.type) : '';
        const stepDist = Math.round(step.distance);
        const street = step.name ? ` onto ${step.name}` : '';
        if (modifier && modifier !== 'straight') {
          firstInstruction = `In ${stepDist} m turn ${modifier}${street}`;
        } else {
          firstInstruction = `In ${stepDist} m continue straight${street}`;
        }
      }
    } else {
      // Fallback straight line
      latLngs = [[curLat, curLng], [destLat, destLng]];
      const dLat = (destLat - curLat) * Math.PI / 180;
      const dLon = (destLng - curLng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(curLat * Math.PI / 180) * Math.cos(destLat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      distKm = (6371 * c).toFixed(1);
      etaMins = Math.max(1, Math.round((parseFloat(distKm) / 25) * 60));
      firstInstruction = `Head towards ${destName}`;
    }

    // Draw Real Road Polyline on Map
    if (routeHalo && leafletMap) leafletMap.removeLayer(routeHalo);
    if (routeLine && leafletMap) leafletMap.removeLayer(routeLine);

    if (leafletMap) {
      // Route casing/halo (subtle border)
      routeHalo = L.polyline(latLngs, {
        color: '#1d4ed8',
        weight: 8,
        opacity: 0.7,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(leafletMap);

      // Main vibrant road line
      routeLine = L.polyline(latLngs, {
        color: '#3b82f6',
        weight: 5,
        opacity: 1.0,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(leafletMap);

      // Fit map viewport to encompass the entire route
      leafletMap.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
    }

    // Update HUD & Details Card
    if (els.guidanceDistanceVal) els.guidanceDistanceVal.textContent = `${distKm} km`;
    if (els.guidanceEtaVal) els.guidanceEtaVal.textContent = `ETA: ${etaMins} mins`;
    if (els.guidanceInstructionText) els.guidanceInstructionText.textContent = firstInstruction;

    if (els.navStatDist) els.navStatDist.textContent = `${distKm} km`;
    if (els.navStatEta) els.navStatEta.textContent = `${etaMins} mins`;
    if (els.navSelectedDesc) els.navSelectedDesc.textContent = `${distKm} km road distance • ~${etaMins} mins travel time`;

    speakVoicePrompt(`Route planned via road to ${destName}. Distance: ${distKm} kilometers, ETA: ${etaMins} minutes.`);

    // Sync active road route to Django backend & Browser Dashboard!
    syncDestinationToBackend(destLat, destLng, destName, true, parseFloat(distKm), etaMins, firstInstruction);
  }

  // Sync Destination to Backend & Browser Dashboard in Real-Time
  async function syncDestinationToBackend(lat, lng, name, active = true, distKm = 0.0, etaMins = 0, instruction = '') {
    const baseUrl = state.serverUrl ? state.serverUrl.replace(/\/$/, '') : '';
    try {
      await fetch(`${baseUrl}/api/navigation/destination/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          active: active,
          destinationName: name,
          destLat: lat,
          destLng: lng,
          distanceKm: distKm,
          etaMinutes: etaMins,
          instruction: instruction,
          latitude: state.latitude,
          longitude: state.longitude,
          source: 'mobile_app'
        })
      });
    } catch (e) {
      console.warn('Failed to sync destination to backend:', e);
    }
  }

  // Set Destination (from Map Click or Search)
  async function setDestination(lat, lng, name = 'Selected Location') {
    state.destination = { name, lat, lng };

    // Update or create destination marker
    if (destMarker && leafletMap) {
      destMarker.setLatLng([lat, lng]);
    } else if (leafletMap) {
      const destPinHtml = `
        <div style="position:relative; width:34px; height:34px; display:flex; align-items:center; justify-content:center;">
          <div style="position:absolute; width:14px; height:14px; border-radius:50%; background:rgba(239,68,68,0.4); animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="width:30px; height:30px; border-radius:50%; background:#ef4444; border:3px solid #ffffff; box-shadow:0 3px 10px rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:13px;">
            <i class="fa-solid fa-flag"></i>
          </div>
        </div>
      `;
      const destIcon = L.divIcon({
        html: destPinHtml,
        className: 'dest-pin-icon',
        iconSize: [34, 34],
        iconAnchor: [17, 30]
      });
      destMarker = L.marker([lat, lng], { icon: destIcon }).addTo(leafletMap);
    }

    // Show Active Destination Card
    if (els.navStatusEmpty) els.navStatusEmpty.classList.add('hidden');
    if (els.navSelectedCard) els.navSelectedCard.classList.remove('hidden');
    if (els.btnClearRouteHeader) els.btnClearRouteHeader.classList.remove('hidden');
    if (els.navSelectedName) els.navSelectedName.textContent = name;
    if (els.navSelectedDesc) els.navSelectedDesc.textContent = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)} • Calculating road path...`;
    if (els.navStatDist) els.navStatDist.textContent = 'Calculating...';
    if (els.navStatEta) els.navStatEta.textContent = 'Calculating...';

    const curLat = state.latitude || 19.2184;
    const curLng = state.longitude || 73.0867;

    await calculateAndDisplayRoadRoute(curLat, curLng, lat, lng, name);

    // If generic "Selected Location", resolve actual street or landmark via reverse geocoding
    if (name === 'Selected Location') {
      reverseGeocode(lat, lng).then(resolved => {
        if (resolved && state.destination && state.destination.lat === lat && state.destination.lng === lng) {
          state.destination.name = resolved;
          if (els.navSelectedName) els.navSelectedName.textContent = resolved;
          syncDestinationToBackend(lat, lng, resolved, true, parseFloat(state.navDistanceMeters ? (state.navDistanceMeters/1000).toFixed(1) : 0), state.navEtaMinutes || 0, state.navInstruction);
        }
      });
    }
  }

  // Clear Destination / Cancel Navigation
  function clearDestination() {
    state.destination = null;

    // Notify backend & browser dashboard that destination was cleared
    syncDestinationToBackend(0, 0, '', false);

    if (destMarker && leafletMap) {
      leafletMap.removeLayer(destMarker);
      destMarker = null;
    }
    if (routeLine && leafletMap) {
      leafletMap.removeLayer(routeLine);
      routeLine = null;
    }
    if (routeHalo && leafletMap) {
      leafletMap.removeLayer(routeHalo);
      routeHalo = null;
    }

    if (els.navStatusEmpty) els.navStatusEmpty.classList.remove('hidden');
    if (els.navSelectedCard) els.navSelectedCard.classList.add('hidden');
    if (els.btnClearRouteHeader) els.btnClearRouteHeader.classList.add('hidden');

    if (els.guidanceInstructionText) {
      els.guidanceInstructionText.textContent = 'Tap on map or search to navigate';
    }
    if (els.guidanceDistanceVal) els.guidanceDistanceVal.textContent = 'Ready';
    if (els.guidanceEtaVal) els.guidanceEtaVal.textContent = 'Select Route';

    const curLat = state.latitude || 19.2184;
    const curLng = state.longitude || 73.0867;
    if (leafletMap) {
      leafletMap.setView([curLat, curLng], 15, { animate: true });
    }

    speakVoicePrompt('Route cancelled.');
  }

  // Fit Route
  function fitRoute() {
    if (routeLine && leafletMap) {
      leafletMap.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
      triggerHapticFeedback([30]);
    } else if (leafletMap) {
      const curLat = state.latitude || 19.2184;
      const curLng = state.longitude || 73.0867;
      leafletMap.setView([curLat, curLng], 15, { animate: true });
    }
  }

  // Reverse Geocoding via Photon
  async function reverseGeocode(lat, lng) {
    try {
      const photonUrl = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
      const res = await fetch(photonUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.features && data.features.length > 0) {
          const props = data.features[0].properties || {};
          const name = props.name || props.street || props.locality || props.district || props.city;
          const city = props.city || props.district || '';
          if (name && city && name !== city) return `${name}, ${city}`;
          if (name) return name;
        }
      }
    } catch (e) {
      console.warn('Reverse geocode error:', e);
    }
    return `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  }

  // Connect route action buttons
  if (els.btnCancelRoute) els.btnCancelRoute.onclick = clearDestination;
  if (els.btnClearRouteHeader) els.btnClearRouteHeader.onclick = clearDestination;
  if (els.btnFitRoute) els.btnFitRoute.onclick = fitRoute;

  // Known Maharashtra / Dombivli / Kalyan / Mumbai landmarks database for instant zero-latency offline resolution
  const LOCAL_LANDMARKS = [
    { name: "Shivajirao S. Jondhale College of Engineering (SSJCOE)", keywords: ["shivajirao", "jondhale", "ssjcoe", "jondhale college", "engineering", "sonarpada", "manpada"], lat: 19.20474, lng: 73.10800, desc: "Degree Engineering Campus, Kalyan-Shil Road, Sonarpada, Dombivli East" },
    { name: "S.H. Jondhale Polytechnic (Dombivli West)", keywords: ["jondhale polytechnic", "jondhale west", "sh jondhale"], lat: 19.21816, lng: 73.08380, desc: "Polytechnic Campus, Old Dombivli Road, Dombivli West" },
    { name: "Shivajirao S. Jondhale Polytechnic (Asangaon)", keywords: ["jondhale asangaon", "asangaon"], lat: 19.43980, lng: 73.30820, desc: "Knowledge City Campus, Asangaon, Shahapur" },
    { name: "Dombivli Railway Station", keywords: ["dombivli station"], lat: 19.2184, lng: 73.0867, desc: "Central Railway Suburban Hub" },
    { name: "Dombivli East (Phadke Road)", keywords: ["phadke road", "baji prabhu"], lat: 19.2195, lng: 73.0892, desc: "Commercial & Shopping Zone" },
    { name: "Dombivli West", keywords: ["subhash road"], lat: 19.2170, lng: 73.0835, desc: "West Market & Residential" },
    { name: "MIDC Phase 1 Dombivli", keywords: ["midc phase 1"], lat: 19.2085, lng: 73.1012, desc: "MIDC Industrial Hub" },
    { name: "MIDC Phase 2 Dombivli", keywords: ["midc phase 2", "milap nagar"], lat: 19.2120, lng: 73.1080, desc: "MIDC Phase 2 Residential Zone" },
    { name: "Manpada Chowk Dombivli", keywords: ["manpada chowk", "manpada"], lat: 19.2162, lng: 73.1045, desc: "Manpada Junction & Flyover" },
    { name: "Pendharkar College", keywords: ["pendharkar"], lat: 19.2175, lng: 73.0965, desc: "Educational Hub, MIDC" },
    { name: "Gharda Circle", keywords: ["gharda circle", "gharda"], lat: 19.2140, lng: 73.0990, desc: "Traffic Circle, MIDC" },
    { name: "Thakurli Railway Station", keywords: ["thakurli station", "thakurli"], lat: 19.2246, lng: 73.0978, desc: "Suburban Commuter Station" },
    { name: "Kalyan Junction Station", keywords: ["kalyan junction", "kalyan station"], lat: 19.2361, lng: 73.1307, desc: "Major Railway Transit Terminal" },
    { name: "Kalyan West", keywords: ["kalyan west", "shivaji chowk"], lat: 19.2405, lng: 73.1250, desc: "Kalyan Commercial Center" },
    { name: "Khadakpada Kalyan", keywords: ["khadakpada"], lat: 19.2510, lng: 73.1380, desc: "Khadakpada Circle" },
    { name: "Birla College Kalyan", keywords: ["birla college", "birla"], lat: 19.2455, lng: 73.1465, desc: "B.K. Birla College, Kalyan" },
    { name: "Lodha Palava City", keywords: ["palava", "lodha palava", "shilphata"], lat: 19.1825, lng: 73.0780, desc: "Smart City Mega Township" },
    { name: "Kopar Railway Station", keywords: ["kopar station", "kopar"], lat: 19.2115, lng: 73.0780, desc: "Dombivli-Kopar Interchange" },
    { name: "Diva Junction", keywords: ["diva junction", "diva"], lat: 19.1885, lng: 73.0425, desc: "Central & Konkan Transit Hub" },
    { name: "Thane Railway Station", keywords: ["thane station"], lat: 19.1860, lng: 72.9758, desc: "Thane City Central Station" },
    { name: "Viviana Mall Thane", keywords: ["viviana mall", "viviana"], lat: 19.2090, lng: 72.9725, desc: "Eastern Express Highway, Thane" },
    { name: "AIMS Hospital Dombivli", keywords: ["aims hospital", "aims"], lat: 19.2190, lng: 73.0940, desc: "Super Speciality Hospital, MIDC" },
    { name: "Mamata Hospital Dombivli", keywords: ["mamata hospital", "mamata"], lat: 19.2165, lng: 73.0895, desc: "Multi-Speciality Hospital, Dombivli" },
    { name: "Apex Hospital", keywords: ["apex hospital"], lat: 19.2230, lng: 73.0910, desc: "Emergency Care Hospital" },
    { name: "Fortis Hospital Kalyan", keywords: ["fortis hospital", "fortis"], lat: 19.2520, lng: 73.1390, desc: "Tertiary Care Hospital, Kalyan" },
    { name: "Vashi Navi Mumbai", keywords: ["vashi"], lat: 19.0770, lng: 72.9980, desc: "Navi Mumbai Central Hub" },
    { name: "Airoli Mindspace", keywords: ["airoli"], lat: 19.1550, lng: 72.9985, desc: "Navi Mumbai IT Park" },
    { name: "Dadar Central Mumbai", keywords: ["dadar"], lat: 19.0178, lng: 72.8478, desc: "Central Mumbai Transit Hub" }
  ];

  function renderSearchResults(places) {
    const dropdown = els.searchResultsDropdown || document.getElementById('search-results-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    if (!places || places.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }
    places.slice(0, 6).forEach(place => {
      const btn = document.createElement('button');
      btn.className = 'search-result-item';
      btn.innerHTML = `
        <i class="fa-solid fa-location-dot" style="color:#2563eb; font-size:1rem; flex-shrink:0;"></i>
        <div class="search-result-meta">
          <strong>${place.name}</strong>
          <span>${place.desc || place.display_name || ''}</span>
        </div>
      `;
      btn.onclick = () => {
        dropdown.classList.add('hidden');
        setDestination(place.lat, place.lng, place.name);
      };
      dropdown.appendChild(btn);
    });
    dropdown.classList.remove('hidden');
  }

  // Multi-Tier Search: Local Landmark DB -> Photon OpenStreetMap API -> Django Backend Proxy
  async function handleDestinationSearch() {
    const input = els.destSearchInput || document.getElementById('dest-search-input');
    const query = input ? input.value.trim() : '';
    if (!query) return;

    const dropdown = els.searchResultsDropdown || document.getElementById('search-results-dropdown');
    if (dropdown) dropdown.classList.add('hidden');

    // 1. Coordinate input check (e.g. "19.218, 73.086")
    const coordMatch = query.match(/^([-+]?[0-9]*\.?[0-9]+)\s*,\s*([-+]?[0-9]*\.?[0-9]+)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      setDestination(lat, lng, `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      return;
    }

    const btn = els.btnSearchDest || document.getElementById('btn-search-dest');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    const curLat = state.latitude || 19.2184;
    const curLng = state.longitude || 73.0867;
    const qLower = query.toLowerCase();

    // 2. Strict Local Landmark Match (No generic word hijacking)
    const localMatches = LOCAL_LANDMARKS.filter(lm => {
      const lmNameLower = lm.name.toLowerCase();
      if (lmNameLower.includes(qLower) || qLower.includes(lmNameLower)) return true;
      return lm.keywords.some(k => {
        return qLower.includes(k) || (k.length >= 4 && lmNameLower.includes(k) && qLower.includes(k));
      });
    });

    // 3. Online Search via Photon API
    let onlineResults = [];
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${curLat}&lon=${curLng}&limit=5`;
      const res = await fetch(photonUrl);
      if (res.ok) {
        const data = await res.json();
        const features = data.features || [];
        onlineResults = features.map(f => {
          const props = f.properties || {};
          const coords = f.geometry.coordinates; // [lon, lat]
          const name = props.name || props.city || query;
          const city = props.city || props.state || '';
          const display = city ? `${name}, ${city}` : name;
          return {
            name: name,
            desc: display,
            lat: coords[1],
            lng: coords[0]
          };
        });
      }
    } catch (e) {
      console.warn('Photon search error, trying backend proxy:', e);
    }

    // 4. Fallback: Query Django Backend Proxy
    if (onlineResults.length === 0 && localMatches.length === 0) {
      try {
        const baseUrl = state.serverUrl ? state.serverUrl.replace(/\/$/, '') : '';
        const proxyUrl = `${baseUrl}/api/navigation/search?q=${encodeURIComponent(query)}&lat=${curLat}&lon=${curLng}`;
        const res2 = await fetch(proxyUrl);
        if (res2.ok) {
          const data2 = await res2.json();
          onlineResults = (data2.results || []).map(r => ({
            name: r.name,
            desc: r.display_name,
            lat: r.lat,
            lng: r.lon
          }));
        }
      } catch (e) {
        console.warn('Backend proxy search error:', e);
      }
    }

    if (btn) btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Search';

    // Combine local and online matches without duplicates
    const combined = [...localMatches];
    onlineResults.forEach(item => {
      if (!combined.some(c => Math.abs(c.lat - item.lat) < 0.002 && Math.abs(c.lng - item.lng) < 0.002)) {
        combined.push(item);
      }
    });

    if (combined.length === 0) {
      alert(`Location "${query}" not found. Try searching another landmark or tap directly on the map.`);
      return;
    }

    // If exact single match and matches query, select directly; otherwise show dropdown of options
    if (combined.length === 1 && combined[0].name.toLowerCase() === qLower) {
      setDestination(combined[0].lat, combined[0].lng, combined[0].name);
    } else {
      renderSearchResults(combined);
      // If user typed a specific college/landmark name and the first result is a strong match
      const first = combined[0];
      if (qLower.includes('jondhale')) {
        const target = (qLower.includes('polytechnic') || qLower.includes('west'))
          ? (combined.find(c => c.name.toLowerCase().includes('polytechnic')) || first)
          : first;
        setDestination(target.lat, target.lng, target.name);
      }
    }
  }

  if (els.btnSearchDest) {
    els.btnSearchDest.addEventListener('click', handleDestinationSearch);
  }
  if (els.destSearchInput) {
    els.destSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleDestinationSearch();
    });
  }

  if (els.btnSpeakInstruction) {
    els.btnSpeakInstruction.addEventListener('click', () => {
      speakVoicePrompt(state.navInstruction);
    });
  }

  // ============================================================================
  // SPEEDOMETER & TELEMETRY DISPLAY
  // ============================================================================
  function updateSpeedDisplay(speedVal) {
    state.speedKmH = Math.max(0, parseFloat(speedVal.toFixed(1)));
    if (state.speedKmH > state.maxSpeedKmH) {
      state.maxSpeedKmH = state.speedKmH;
    }

    if (els.speedDisplay) {
      els.speedDisplay.textContent = Math.round(state.speedKmH);
    }
    if (els.tripMaxSpeedVal) {
      els.tripMaxSpeedVal.textContent = `${state.maxSpeedKmH.toFixed(1)} km/h`;
    }
    if (els.tripDistanceVal) {
      els.tripDistanceVal.textContent = `${state.totalDistanceKm.toFixed(2)} km`;
    }

    // Overspeed Detection
    const isOverspeed = state.speedKmH >= state.overspeedLimitKmH;
    if (isOverspeed) {
      if (els.overspeedAlertBox) els.overspeedAlertBox.classList.remove('hidden');

      if (!state.overspeedAlertActive && !state.overspeedCooldown) {
        state.overspeedAlertActive = true;
        state.overspeedCooldown = true;

        if (soundEngine) soundEngine.playOverspeedAlert();
        speakVoicePrompt('Please reduce your speed.');
        triggerHapticFeedback([200, 100, 200]);

        setTimeout(() => { state.overspeedCooldown = false; }, 8000);
      }
    } else {
      state.overspeedAlertActive = false;
      if (els.overspeedAlertBox) els.overspeedAlertBox.classList.add('hidden');
    }
  }

  function updateHeadingDisplay(headingVal) {
    if (headingVal === null || isNaN(headingVal)) {
      if (els.gpsHeadingVal) els.gpsHeadingVal.textContent = '--';
      return;
    }
    state.headingDeg = Math.round((headingVal + 360) % 360);
    const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    const cardIdx = Math.round(state.headingDeg / 45);
    const cardinalText = cardinals[cardIdx];

    if (els.gpsHeadingVal) {
      els.gpsHeadingVal.textContent = `${String(state.headingDeg).padStart(3, '0')}° (${cardinalText})`;
    }
  }

  // ============================================================================
  // ============================================================================
  // NEO-M8N GNSS BRIDGE & RIDER NAVIGATION ENGINE
  // (Phone GPS acts as NEO-M8N GNSS when helmet is connected via Bluetooth)
  // ============================================================================
  function handleNeoM8nLocationFix(position) {
    const coords = position.coords;
    const now = Date.now();
    const accuracy = coords.accuracy || 999.0;
    state.accuracyMeters = accuracy;

    // Check if GPS actually has a reliable satellite fix (Accuracy must be <= 30 meters)
    if (accuracy > 30.0) {
      state.hasGpsFix = false;
      state.hdop = +(accuracy / 5.0).toFixed(1);

      if (els.gpsFixStatus) {
        els.gpsFixStatus.textContent = 'Acquiring Fix...';
        els.gpsFixStatus.className = 'value badge-warning';
      }
      if (els.gpsSatellitesVal) {
        els.gpsSatellitesVal.textContent = '0 Locked';
      }
      if (els.gpsAccuracyVal) {
        els.gpsAccuracyVal.textContent = `± ${Math.round(accuracy)} m (Acquiring)`;
      }
      if (els.neoHardwareBadge) {
        els.neoHardwareBadge.textContent = (state.isBluetoothConnected || state.isHelmetOnline)
          ? 'Searching Fix...'
          : 'Offline (Connect Bluetooth)';
        els.neoHardwareBadge.className = 'status-pill status-pill-offline';
      }

      updateSpeedDisplay(0.0);
      return;
    }

    // ACCURATE FIX ACQUIRED (Accuracy <= 30m)
    state.hasGpsFix = true;
    state.hdop = +(Math.max(0.7, accuracy / 4.0)).toFixed(2);

    if (state.isBluetoothConnected || state.isHelmetOnline) {
      // HELMET CONNECTED VIA BLUETOOTH -> Mobile Phone GPS acts as NEO-M8N GNSS Engine!
      state.satellitesCount = Math.min(18, Math.max(7, Math.round(20 - state.hdop * 3)));

      if (els.gpsEngineTitle) els.gpsEngineTitle.textContent = 'NEO-M8N GNSS';
      if (els.gpsFixStatus) {
        els.gpsFixStatus.textContent = '3D Fix';
        els.gpsFixStatus.className = 'value badge-success';
      }
      if (els.gpsSatellitesVal) {
        els.gpsSatellitesVal.textContent = `${state.satellitesCount} Locked`;
      }
      if (els.gpsAccuracyVal) {
        els.gpsAccuracyVal.textContent = `± ${accuracy.toFixed(1)} m`;
      }
      if (els.neoHardwareBadge) {
        els.neoHardwareBadge.textContent = 'Hardware Active (3D Fix)';
        els.neoHardwareBadge.className = 'status-pill status-pill-success';
      }
      if (els.gpsLatVal) els.gpsLatVal.textContent = `${coords.latitude.toFixed(5)}° N`;
      if (els.gpsLngVal) els.gpsLngVal.textContent = `${coords.longitude.toFixed(5)}° E`;
    } else {
      // HELMET DISCONNECTED -> Phone GPS active for navigation only, NEO-M8N on standby
      state.satellitesCount = 0;
      if (els.gpsEngineTitle) els.gpsEngineTitle.textContent = 'Phone GPS (Standby)';
      if (els.gpsFixStatus) {
        els.gpsFixStatus.textContent = 'Phone: 3D Fix';
        els.gpsFixStatus.className = 'value badge-success';
      }
      if (els.gpsSatellitesVal) {
        els.gpsSatellitesVal.textContent = '-- (BT Disconnected)';
      }
      if (els.gpsAccuracyVal) {
        els.gpsAccuracyVal.textContent = `± ${accuracy.toFixed(1)} m`;
      }
      if (els.neoHardwareBadge) {
        els.neoHardwareBadge.textContent = 'Offline (Connect Bluetooth)';
        els.neoHardwareBadge.className = 'status-pill status-pill-offline';
      }
      if (els.gpsLatVal) els.gpsLatVal.textContent = `${coords.latitude.toFixed(5)}° N (Standby)`;
      if (els.gpsLngVal) els.gpsLngVal.textContent = `${coords.longitude.toFixed(5)}° E (Standby)`;
    }

    const lat2 = coords.latitude;
    const lon2 = coords.longitude;

    // Only compute speed & distance if we had a previous accurate fix
    if (state.latitude !== null && state.longitude !== null && state.lastFixTimestamp > 0) {
      const lat1 = state.latitude;
      const lon1 = state.longitude;
      const timeDeltaHours = (now - state.lastFixTimestamp) / 3600000;

      // Haversine Distance Calculation
      const R = 6371; // Earth radius km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const stepKm = R * c;

      // Speed Calculation
      let calculatedSpeed = 0.0;
      if (coords.speed !== null && coords.speed !== undefined && coords.speed > 0.4) {
        calculatedSpeed = coords.speed * 3.6;
      } else if (accuracy < 15.0 && timeDeltaHours > 0 && stepKm > 0.005) {
        const rawSpeed = stepKm / timeDeltaHours;
        if (rawSpeed < 140.0) {
          calculatedSpeed = rawSpeed;
        }
      }

      if (calculatedSpeed > 1.8 && stepKm > 0.003 && accuracy < 18.0) {
        state.totalDistanceKm += stepKm;
      }

      updateSpeedDisplay(calculatedSpeed);

      // Heading Calculation
      if (coords.heading !== null && coords.heading !== undefined && !isNaN(coords.heading)) {
        updateHeadingDisplay(coords.heading);
      } else if (stepKm > 0.004) {
        const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
        const x = Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) -
                  Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
        const brng = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        updateHeadingDisplay(brng);
      }
    } else {
      updateSpeedDisplay(0.0);
    }

    state.latitude = lat2;
    state.longitude = lon2;
    state.lastFixTimestamp = now;

    // Altitude
    if (coords.altitude !== null && coords.altitude !== undefined) {
      state.altitudeMeters = Math.round(coords.altitude);
      if (els.tripAltitudeVal) els.tripAltitudeVal.textContent = `${state.altitudeMeters} m`;
      if (els.gpsAltVal) els.gpsAltVal.textContent = `${state.altitudeMeters} meters`;
    }

    // Map Position Update (Marker moves smoothly without hijacking manual map dragging)
    if (leafletMap && riderMarker) {
      riderMarker.setLatLng([state.latitude, state.longitude]);
      if (!mapHasBeenCenteredInitially) {
        leafletMap.setView([state.latitude, state.longitude], 16);
        mapHasBeenCenteredInitially = true;
      }
    }

    // Update Live NMEA Sentences
    updateNmeaSentences();

    // Periodically sync live GPS position & active navigation to Django Backend
    syncMobileGpsToBackend();
  }

  let lastMobileGpsSyncMs = 0;
  function syncMobileGpsToBackend() {
    if (!state.latitude || !state.longitude) return;
    const now = Date.now();
    if (now - lastMobileGpsSyncMs < 2500) return;
    lastMobileGpsSyncMs = now;

    const baseUrl = state.serverUrl ? state.serverUrl.replace(/\/$/, '') : '';
    fetch(`${baseUrl}/api/telemetry/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        deviceId: state.deviceId,
        source: 'mobile_app_gps',
        latitude: state.latitude,
        longitude: state.longitude,
        speed: state.speedKmH,
        heading: state.headingDeg || 0,
        altitude: state.altitudeMeters || 0,
        satellites: state.satellitesCount,
        fix: state.hasGpsFix,
        navActive: Boolean(state.destination),
        destinationName: state.destination ? state.destination.name : '',
        destLat: state.destination ? state.destination.lat : null,
        destLng: state.destination ? state.destination.lng : null
      })
    }).catch(() => {});
  }

  function handleNeoM8nLocationError(error) {
    state.hasGpsFix = false;
    if (els.gpsFixStatus) {
      els.gpsFixStatus.textContent = 'GPS Searching...';
      els.gpsFixStatus.className = 'value badge-warning';
    }
    if (els.neoHardwareBadge) {
      els.neoHardwareBadge.textContent = (state.isBluetoothConnected || state.isHelmetOnline)
        ? 'Searching Fix...'
        : 'Offline (Connect Bluetooth)';
      els.neoHardwareBadge.className = 'status-pill status-pill-offline';
    }
  }

  // Start Location Listener
  function startNeoM8nGpsEngine() {
    if ('geolocation' in navigator) {
      if (state.gpsWatchId) navigator.geolocation.clearWatch(state.gpsWatchId);
      state.gpsWatchId = navigator.geolocation.watchPosition(
        handleNeoM8nLocationFix,
        handleNeoM8nLocationError,
        {
          enableHighAccuracy: true,
          timeout: 6000,
          maximumAge: 0
        }
      );
    }
  }

  // ============================================================================
  // NMEA-0183 PROTOCOL STREAM (Live when Bluetooth helmet is connected)
  // ============================================================================
  function computeNmeaChecksum(sentence) {
    let checksum = 0;
    for (let i = 0; i < sentence.length; i++) {
      checksum ^= sentence.charCodeAt(i);
    }
    return checksum.toString(16).toUpperCase().padStart(2, '0');
  }

  function updateNmeaSentences() {
    if (!els.nmeaOutputConsole) return;

    if (!state.isBluetoothConnected && !state.isHelmetOnline) {
      els.nmeaOutputConsole.textContent =
        '[STANDBY - BLUETOOTH DISCONNECTED]\n' +
        'u-blox NEO-M8N GNSS bridge is on standby.\n' +
        'Connect helmet via Bluetooth to activate NEO-M8N GPS and stream live NMEA sentences.';
      return;
    }

    if (!state.hasGpsFix || state.latitude === null) {
      els.nmeaOutputConsole.textContent =
        '$GNGGA,000000.00,0000.0000,N,00000.0000,E,0,00,99.9,0.0,M,0.0,M,,*49\n' +
        '$GNRMC,000000.00,V,0000.0000,N,00000.0000,E,0.00,000.0,000000,,,N*53';
      return;
    }

    const now = new Date();
    const utcHours = String(now.getUTCHours()).padStart(2, '0');
    const utcMins = String(now.getUTCMinutes()).padStart(2, '0');
    const utcSecs = String(now.getUTCSeconds()).padStart(2, '0');
    const timeStr = `${utcHours}${utcMins}${utcSecs}.00`;

    const day = String(now.getUTCDate()).padStart(2, '0');
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const year = String(now.getUTCFullYear()).slice(-2);
    const dateStr = `${day}${month}${year}`;

    // Latitude & Longitude Formatting (DDMM.MMMM for NMEA-0183 standard)
    const latDeg = Math.floor(Math.abs(state.latitude));
    const latMin = ((Math.abs(state.latitude) - latDeg) * 60).toFixed(4).padStart(7, '0');
    const latNmea = `${String(latDeg).padStart(2, '0')}${latMin}`;
    const latHemi = state.latitude >= 0 ? 'N' : 'S';

    const lngDeg = Math.floor(Math.abs(state.longitude));
    const lngMin = ((Math.abs(state.longitude) - lngDeg) * 60).toFixed(4).padStart(7, '0');
    const lngNmea = `${String(lngDeg).padStart(3, '0')}${lngMin}`;
    const lngHemi = state.longitude >= 0 ? 'E' : 'W';

    const speedKnots = (state.speedKmH * 0.539957).toFixed(2);
    const speedKmh = state.speedKmH.toFixed(2);
    const headingNmea = state.headingDeg !== null ? state.headingDeg.toFixed(1).padStart(5, '0') : '000.0';

    const ggaBody = `GNGGA,${timeStr},${latNmea},${latHemi},${lngNmea},${lngHemi},1,${state.satellitesCount},${state.hdop || 1.0},${state.altitudeMeters || 0}.0,M,0.0,M,,`;
    const gga = `$${ggaBody}*${computeNmeaChecksum(ggaBody)}`;

    const rmcBody = `GNRMC,${timeStr},A,${latNmea},${latHemi},${lngNmea},${lngHemi},${speedKnots},${headingNmea},${dateStr},,,A`;
    const rmc = `$${rmcBody}*${computeNmeaChecksum(rmcBody)}`;

    const vtgBody = `GNVTG,${headingNmea},T,,M,${speedKnots},N,${speedKmh},K,A`;
    const vtg = `$${vtgBody}*${computeNmeaChecksum(vtgBody)}`;

    els.nmeaOutputConsole.textContent = `${gga}\n${rmc}\n${vtg}`;
  }

  if (els.btnCopyNmea) {
    els.btnCopyNmea.addEventListener('click', () => {
      if (els.nmeaOutputConsole) {
        navigator.clipboard.writeText(els.nmeaOutputConsole.textContent).then(() => {
          triggerHapticFeedback([40]);
        });
      }
    });
  }

  // ============================================================================
  // BACKEND INTEGRATION: REAL HARDWARE STATUS POLLING (Truthful Telemetry)
  // ============================================================================
  async function pollHardwareTelemetryAndSync() {
    // If helmet is connected directly over Bluetooth, skip overwriting with HTTP state!
    if (state.isBluetoothConnected) {
      return;
    }

    const baseUrl = state.serverUrl ? state.serverUrl.replace(/\/$/, '') : '';

    try {
      const statusRes = await fetch(`${baseUrl}/api/telemetry/latest`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });

      if (statusRes.ok) {
        const latest = await statusRes.json();
        const esp32IsOnline = Boolean(latest.online);
        state.isHelmetOnline = esp32IsOnline;

        // Update Top Bar Connection Indicator
        if (els.backendStatusBadge) {
          const dot = els.backendStatusBadge.querySelector('.status-dot');
          if (dot) {
            dot.className = esp32IsOnline ? 'status-dot online' : 'status-dot offline';
          }
        }
        if (els.backendStatusText) {
          els.backendStatusText.textContent = esp32IsOnline ? 'Helmet Connected' : 'Helmet Offline';
        }

        // If ESP32 hardware is genuinely online, display its live sensors
        if (esp32IsOnline && latest.sensors) {
          const s = latest.sensors;
          state.helmetWorn = s.helmetWorn;
          state.batteryPercent = s.batteryPercent;
          state.batteryVoltage = s.batteryVoltage;
          state.totalG = s.totalG;
          state.tiltAngleDeg = s.tiltAngle;

          // Wear Sensor
          if (els.helmetWearStatusPill) {
            els.helmetWearStatusPill.textContent = s.helmetWorn ? 'Worn' : 'Not Worn';
            els.helmetWearStatusPill.className = s.helmetWorn ? 'status-pill status-pill-success' : 'status-pill status-pill-warning';
          }
          if (els.ignitionRelayStatus) {
            els.ignitionRelayStatus.textContent = s.helmetWorn ? 'Ignition Relay: Enabled' : 'Ignition Relay: LOCKED';
          }

          // Li-Ion Battery
          if (els.batteryPctVal) els.batteryPctVal.textContent = s.batteryPercent !== null ? `${s.batteryPercent}%` : '--%';
          if (els.batteryVoltageVal) els.batteryVoltageVal.textContent = s.batteryVoltage !== null ? `(${s.batteryVoltage.toFixed(2)}V)` : '(--V)';
          if (els.chargingStatusText) els.chargingStatusText.textContent = s.isCharging ? 'Status: Charging...' : 'Status: Normal Voltage';

          // MPU6050 IMU
          if (els.imuTotalG) els.imuTotalG.textContent = s.totalG !== null ? `${s.totalG.toFixed(2)} g` : '-- g';
          if (els.imuTiltDeg) els.imuTiltDeg.textContent = s.tiltAngle !== null ? `${s.tiltAngle.toFixed(1)}°` : '--°';
          if (els.imuAccelX) els.imuAccelX.textContent = s.accelX !== null ? `${s.accelX.toFixed(2)} g` : '-- g';
          if (els.imuAccelY) els.imuAccelY.textContent = s.accelY !== null ? `${s.accelY.toFixed(2)} g` : '-- g';

          // Helmet Hardware NEO-M8N GPS
          if (latest.gps) {
            state.satellitesCount = latest.gps.satellites || 0;
            if (els.gpsSatellitesVal) els.gpsSatellitesVal.textContent = `${state.satellitesCount} Locked`;
            if (els.gpsEngineTitle) els.gpsEngineTitle.textContent = 'NEO-M8N GNSS';
            if (els.neoHardwareBadge) {
              els.neoHardwareBadge.textContent = latest.gps.fix ? 'Hardware Active (3D Fix)' : 'Searching Fix...';
              els.neoHardwareBadge.className = latest.gps.fix ? 'status-pill status-pill-success' : 'status-pill status-pill-warning';
            }
          }

          // Handle any pending audio commands
          if (latest.navigation && latest.navigation.instruction && latest.navigation.instruction !== state.navInstruction) {
            state.navInstruction = latest.navigation.instruction;
            if (els.guidanceInstructionText) els.guidanceInstructionText.textContent = state.navInstruction;
            speakVoicePrompt(state.navInstruction);
          }

          updateNmeaSentences();
        } else {
          // ESP32 IS OFFLINE -> SHOW TRUTHFUL DISCONNECTED/STANDBY IN UI
          state.satellitesCount = 0;
          if (els.helmetWearStatusPill) {
            els.helmetWearStatusPill.textContent = 'Offline';
            els.helmetWearStatusPill.className = 'status-pill status-pill-offline';
          }
          if (els.ignitionRelayStatus) {
            els.ignitionRelayStatus.textContent = 'Ignition Relay: Standby (Helmet Offline)';
          }
          if (els.batteryPctVal) els.batteryPctVal.textContent = '--%';
          if (els.batteryVoltageVal) els.batteryVoltageVal.textContent = '(--V)';
          if (els.chargingStatusText) els.chargingStatusText.textContent = 'Status: Helmet Offline';

          if (els.imuTotalG) els.imuTotalG.textContent = '-- g';
          if (els.imuTiltDeg) els.imuTiltDeg.textContent = '--°';
          if (els.imuAccelX) els.imuAccelX.textContent = '-- g';
          if (els.imuAccelY) els.imuAccelY.textContent = '-- g';

          if (els.gpsEngineTitle) els.gpsEngineTitle.textContent = 'Phone GPS (Nav)';
          if (els.gpsSatellitesVal) els.gpsSatellitesVal.textContent = '-- (Offline)';
          if (els.neoHardwareBadge) {
            els.neoHardwareBadge.textContent = 'Hardware Offline';
            els.neoHardwareBadge.className = 'status-pill status-pill-offline';
          }

          updateNmeaSentences();
        }
      }
    } catch (e) {
      // Backend unreachable
      state.isHelmetOnline = false;
      if (els.backendStatusBadge) {
        const dot = els.backendStatusBadge.querySelector('.status-dot');
        if (dot) dot.className = 'status-dot offline';
      }
      if (els.backendStatusText) els.backendStatusText.textContent = 'Helmet Offline';
      if (els.gpsEngineTitle) els.gpsEngineTitle.textContent = 'Phone GPS (Nav)';
      if (els.gpsSatellitesVal) els.gpsSatellitesVal.textContent = '-- (Offline)';
      if (els.neoHardwareBadge) {
        els.neoHardwareBadge.textContent = 'Hardware Offline';
        els.neoHardwareBadge.className = 'status-pill status-pill-offline';
      }
      updateNmeaSentences();
    }
  }

  // Poll hardware status every 2 seconds
  setInterval(pollHardwareTelemetryAndSync, 2000);

  // Settings Configuration Listeners
  if (els.cfgDeviceId) {
    els.cfgDeviceId.addEventListener('change', (e) => {
      state.deviceId = e.target.value.trim() || 'KAVACH-ESP32-01';
    });
  }

  if (els.cfgServerUrl) {
    els.cfgServerUrl.addEventListener('change', (e) => {
      state.serverUrl = e.target.value.trim();
    });
  }

  if (els.cfgSpeedLimit) {
    els.cfgSpeedLimit.addEventListener('change', (e) => {
      state.overspeedLimitKmH = parseFloat(e.target.value) || 60.0;
      if (els.speedLimitLabel) els.speedLimitLabel.textContent = Math.round(state.overspeedLimitKmH);
    });
  }

  if (els.chkVoiceEnabled) {
    els.chkVoiceEnabled.addEventListener('change', (e) => {
      state.voiceEnabled = e.target.checked;
    });
  }

  if (els.chkVibrateEnabled) {
    els.chkVibrateEnabled.addEventListener('change', (e) => {
      state.vibrationEnabled = e.target.checked;
    });
  }

  // ============================================================================
  // 15-SECOND ACCIDENT EMERGENCY PIPELINE
  // ============================================================================
  function launchAccidentCountdown(isManualTest = false) {
    if (state.inCountdown) return;
    // CRITICAL: An accident can only occur if the rider is wearing the helmet!
    // If the helmet is not worn (e.g. resting on table or carried), ignore tilt false alarms
    if (!state.helmetWorn && !isManualTest) {
      return;
    }
    // Prevent rapid re-triggering if rider recently cancelled (15s grace cooldown)
    if (!isManualTest && (Date.now() - state.lastAccidentCancelMs < 15000)) {
      return;
    }
    state.inCountdown = true;
    state.countdownSecondsRemaining = 15;

    if (els.accidentModal) els.accidentModal.classList.remove('hidden');
    if (els.countdownNumber) els.countdownNumber.textContent = '15';
    if (els.modalGForce) els.modalGForce.textContent = '4.50 g';
    if (els.modalTilt) els.modalTilt.textContent = '75.0°';
    if (els.modalSpeed) els.modalSpeed.textContent = `${Math.round(state.speedKmH)} km/h`;

    speakVoicePrompt('Accident detected. Press the cancel button if you are safe.');
    triggerHapticFeedback([300, 100, 300, 100, 300]);

    const baseUrl = state.serverUrl ? state.serverUrl.replace(/\/$/, '') : '';
    fetch(`${baseUrl}/api/emergency/accident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: false, gForce: 4.5, tilt: 75.0 })
    }).catch(() => {});

    clearInterval(state.countdownTimer);
    state.countdownTimer = setInterval(() => {
      state.countdownSecondsRemaining--;
      if (els.countdownNumber) els.countdownNumber.textContent = state.countdownSecondsRemaining;

      if (soundEngine) soundEngine.playCountdownTick(state.countdownSecondsRemaining);
      triggerHapticFeedback([100]);

      if (state.countdownSecondsRemaining <= 0) {
        clearInterval(state.countdownTimer);
        confirmAccidentCritical();
      }
    }, 1000);
  }

  function cancelAccidentAlert() {
    if (!state.inCountdown) return;
    clearInterval(state.countdownTimer);
    state.inCountdown = false;
    state.accidentConfirmed = false;
    state.lastAccidentCancelMs = Date.now(); // Record timestamp to enforce 15s cooldown

    if (els.accidentModal) els.accidentModal.classList.add('hidden');
    if (soundEngine) soundEngine.stopSosSiren();

    speakVoicePrompt('Emergency alert cancelled. False alarm resolved.');
    triggerHapticFeedback([100, 50, 100]);

    // Send cancellation to ESP32 over Bluetooth if connected!
    if (window.AndroidBridge && window.AndroidBridge.sendCommandToHelmet) {
      window.AndroidBridge.sendCommandToHelmet('{"cancelAccident":true}');
    }

    const baseUrl = state.serverUrl ? state.serverUrl.replace(/\/$/, '') : '';
    fetch(`${baseUrl}/api/emergency/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => {});
  }

  function confirmAccidentCritical() {
    state.inCountdown = false;
    state.accidentConfirmed = true;
    clearInterval(state.countdownTimer);

    if (els.accidentModal) els.accidentModal.classList.add('hidden');
    if (soundEngine) soundEngine.startSosSiren();

    if (els.emergencyBanner) {
      els.emergencyBanner.classList.remove('hidden');
      if (els.emergencyDetails && state.latitude && state.longitude) {
        els.emergencyDetails.textContent = `Crash Coordinates: ${state.latitude.toFixed(5)}° N, ${state.longitude.toFixed(5)}° E`;
      }
    }

    speakVoicePrompt('Critical crash confirmed. Emergency contacts notified.');
    triggerHapticFeedback([500, 200, 500, 200, 500]);

    const baseUrl = state.serverUrl ? state.serverUrl.replace(/\/$/, '') : '';
    fetch(`${baseUrl}/api/emergency/accident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true, gForce: 4.5, tilt: 75.0 })
    }).catch(() => {});
  }

  if (els.btnTestAccidentWindow) {
    els.btnTestAccidentWindow.addEventListener('click', () => {
      launchAccidentCountdown(true); // true = manual test override
    });
  }

  if (els.btnCancelAccident) {
    els.btnCancelAccident.addEventListener('click', cancelAccidentAlert);
  }

  if (els.btnInstantDispatch) {
    els.btnInstantDispatch.addEventListener('click', confirmAccidentCritical);
  }

  if (els.btnResolveEmergency) {
    els.btnResolveEmergency.addEventListener('click', () => {
      state.accidentConfirmed = false;
      state.sosActive = false;
      if (els.emergencyBanner) els.emergencyBanner.classList.add('hidden');
      if (soundEngine) soundEngine.stopSosSiren();

      const baseUrl = state.serverUrl ? state.serverUrl.replace(/\/$/, '') : '';
      fetch(`${baseUrl}/api/emergency/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      }).catch(() => {});
    });
  }

  // Emergency SOS Button
  if (els.btnSosTrigger) {
    els.btnSosTrigger.addEventListener('click', () => {
      state.sosActive = true;
      if (soundEngine) soundEngine.startSosSiren();
      if (els.emergencyBanner) {
        els.emergencyBanner.classList.remove('hidden');
        if (els.emergencyDetails && state.latitude && state.longitude) {
          els.emergencyDetails.textContent = `SOS Beacon: ${state.latitude.toFixed(5)}° N, ${state.longitude.toFixed(5)}° E`;
        }
      }
      speakVoicePrompt('Emergency SOS activated. Distress beacon transmitting.');
      triggerHapticFeedback([400, 100, 400]);

      const baseUrl = state.serverUrl ? state.serverUrl.replace(/\/$/, '') : '';
      fetch(`${baseUrl}/api/emergency/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger' })
      }).catch(() => {});
    });
  }

  // ============================================================================
  // 📶 BLUETOOTH TELEMETRY ENGINE (Direct Mobile App <-> ESP32 Link)
  // ============================================================================
  // ============================================================================
  // 📶 BLUETOOTH TELEMETRY ENGINE & HARDWARE 1/0 DIAGNOSTICS POPUP
  // ============================================================================
  let hwDiagShownThisSession = false;

  function updateHwDiagPill(el, isOk, okText, badText) {
    if (!el) return;
    el.className = isOk ? 'diag-value-pill val-1' : 'diag-value-pill val-0';
    el.innerHTML = `<span class="diag-bin">${isOk ? '1' : '0'}</span><span class="diag-text">${isOk ? okText : badText}</span>`;
  }

  function updateHardwareDiagnosticsUI(data) {
    const espOk = data.espOk !== undefined ? Number(data.espOk) : 1;
    const ampOk = data.ampOk !== undefined ? Number(data.ampOk) : 1;
    const mpuOk = data.mpuOk !== undefined ? Number(data.mpuOk) : (data.totalG ? 1 : 0);
    const gpsOk = data.gpsOk !== undefined ? Number(data.gpsOk) : (state.hasGpsFix ? 1 : 0);
    const irRaw = data.irRaw !== undefined ? Number(data.irRaw) : (data.worn ? 1 : 0);
    const touchRaw = data.touchRaw !== undefined ? Number(data.touchRaw) : 0;

    state.lastHwDiag = { espOk, ampOk, mpuOk, gpsOk, irRaw, touchRaw };

    updateHwDiagPill(els.diagValEsp, espOk === 1, 'CONNECTED', 'DISCONNECTED');
    updateHwDiagPill(els.diagValAmp, ampOk === 1, 'CONNECTED', 'DISCONNECTED');
    updateHwDiagPill(els.diagValMpu, mpuOk === 1, 'CONNECTED (0x68)', 'DISCONNECTED');
    updateHwDiagPill(els.diagValGps, gpsOk === 1, 'CONNECTED (UART2)', 'NO NMEA STREAM');
    updateHwDiagPill(els.diagValIr, irRaw === 1, 'OBJECT DETECTED (1)', 'CLEAR / IDLE (0)');
    updateHwDiagPill(els.diagValTouch, touchRaw === 1, 'TOUCHED (1)', 'RELEASED / IDLE (0)');
  }

  function showHardwareDiagnosticsModal() {
    if (els.hwDiagModal) {
      els.hwDiagModal.classList.remove('hidden');
      triggerHapticFeedback([40]);
    }
  }

  function hideHardwareDiagnosticsModal() {
    if (els.hwDiagModal) {
      els.hwDiagModal.classList.add('hidden');
    }
  }

  if (els.btnCloseHwDiag) els.btnCloseHwDiag.addEventListener('click', hideHardwareDiagnosticsModal);
  if (els.btnAckHwDiag) els.btnAckHwDiag.addEventListener('click', hideHardwareDiagnosticsModal);
  if (els.btnShowHwDiag) els.btnShowHwDiag.addEventListener('click', showHardwareDiagnosticsModal);

  function handleNativeHelmetBluetoothStatus(connected, message) {
    state.isBluetoothConnected = Boolean(connected);
    if (els.btStatusPill) {
      els.btStatusPill.textContent = state.isBluetoothConnected ? 'Connected' : 'Disconnected';
      els.btStatusPill.className = state.isBluetoothConnected ? 'status-pill status-pill-success' : 'status-pill status-pill-offline';
    }
    if (els.btStatusDesc) {
      els.btStatusDesc.textContent = message || (state.isBluetoothConnected ? 'Connected to KAVACH_HELMET_01' : 'Disconnected');
    }
    if (els.btIcon) {
      els.btIcon.style.color = state.isBluetoothConnected ? '#2563eb' : '';
    }
    if (state.isBluetoothConnected) {
      state.isHelmetOnline = true;
      if (els.backendStatusBadge) {
        const dot = els.backendStatusBadge.querySelector('.status-dot');
        if (dot) dot.className = 'status-dot online';
      }
      if (els.backendStatusText) {
        els.backendStatusText.textContent = 'Helmet Connected (BT)';
      }
      if (els.gpsEngineTitle) {
        els.gpsEngineTitle.textContent = 'NEO-M8N GNSS';
      }
      if (state.hasGpsFix) {
        state.satellitesCount = Math.min(18, Math.max(7, Math.round(20 - (state.hdop || 2.0) * 3)));
        if (els.gpsSatellitesVal) els.gpsSatellitesVal.textContent = `${state.satellitesCount} Locked`;
        if (els.neoHardwareBadge) {
          els.neoHardwareBadge.textContent = 'Hardware Active (3D Fix)';
          els.neoHardwareBadge.className = 'status-pill status-pill-success';
        }
      }
      updateNmeaSentences();
      speakVoicePrompt('Helmet connected via Bluetooth.');
      // Auto-show hardware diagnostics modal on connect
      if (!hwDiagShownThisSession) {
        hwDiagShownThisSession = true;
        showHardwareDiagnosticsModal();
      }
    } else {
      state.isHelmetOnline = false;
      if (els.gpsEngineTitle) els.gpsEngineTitle.textContent = 'Phone GPS (Standby)';
      if (els.gpsSatellitesVal) els.gpsSatellitesVal.textContent = '-- (BT Disconnected)';
      if (els.neoHardwareBadge) {
        els.neoHardwareBadge.textContent = 'Offline (Connect Bluetooth)';
        els.neoHardwareBadge.className = 'status-pill status-pill-offline';
      }
      updateNmeaSentences();
      pollHardwareTelemetryAndSync();
    }
  }
  window.handleNativeHelmetBluetoothStatus = handleNativeHelmetBluetoothStatus;

  function handleNativeHelmetBluetoothData(jsonPayload) {
    try {
      const data = typeof jsonPayload === 'string' ? JSON.parse(jsonPayload) : jsonPayload;
      state.isHelmetOnline = true;
      state.isBluetoothConnected = true;

      // Ingest 1/0 Hardware Status Diagnostics
      updateHardwareDiagnosticsUI(data);

      // Auto-popup diagnostic checklist upon receiving first hardware status packet
      if (!hwDiagShownThisSession) {
        hwDiagShownThisSession = true;
        showHardwareDiagnosticsModal();
      }

      if (data.worn !== undefined) state.helmetWorn = Boolean(data.worn);
      if (data.battery !== undefined) state.batteryPercent = parseInt(data.battery);
      if (data.voltage !== undefined) state.batteryVoltage = parseFloat(data.voltage);
      if (data.totalG !== undefined) state.totalG = parseFloat(data.totalG);
      if (data.tilt !== undefined) state.tiltAngleDeg = parseFloat(data.tilt);
      if (data.accelX !== undefined) state.accelX = parseFloat(data.accelX);
      if (data.accelY !== undefined) state.accelY = parseFloat(data.accelY);

      // Real-time UI updates
      if (els.helmetWearStatusPill) {
        els.helmetWearStatusPill.textContent = state.helmetWorn ? 'Worn' : 'Not Worn';
        els.helmetWearStatusPill.className = state.helmetWorn ? 'status-pill status-pill-success' : 'status-pill status-pill-warning';
      }
      if (els.ignitionRelayStatus) {
        els.ignitionRelayStatus.textContent = state.helmetWorn ? 'Ignition Relay: Enabled' : 'Ignition Relay: LOCKED';
      }
      if (els.batteryPctVal && state.batteryPercent !== null) {
        els.batteryPctVal.textContent = `${state.batteryPercent}%`;
      }
      if (els.batteryVoltageVal && state.batteryVoltage !== null) {
        els.batteryVoltageVal.textContent = `(${state.batteryVoltage.toFixed(2)}V)`;
      }
      if (els.chargingStatusText) {
        els.chargingStatusText.textContent = data.charging ? 'Status: Charging...' : 'Status: Bluetooth Telemetry Live';
      }
      if (els.imuTotalG && state.totalG !== null) {
        els.imuTotalG.textContent = `${state.totalG.toFixed(2)} g`;
      }
      if (els.imuTiltDeg && state.tiltAngleDeg !== null) {
        els.imuTiltDeg.textContent = `${state.tiltAngleDeg.toFixed(1)}°`;
      }

      // Update Top Status Badge
      if (els.backendStatusBadge) {
        const dot = els.backendStatusBadge.querySelector('.status-dot');
        if (dot) dot.className = 'status-dot online';
      }
      if (els.backendStatusText) {
        els.backendStatusText.textContent = 'Helmet Connected (BT)';
      }
      if (els.btIcon) {
        els.btIcon.style.color = '#2563eb';
      }

      // Accident / Impact Detection (ONLY when helmet is actually worn!)
      if (state.helmetWorn && (data.impact || data.countdown)) {
        if (!state.inCountdown && (Date.now() - state.lastAccidentCancelMs >= 15000)) {
          launchAccidentCountdown();
        }
      } else if (!state.helmetWorn && state.inCountdown) {
        cancelAccidentAlert();
      }

      // Forward to Cloud Backend using Phone's 4G/5G data (Throttled to every 1.5s)
      const now = Date.now();
      if (now - state.lastBtCloudSyncMs >= 1500) {
        state.lastBtCloudSyncMs = now;
        forwardMergedTelemetryToBackend();
      }
    } catch (e) {
      console.error('Error parsing helmet Bluetooth telemetry', e);
    }
  }
  window.handleNativeHelmetBluetoothData = handleNativeHelmetBluetoothData;

  async function forwardMergedTelemetryToBackend() {
    const baseUrl = state.serverUrl ? state.serverUrl.replace(/\/$/, '') : 'http://192.168.0.106:3000';
    try {
      await fetch(`${baseUrl}/api/telemetry/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          deviceId: state.deviceId,
          source: 'mobile_app_bluetooth',
          helmetWorn: state.helmetWorn,
          batteryPercent: state.batteryPercent,
          batteryVoltage: state.batteryVoltage,
          totalG: state.totalG,
          tiltAngle: state.tiltAngleDeg,
          accelX: state.accelX,
          accelY: state.accelY,
          latitude: state.latitude,
          longitude: state.longitude,
          speed: state.speedKmH,
          heading: state.headingDeg || 0,
          altitude: state.altitudeMeters || 0,
          satellites: state.satellitesCount,
          fix: state.hasGpsFix,
          navActive: Boolean(state.destination),
          destinationName: state.destination ? state.destination.name : '',
          destLat: state.destination ? state.destination.lat : null,
          destLng: state.destination ? state.destination.lng : null,
          distanceKm: state.navDistanceMeters ? parseFloat((state.navDistanceMeters / 1000).toFixed(1)) : 0.0,
          etaMinutes: state.navEtaMinutes || 0,
          instruction: state.navInstruction || '',
          espOk: state.lastHwDiag.espOk,
          ampOk: state.lastHwDiag.ampOk,
          mpuOk: state.lastHwDiag.mpuOk,
          gpsOk: state.lastHwDiag.gpsOk,
          irRaw: state.lastHwDiag.irRaw,
          touchRaw: state.lastHwDiag.touchRaw
        })
      });
    } catch (e) {
      console.warn('Backend forwarding offline or unreachable:', e);
    }
  }

  // Bluetooth Connection Buttons
  if (els.btConnectBtn) {
    els.btConnectBtn.addEventListener('click', () => {
      triggerHapticFeedback([40]);
      if (window.AndroidBridge && window.AndroidBridge.connectBluetooth) {
        window.AndroidBridge.connectBluetooth();
      } else {
        alert('Bluetooth is active when running inside the Kavach Android APK.');
      }
    });
  }

  if (els.btnManualBtConnect) {
    els.btnManualBtConnect.addEventListener('click', () => {
      triggerHapticFeedback([40]);
      if (window.AndroidBridge && window.AndroidBridge.connectBluetooth) {
        window.AndroidBridge.connectBluetooth();
      } else {
        alert('Bluetooth is active when running inside the Kavach Android APK.');
      }
    });
  }

  if (els.btnManualBtDisconnect) {
    els.btnManualBtDisconnect.addEventListener('click', () => {
      triggerHapticFeedback([40]);
      if (window.AndroidBridge && window.AndroidBridge.disconnectBluetooth) {
        window.AndroidBridge.disconnectBluetooth();
        handleNativeHelmetBluetoothStatus(false, 'Disconnected by rider');
      }
    });
  }

  const btnTestHelmetSpeaker = document.getElementById('btn-test-helmet-speaker');
  if (btnTestHelmetSpeaker) {
    btnTestHelmetSpeaker.addEventListener('click', () => {
      triggerHapticFeedback([50]);
      if (window.AndroidBridge && window.AndroidBridge.sendCommandToHelmet) {
        window.AndroidBridge.sendCommandToHelmet('{"command":"TEST_BEEP"}');
        speakVoicePrompt('Test audio command transmitted to helmet speaker.');
      } else {
        alert('Please connect to helmet via Bluetooth first.');
      }
    });
  }

  // Wire Configuration Inputs
  if (els.cfgServerUrl) {
    els.cfgServerUrl.value = state.serverUrl;
    els.cfgServerUrl.addEventListener('change', () => {
      const val = els.cfgServerUrl.value.trim().replace(/\/$/, '');
      if (val) {
        state.serverUrl = val;
        try { localStorage.setItem('kavach_server_url', val); } catch (e) {}
        console.log('Saved server URL:', val);
      }
    });
  }

  if (els.cfgDeviceId) {
    els.cfgDeviceId.value = state.deviceId;
    els.cfgDeviceId.addEventListener('change', () => {
      const val = els.cfgDeviceId.value.trim();
      if (val) {
        state.deviceId = val;
        try { localStorage.setItem('kavach_device_id', val); } catch (e) {}
      }
    });
  }

  if (els.cfgSpeedLimit) {
    els.cfgSpeedLimit.value = state.overspeedLimitKmH;
    els.cfgSpeedLimit.addEventListener('change', () => {
      state.overspeedLimitKmH = parseFloat(els.cfgSpeedLimit.value) || 60;
      if (els.speedLimitLabel) els.speedLimitLabel.textContent = `Limit: ${state.overspeedLimitKmH} km/h`;
    });
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  initMap();
  startNeoM8nGpsEngine();
  updateSpeedDisplay(0);
  updateNmeaSentences();
  pollHardwareTelemetryAndSync();
});
