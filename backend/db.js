const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

let pool = null;
let isConnected = false;

if (connectionString) {
  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('connect', () => {
    isConnected = true;
  });

  pool.on('error', (err) => {
    console.error('❌ PostgreSQL Neon Pool Error:', err.message);
    isConnected = false;
  });
}

// Auto Initialize Tables in Neon PostgreSQL
async function initDatabase() {
  if (!pool) {
    console.warn('⚠️ No DATABASE_URL provided. Running in in-memory mode.');
    return false;
  }

  try {
    const client = await pool.connect();
    console.log('🐘 Connected to Neon Serverless PostgreSQL (Singapore ap-southeast-1)!');

    // 1. Telemetry Logs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS telemetry_logs (
        id BIGSERIAL PRIMARY KEY,
        device_id VARCHAR(50) DEFAULT 'HELMET-ESP32-01',
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        speed_kmh REAL DEFAULT 0,
        altitude_m REAL DEFAULT 0,
        satellites INT DEFAULT 0,
        gps_fix BOOLEAN DEFAULT true,
        heading REAL DEFAULT 0,
        helmet_worn BOOLEAN DEFAULT true,
        impact_force INT DEFAULT 0,
        battery_voltage REAL DEFAULT 4.12,
        battery_percent INT DEFAULT 90,
        is_charging BOOLEAN DEFAULT false,
        sos_active BOOLEAN DEFAULT false,
        recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Index for fast geospatial/time queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_recorded_at ON telemetry_logs (recorded_at DESC);
    `);

    // 2. Emergency & Accident Incidents Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS emergency_incidents (
        id BIGSERIAL PRIMARY KEY,
        device_id VARCHAR(50) DEFAULT 'HELMET-ESP32-01',
        incident_type VARCHAR(50) NOT NULL, -- 'EMERGENCY_SOS', 'ACCIDENT_CRITICAL', 'ACCIDENT_WARNING', 'HELMET_STATUS'
        message TEXT NOT NULL,
        severity VARCHAR(20) DEFAULT 'info', -- 'info', 'warning', 'danger', 'success'
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        speed_kmh REAL,
        impact_force INT,
        status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE', 'RESOLVED', 'CANCELLED'
        maps_url TEXT,
        recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_incidents_recorded_at ON emergency_incidents (recorded_at DESC);
    `);

    // 3. Rides / Trips Summary Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ride_trips (
        id BIGSERIAL PRIMARY KEY,
        device_id VARCHAR(50) DEFAULT 'HELMET-ESP32-01',
        start_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMPTZ,
        total_distance_km REAL DEFAULT 0,
        max_speed_kmh REAL DEFAULT 0,
        avg_speed_kmh REAL DEFAULT 0,
        incident_count INT DEFAULT 0
      );
    `);

    client.release();
    console.log('✅ PostgreSQL Schema & Tables verified and ready in Neon DB.');
    return true;
  } catch (err) {
    console.error('❌ Failed to initialize Neon PostgreSQL database tables:', err.message);
    return false;
  }
}

// Database Operations

// Insert Telemetry Point
async function insertTelemetry(t) {
  if (!pool) return null;
  try {
    const query = `
      INSERT INTO telemetry_logs (
        device_id, latitude, longitude, speed_kmh, altitude_m, satellites,
        gps_fix, heading, helmet_worn, impact_force, battery_voltage,
        battery_percent, is_charging, sos_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, recorded_at;
    `;
    const values = [
      t.deviceId || 'HELMET-ESP32-01',
      t.gps.latitude,
      t.gps.longitude,
      t.gps.speedKmH || 0,
      t.gps.altitudeMeters || 0,
      t.gps.satellites || 0,
      t.gps.fix !== undefined ? t.gps.fix : true,
      t.gps.heading || 0,
      t.sensors.helmetWorn !== undefined ? t.sensors.helmetWorn : true,
      t.sensors.impactForce || 0,
      t.sensors.batteryVoltage || 4.12,
      t.sensors.batteryPercent || 90,
      t.sensors.isCharging || false,
      t.sensors.sosActive || false
    ];
    const res = await pool.query(query, values);
    return res.rows[0];
  } catch (err) {
    console.error('DB Insert Telemetry Error:', err.message);
    return null;
  }
}

// Insert Emergency Incident Log
async function insertIncident(type, message, severity = 'info', metadata = null) {
  if (!pool) return null;
  try {
    const mapsUrl = metadata && metadata.lat && metadata.lng 
      ? `https://maps.google.com/?q=${metadata.lat},${metadata.lng}` 
      : null;

    const query = `
      INSERT INTO emergency_incidents (
        incident_type, message, severity, latitude, longitude, speed_kmh, impact_force, maps_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [
      type,
      message,
      severity,
      metadata ? metadata.lat || null : null,
      metadata ? metadata.lng || null : null,
      metadata ? metadata.speed || null : null,
      metadata ? metadata.force || null : null,
      mapsUrl
    ];
    const res = await pool.query(query, values);
    return res.rows[0];
  } catch (err) {
    console.error('DB Insert Incident Error:', err.message);
    return null;
  }
}

// Get recent GPS trail for map rendering
async function getRecentTrail(limit = 300) {
  if (!pool) return [];
  try {
    const res = await pool.query(`
      SELECT latitude AS lat, longitude AS lng, speed_kmh AS speed, recorded_at AS time
      FROM telemetry_logs
      WHERE latitude != 0 AND longitude != 0
      ORDER BY recorded_at DESC
      LIMIT $1;
    `, [limit]);
    return res.rows.reverse();
  } catch (err) {
    console.error('DB Fetch Trail Error:', err.message);
    return [];
  }
}

// Get recent incident logs
async function getRecentIncidents(limit = 50) {
  if (!pool) return [];
  try {
    const res = await pool.query(`
      SELECT id, incident_type AS type, message, severity, status, maps_url, recorded_at AS timestamp
      FROM emergency_incidents
      ORDER BY recorded_at DESC
      LIMIT $1;
    `, [limit]);
    return res.rows;
  } catch (err) {
    console.error('DB Fetch Incidents Error:', err.message);
    return [];
  }
}

// Resolve an Emergency Incident
async function resolveIncident(id) {
  if (!pool) return false;
  try {
    await pool.query(`
      UPDATE emergency_incidents 
      SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP 
      WHERE id = $1;
    `, [id]);
    return true;
  } catch (err) {
    console.error('DB Resolve Incident Error:', err.message);
    return false;
  }
}

module.exports = {
  pool,
  initDatabase,
  insertTelemetry,
  insertIncident,
  getRecentTrail,
  getRecentIncidents,
  resolveIncident
};
