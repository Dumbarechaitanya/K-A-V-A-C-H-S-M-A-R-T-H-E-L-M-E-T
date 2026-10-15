const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { uploadReportToCloudinary } = require('./cloudinary');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// Global Helmet Telemetry & State Store
let helmetState = {
  deviceId: 'KAVACH-ESP32-01',
  online: true,
  lastSeen: new Date().toISOString(),
  gps: {
    latitude: 27.7172,
    longitude: 85.3240,
    speedKmH: 0.0,
    altitudeMeters: 1350.0,
    satellites: 8,
    fix: true,
    heading: 45
  },
  sensors: {
    helmetWorn: true,            // IR sensor: true (worn) / false (removed)
    accelX: 0.02,                // MPU6050 Accel X (g)
    accelY: -0.05,               // MPU6050 Accel Y (g)
    accelZ: 0.99,                // MPU6050 Accel Z (g)
    totalG: 1.00,                // Resultant total acceleration (g)
    tiltAngle: 2.8,              // Tilt angle in degrees (0 - 90 deg)
    impactDetected: false,       // Triggered if totalG > 3.5g or tilt > 60 deg
    overspeedAlert: false,       // Triggered if speed > overspeedLimitKmH
    overspeedLimitKmH: 60.0,     // Configurable overspeed threshold
    sosActive: false,            // Triggered by SOS push button
    batteryVoltage: 4.12,        // Li-ion / TP4056 (3.3V - 4.2V)
    batteryPercent: 92,          // 0 - 100%
    isCharging: false            // TP4056 charging pin
  },
  navigation: {
    active: false,
    destinationName: 'Central City Hospital',
    destLat: 27.7250,
    destLng: 85.3350,
    distanceRemainingKm: 2.8,
    etaMinutes: 7,
    currentInstruction: 'Head north on Ring Road toward Main Ave',
    nextTurn: 'Turn right in 350m',
    stepIndex: 0
  },
  emergency: {
    inAccidentCountdown: false,
    countdownRemaining: 15,      // 15-second false alarm cancellation window
    accidentTriggered: false,
    accidentTime: null,
    accidentLocation: null,
    sosTriggered: false,
    sosTime: null
  },
  stats: {
    totalDistanceKm: 14.8,
    maxSpeedKmH: 52.4,
    avgSpeedKmH: 28.1,
    tripDurationMinutes: 38
  }
};

// History buffers (kept in memory, circular buffer)
const MAX_TRAIL_POINTS = 500;
let gpsTrail = [
  { lat: 27.7170, lng: 85.3235, speed: 20, time: new Date(Date.now() - 60000).toISOString() },
  { lat: 27.7172, lng: 85.3240, speed: 25, time: new Date().toISOString() }
];

const MAX_LOGS = 100;
let incidentLogs = [
  {
    id: 1,
    type: 'SYSTEM',
    message: 'Kavach Smart Helmet Cloud Gateway online. Ready for IoE telemetry.',
    timestamp: new Date().toISOString(),
    severity: 'info'
  }
];

// Queued voice/audio commands for ESP32
let pendingCommands = [];

function addIncidentLog(type, message, severity = 'info', metadata = null) {
  const log = {
    id: Date.now(),
    type,
    message,
    timestamp: new Date().toISOString(),
    severity,
    metadata
  };
  incidentLogs.unshift(log);
  if (incidentLogs.length > MAX_LOGS) {
    incidentLogs.pop();
  }
  io.emit('new_log', log);

  // Persist incident to Neon Serverless PostgreSQL
  db.insertIncident(type, message, severity, metadata)
    .catch(err => console.error('Neon DB Incident Insert Error:', err.message));

  return log;
}

// Convert voltage to battery %
function calculateBatteryPercent(voltage) {
  if (voltage >= 4.2) return 100;
  if (voltage <= 3.3) return 0;
  return Math.round(((voltage - 3.3) / (4.2 - 3.3)) * 100);
}

// REST API Endpoints

// 1. ESP32 Telemetry Endpoint
app.post('/api/telemetry', (req, res) => {
  const data = req.body;
  const now = new Date().toISOString();

  helmetState.deviceId = data.deviceId || helmetState.deviceId;
  helmetState.online = true;
  helmetState.lastSeen = now;

  // GPS Data
  if (data.latitude !== undefined && data.longitude !== undefined) {
    helmetState.gps.latitude = parseFloat(data.latitude);
    helmetState.gps.longitude = parseFloat(data.longitude);
    helmetState.gps.speedKmH = parseFloat(data.speed || data.speedKmH || 0);
    helmetState.gps.altitudeMeters = parseFloat(data.altitude || data.altitudeMeters || 0);
    helmetState.gps.satellites = parseInt(data.satellites || 0, 10);
    helmetState.gps.fix = data.fix !== undefined ? Boolean(data.fix) : (helmetState.gps.satellites > 3);
    if (data.heading !== undefined) helmetState.gps.heading = parseFloat(data.heading);

    // Speed Monitoring Updates
    if (helmetState.gps.speedKmH > helmetState.stats.maxSpeedKmH) {
      helmetState.stats.maxSpeedKmH = Math.round(helmetState.gps.speedKmH * 10) / 10;
    }
    if (data.maxSpeed !== undefined) helmetState.stats.maxSpeedKmH = parseFloat(data.maxSpeed);
    if (data.avgSpeed !== undefined) helmetState.stats.avgSpeedKmH = parseFloat(data.avgSpeed);
    if (data.totalDistance !== undefined) helmetState.stats.totalDistanceKm = parseFloat(data.totalDistance);

    // Overspeed check
    const isOverspeed = helmetState.gps.speedKmH >= helmetState.sensors.overspeedLimitKmH;
    if (isOverspeed && !helmetState.sensors.overspeedAlert) {
      helmetState.sensors.overspeedAlert = true;
      addIncidentLog(
        'OVERSPEED',
        `Overspeed alert: ${helmetState.gps.speedKmH.toFixed(1)} km/h (Limit: ${helmetState.sensors.overspeedLimitKmH} km/h). Voice: Please reduce your speed.`,
        'warning',
        { speed: helmetState.gps.speedKmH, limit: helmetState.sensors.overspeedLimitKmH }
      );
    } else if (!isOverspeed) {
      helmetState.sensors.overspeedAlert = false;
    }

    // Add to GPS trail
    if (helmetState.gps.fix && helmetState.gps.latitude !== 0) {
      gpsTrail.push({
        lat: helmetState.gps.latitude,
        lng: helmetState.gps.longitude,
        speed: helmetState.gps.speedKmH,
        time: now
      });
      if (gpsTrail.length > MAX_TRAIL_POINTS) gpsTrail.shift();
    }
  }

  // IR Sensor (Helmet Worn)
  if (data.helmetWorn !== undefined) {
    const wasWorn = helmetState.sensors.helmetWorn;
    helmetState.sensors.helmetWorn = Boolean(data.helmetWorn);
    if (wasWorn !== helmetState.sensors.helmetWorn) {
      if (helmetState.sensors.helmetWorn) {
        addIncidentLog('HELMET_STATUS', 'Helmet worn and secured. Ignition relay enabled.', 'success');
      } else {
        addIncidentLog('HELMET_STATUS', 'Helmet removed! Voice alert: "Please wear your helmet". Ignition relay locked.', 'warning');
      }
    }
  }

  // MPU6050 IMU Data
  if (data.totalG !== undefined) helmetState.sensors.totalG = parseFloat(data.totalG);
  if (data.tiltAngle !== undefined) helmetState.sensors.tiltAngle = parseFloat(data.tiltAngle);
  if (data.accelX !== undefined) helmetState.sensors.accelX = parseFloat(data.accelX);
  if (data.accelY !== undefined) helmetState.sensors.accelY = parseFloat(data.accelY);
  if (data.accelZ !== undefined) helmetState.sensors.accelZ = parseFloat(data.accelZ);

  // Battery Telemetry
  if (data.batteryVoltage !== undefined) {
    helmetState.sensors.batteryVoltage = parseFloat(data.batteryVoltage);
    helmetState.sensors.batteryPercent = calculateBatteryPercent(helmetState.sensors.batteryVoltage);
  } else if (data.batteryPercent !== undefined) {
    helmetState.sensors.batteryPercent = parseInt(data.batteryPercent, 10);
  }
  if (data.isCharging !== undefined) {
    helmetState.sensors.isCharging = Boolean(data.isCharging);
  }

  // SOS Push Button Trigger
  if (data.sosActive !== undefined && Boolean(data.sosActive) && !helmetState.sensors.sosActive) {
    helmetState.sensors.sosActive = true;
    helmetState.emergency.sosTriggered = true;
    helmetState.emergency.sosTime = now;
    addIncidentLog(
      'EMERGENCY_SOS',
      `EMERGENCY SOS button triggered by rider! Location: ${helmetState.gps.latitude.toFixed(5)}, ${helmetState.gps.longitude.toFixed(5)}`,
      'danger',
      { lat: helmetState.gps.latitude, lng: helmetState.gps.longitude, speed: helmetState.gps.speedKmH }
    );
  }

  // Accident state sync from ESP32
  if (data.inAccidentCountdown !== undefined) {
    helmetState.emergency.inAccidentCountdown = Boolean(data.inAccidentCountdown);
  }
  if (data.accidentConfirmed !== undefined && Boolean(data.accidentConfirmed) && !helmetState.emergency.accidentTriggered) {
    helmetState.emergency.accidentTriggered = true;
    helmetState.emergency.accidentTime = now;
    helmetState.emergency.accidentLocation = { lat: helmetState.gps.latitude, lng: helmetState.gps.longitude };
    addIncidentLog(
      'ACCIDENT_CRITICAL',
      `CRITICAL: Accident confirmed (MPU6050 G-Force: ${helmetState.sensors.totalG}g, Tilt: ${helmetState.sensors.tiltAngle}°). Emergency dispatch alerted!`,
      'danger',
      { lat: helmetState.gps.latitude, lng: helmetState.gps.longitude, gForce: helmetState.sensors.totalG, tilt: helmetState.sensors.tiltAngle }
    );
  }

  // Broadcast state to all connected web dashboards
  io.emit('telemetry_update', helmetState);

  // Persist telemetry to Neon PostgreSQL
  db.insertTelemetry(helmetState)
    .catch(err => console.error('Neon DB Telemetry Insert Error:', err.message));

  // Return response + any pending commands for ESP32
  const responseCommands = [...pendingCommands];
  pendingCommands = []; // flush

  return res.status(200).json({
    status: 'success',
    timestamp: now,
    commands: responseCommands
  });
});

// 2. Direct Emergency SOS Endpoint
app.post('/api/emergency/sos', (req, res) => {
  const { action } = req.body; // 'trigger' or 'reset'
  const now = new Date().toISOString();

  if (action === 'reset') {
    helmetState.sensors.sosActive = false;
    helmetState.emergency.sosTriggered = false;
    addIncidentLog('EMERGENCY_SOS', 'SOS Emergency alert cleared / resolved.', 'info');
  } else {
    helmetState.sensors.sosActive = true;
    helmetState.emergency.sosTriggered = true;
    helmetState.emergency.sosTime = now;
    addIncidentLog(
      'EMERGENCY_SOS',
      `EMERGENCY SOS Triggered! Location: https://maps.google.com/?q=${helmetState.gps.latitude},${helmetState.gps.longitude}`,
      'danger',
      { lat: helmetState.gps.latitude, lng: helmetState.gps.longitude }
    );
  }

  io.emit('telemetry_update', helmetState);
  res.json({ success: true, helmetState });
});

// 3. Accident Impact & Fall Detection Endpoint (Trigger 15s countdown or confirm)
app.post('/api/emergency/accident', (req, res) => {
  const { gForce, tilt, confirmed } = req.body;
  const now = new Date().toISOString();

  if (confirmed) {
    helmetState.emergency.inAccidentCountdown = false;
    helmetState.emergency.accidentTriggered = true;
    helmetState.emergency.accidentTime = now;
    helmetState.emergency.accidentLocation = {
      lat: helmetState.gps.latitude,
      lng: helmetState.gps.longitude
    };
    addIncidentLog(
      'ACCIDENT_CRITICAL',
      `CRITICAL: Severe crash confirmed via MPU6050 (${gForce || helmetState.sensors.totalG}g, ${tilt || helmetState.sensors.tiltAngle}°). Emergency contacts alerted!`,
      'danger',
      { lat: helmetState.gps.latitude, lng: helmetState.gps.longitude, gForce, tilt }
    );
  } else {
    // Start 15s cancellation countdown
    helmetState.emergency.inAccidentCountdown = true;
    helmetState.emergency.countdownRemaining = 15;
    addIncidentLog(
      'ACCIDENT_WARNING',
      `MPU6050 Impact/Tilt Detected (${gForce || 4.2}g)! 15-second countdown started. Voice: "Accident detected. Press cancel button if you are safe."`,
      'warning',
      { gForce, tilt }
    );
  }

  io.emit('telemetry_update', helmetState);
  res.json({ success: true, helmetState });
});

// 4. Cancel Accident / False Alarm (Rider pressed push button within 15s window)
app.post('/api/emergency/cancel', (req, res) => {
  helmetState.emergency.inAccidentCountdown = false;
  helmetState.emergency.countdownRemaining = 0;
  helmetState.emergency.accidentTriggered = false;
  helmetState.sensors.impactDetected = false;

  addIncidentLog(
    'ACCIDENT_CANCELLED',
    'Accident alert cancelled by rider (Push button pressed within 15s window). False alarm avoided.',
    'success'
  );

  io.emit('telemetry_update', helmetState);
  res.json({ success: true, message: 'Accident alert cancelled', helmetState });
});

// 5. GPS Navigation & Route Setting Endpoint
app.post('/api/navigation/set-destination', (req, res) => {
  const { destinationName, destLat, destLng, distanceKm, etaMin } = req.body;

  helmetState.navigation.active = true;
  helmetState.navigation.destinationName = destinationName || 'Destination';
  helmetState.navigation.destLat = destLat || (helmetState.gps.latitude + 0.015);
  helmetState.navigation.destLng = destLng || (helmetState.gps.longitude + 0.015);
  helmetState.navigation.distanceRemainingKm = distanceKm || 3.2;
  helmetState.navigation.etaMinutes = etaMin || 8;
  helmetState.navigation.currentInstruction = `Navigate to ${helmetState.navigation.destinationName}`;
  helmetState.navigation.stepIndex = 0;

  addIncidentLog('NAVIGATION', `Navigation started to [${helmetState.navigation.destinationName}] (ETA: ${helmetState.navigation.etaMinutes} mins)`, 'info');

  io.emit('telemetry_update', helmetState);
  res.json({ success: true, navigation: helmetState.navigation });
});

// 6. Navigation Voice Guidance Step Trigger
app.post('/api/navigation/guidance', (req, res) => {
  const { command, instruction } = req.body;
  // Commands: 'NAV_TURN_LEFT', 'NAV_TURN_RIGHT', 'NAV_STRAIGHT', 'NAV_DESTINATION'
  const commandPayload = {
    id: Date.now(),
    command: command || 'NAV_STRAIGHT',
    text: instruction || 'Continue straight',
    timestamp: new Date().toISOString()
  };

  if (instruction) helmetState.navigation.currentInstruction = instruction;
  pendingCommands.push(commandPayload);

  addIncidentLog('VOICE_NAV', `Voice Guidance: "${instruction || command}"`, 'info');
  io.emit('helmet_command_dispatched', commandPayload);
  io.emit('telemetry_update', helmetState);

  res.json({ success: true, command: commandPayload });
});

// 7. Configure Overspeed Limit (e.g. 60 km/h)
app.post('/api/config/overspeed-limit', (req, res) => {
  const { limitKmH } = req.body;
  if (limitKmH && limitKmH > 10 && limitKmH < 200) {
    helmetState.sensors.overspeedLimitKmH = parseFloat(limitKmH);
    addIncidentLog('CONFIG', `Overspeed limit updated to ${helmetState.sensors.overspeedLimitKmH} km/h`, 'info');
    io.emit('telemetry_update', helmetState);
    return res.json({ success: true, limitKmH: helmetState.sensors.overspeedLimitKmH });
  }
  res.status(400).json({ error: 'Invalid speed limit' });
});

// 8. Remote Speaker Voice Command Endpoint
app.post('/api/helmet/command', (req, res) => {
  const { command, text, volume } = req.body;
  // Commands: 'VOICE_HELMET_REMINDER', 'VOICE_OVERSPEED', 'SIREN_ALARM', 'NAV_TURN_LEFT', 'NAV_TURN_RIGHT', 'NAV_STRAIGHT', 'NAV_DESTINATION'
  const commandPayload = {
    id: Date.now(),
    command: command || 'VOICE_HELMET_REMINDER',
    text: text || '',
    volume: volume || 100,
    timestamp: new Date().toISOString()
  };

  pendingCommands.push(commandPayload);
  addIncidentLog('VOICE_ASSIST', `Speaker voice prompt dispatched: [${commandPayload.command}] - "${commandPayload.text}"`, 'info');

  io.emit('helmet_command_dispatched', commandPayload);
  res.json({ success: true, command: commandPayload });
});

// 9. ESP32 Polling Endpoint
app.get('/api/helmet/poll-command', (req, res) => {
  const cmd = pendingCommands.shift() || null;
  res.json({ command: cmd });
});

// 10. Get Current Telemetry State
app.get('/api/telemetry/latest', (req, res) => {
  res.json(helmetState);
});

// 11. Get Trip History & Logs
app.get('/api/history', (req, res) => {
  res.json({
    trail: gpsTrail,
    logs: incidentLogs,
    stats: helmetState.stats,
    navigation: helmetState.navigation
  });
});

// 12. Clear Incident Logs
app.post('/api/history/clear', (req, res) => {
  incidentLogs = [{
    id: Date.now(),
    type: 'SYSTEM',
    message: 'System logs cleared by administrator.',
    timestamp: new Date().toISOString(),
    severity: 'info'
  }];
  res.json({ success: true, logs: incidentLogs });
});

// 13. Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    deviceId: helmetState.deviceId,
    helmetConnected: helmetState.online
  });
});

// Fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Socket.IO Real-Time Connection
io.on('connection', (socket) => {
  socket.emit('telemetry_update', helmetState);
  socket.emit('history_init', { trail: gpsTrail, logs: incidentLogs, stats: helmetState.stats, navigation: helmetState.navigation });

  // Handle client-side simulator events
  socket.on('simulate_telemetry', (simData) => {
    if (simData.gps) Object.assign(helmetState.gps, simData.gps);
    if (simData.sensors) Object.assign(helmetState.sensors, simData.sensors);
    if (simData.navigation) Object.assign(helmetState.navigation, simData.navigation);
    if (simData.emergency) Object.assign(helmetState.emergency, simData.emergency);
    if (simData.stats) Object.assign(helmetState.stats, simData.stats);
    helmetState.lastSeen = new Date().toISOString();

    if (simData.gps && simData.gps.latitude && simData.gps.longitude) {
      gpsTrail.push({
        lat: simData.gps.latitude,
        lng: simData.gps.longitude,
        speed: simData.gps.speedKmH || 0,
        time: helmetState.lastSeen
      });
      if (gpsTrail.length > MAX_TRAIL_POINTS) gpsTrail.shift();
    }

    io.emit('telemetry_update', helmetState);
  });

  socket.on('simulate_event', (eventData) => {
    addIncidentLog(eventData.type, eventData.message, eventData.severity, eventData.metadata);
  });
});

// Heartbeat check (marks offline if > 30s)
setInterval(() => {
  const lastSeenMs = new Date(helmetState.lastSeen).getTime();
  const nowMs = Date.now();
  if (nowMs - lastSeenMs > 30000 && helmetState.online) {
    helmetState.online = false;
    io.emit('telemetry_update', helmetState);
  }
}, 5000);

// Start Server & Neon Database Handshake
server.listen(PORT, async () => {
  console.log(`================================================================`);
  console.log(`🛡️  KAVACH SMART HELMET (IOE RIDER SAFETY GATEWAY) ON PORT ${PORT}`);
  console.log(`🌐  Web UI Dashboard: http://localhost:${PORT}`);
  console.log(`📡  ESP32 Telemetry POST: http://localhost:${PORT}/api/telemetry`);
  console.log(`================================================================`);

  await db.initDatabase();
});
