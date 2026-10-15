/**
 * ==============================================================================
 * 🛡️ KAVACH SMART HELMET - ESP32 FIRMWARE
 * Project: IoE-Based Smart Helmet with Navigation, Speed Monitoring & Accident Detection
 * ==============================================================================
 * Hardware Pin Mapping:
 *  - NEO-M8N GPS       : RX2 (GPIO 16), TX2 (GPIO 17)
 *  - MPU6050 IMU       : SDA (GPIO 21), SCL (GPIO 22) - I2C
 *  - IR Wear Sensor    : GPIO 18 (Digital In, LOW = Worn)  [see config.h]
 *  - Push Button       : GPIO 4  (Digital In, LOW = Pressed) [see config.h]
 *  - Touch Sensor      : GPIO 19 (TTP223 Capacitive Touch)
 *  - MAX98357A I2S Amp : BCLK (GPIO 26), LRC (GPIO 25), DIN (GPIO 27)
 *  - Battery Voltage   : GPIO 36 (ADC1_CH0 VP with 100k/100k divider)
 *  - TP4056 CHRG Sense : GPIO 23 (Digital In)
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <math.h>
#include "BluetoothSerial.h"
#include "driver/i2s.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include "config.h"
#include "voice_helmet.h"   // spoken prompts (text-to-speech clips) stored in flash

// Bluetooth Serial instance for direct mobile phone connectivity
BluetoothSerial SerialBT;
bool bluetoothConnected = false;
unsigned long lastBtSentMs = 0;

// Hardware Serial instance for GPS (NEO-M8N / NEO-6M)
HardwareSerial gpsSerial(2);
TinyGPSPlus gps;

// I2S Configuration for MAX98357A Amplifier
#define I2S_PORT_NUM I2S_NUM_0

// MPU6050 I2C Address (supports 0x68 when AD0=GND, or 0x69 when AD0=VCC/floating)
#define MPU6050_ADDR_PRIMARY   0x68
#define MPU6050_ADDR_SECONDARY 0x69
uint8_t mpuI2cAddress = MPU6050_ADDR_PRIMARY;
bool mpuSensorPresent = false;

// Global System State
struct SystemState {
  // GPS Telemetry
  double latitude;
  double longitude;
  float speedKmH;
  float maxSpeedKmH;
  float avgSpeedKmH;
  float totalDistanceKm;
  float altitudeMeters;
  int satellites;
  bool gpsValid;

  // Helmet & MPU6050 IMU
  bool helmetWorn;
  float accelX;
  float accelY;
  float accelZ;
  float totalG;
  float tiltAngle;
  bool impactDetected;
  bool overspeedAlertActive;
  bool sosActive;

  // Battery & Power
  float batteryVoltage;
  int batteryPercent;
  bool isCharging;

  // 15-Second Accident Cancellation Pipeline
  bool inAccidentCountdown;
  unsigned long countdownStartTime;
  bool accidentConfirmed;
} helmetState;

// Button Timing State
unsigned long buttonPressStartTime = 0;
bool buttonIsPressed = false;
bool longPressTriggered = false;

// Timers & History Tracking
unsigned long lastTelemetrySentMs = 0;
unsigned long lastSpeedCheckMs = 0;
unsigned long lastWearAlertMs = 0;
unsigned long lastOverspeedAlertMs = 0;
unsigned long lastDiagMs = 0;
unsigned long lastWifiRetryMs = 0;
unsigned long lastAccidentCancelMs = 0;
int lastHttpCode = 0;
bool wearCandidate = false;
unsigned long wearCandidateSince = 0;
double prevLat = 0.0;
double prevLng = 0.0;
unsigned long totalSpeedSamples = 0;
float speedSum = 0.0;

// Function Prototypes
void setupHardware();
void scanI2CBus();
void initMPU6050();
void initI2SAudio();
void connectWiFi();
void readGpsData();
void printDiagnostics();
void readSensors();
void readMPU6050();
void handleButtonPress();
void handleAccidentCountdown();
void checkSpeedMonitoring();
void sendCloudTelemetry();
void sendEmergencyAlert(const char* endpoint, const char* alertType);
void playTonePrompt(int frequency, int durationMs, float amplitude = 0.5f);
void playClip(const int16_t* data, uint32_t n, float gain = 1.0f);
#define SAY(name) playClip(clip_##name, clip_##name##_len)
void playHelmetWornChime();
void playHelmetNotWornWarning();
void playOverspeedWarning();
void playWarningSiren();
void playCountdownTick(int secondsRemaining);
void playNavPrompt(const char* navType);
float readBatteryVoltage();
double calculateDistanceKm(double lat1, double lon1, double lat2, double lon2);
void sendBluetoothTelemetry();
void handleBluetoothIncoming();

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=======================================================");
  Serial.println("🛡️ KAVACH SMART HELMET (IOE RIDER SAFETY SYSTEM) BOOTING");
  Serial.println("=======================================================");

  setupHardware();
  initMPU6050();
  initI2SAudio();

  // Startup chime: loud crisp musical tones so rider knows speaker is 100% active immediately!
  playTonePrompt(600, 120, 0.9f);
  delay(40);
  playTonePrompt(1000, 180, 0.9f);

  // Initialize Bluetooth Serial for direct phone pairing (KAVACH_HELMET_01)
  SerialBT.begin(BT_DEVICE_NAME);
  Serial.printf("📶 Bluetooth Serial active: device name '%s'\n", BT_DEVICE_NAME);

  connectWiFi();

  // Startup greeting over MAX98357A I2S (real voice)
  SAY(v_ready);

  Serial.println("✅ Kavach Smart Helmet Initialized & Ready.");
}

void loop() {
  // 1. Ingest GPS NMEA Sentences continuously
  readGpsData();

  // 2. Sample IR Wear, MPU6050 Accelerometer/Gyro, and Battery
  readSensors();

  // 3. Handle Push Button (SOS & 15s Cancellation)
  handleButtonPress();

  // 4. Handle 15-Second Accident Countdown Window
  handleAccidentCountdown();

  // 5. Speed Monitoring & Overspeed Checks (60 km/h)
  checkSpeedMonitoring();

  // 5b. Print a one-line health report every 2s (open Serial Monitor @115200)
  if (millis() - lastDiagMs >= 2000) {
    lastDiagMs = millis();
    printDiagnostics();
  }

  // 5c. Stream Bluetooth Telemetry to Phone & Process Incoming Commands
  handleBluetoothIncoming();
  if (millis() - lastBtSentMs >= 500) {
    lastBtSentMs = millis();
    sendBluetoothTelemetry();
  }

  // 6. Send Periodic Telemetry to Cloud (every 2 seconds if WiFi connected)
  if (millis() - lastTelemetrySentMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetrySentMs = millis();
    sendCloudTelemetry();
  }
}

// ==============================================================================
// 🛠️ HARDWARE SETUP & INITIALIZATION
// ==============================================================================
void setupHardware() {
  // Configure Pins
  pinMode(IR_SENSOR_PIN, INPUT_PULLUP);
  #ifdef PUSH_BUTTON_PIN
  pinMode(PUSH_BUTTON_PIN, INPUT_PULLUP);
  #endif
  pinMode(TOUCH_SENSOR_PIN, INPUT_PULLDOWN); // Firm internal pull-down prevents floating pin
  pinMode(TP4056_CHRG_PIN, INPUT_PULLUP);

  // Initialize I2C Bus for MPU6050 (100kHz standard speed for breadboard/jumper-wire stability)
  Wire.begin(MPU_SDA_PIN, MPU_SCL_PIN, 100000);
  Wire.setTimeOut(25); // 25ms timeout prevents 2-minute scan hangs if bus lines are floating/stuck

  // Initialize GPS Hardware Serial (UART2 for NEO-M8N / NEO-6M)
  gpsSerial.setRxBufferSize(4096); // 4KB buffer avoids dropping NMEA packets during audio playback
  gpsSerial.begin(GPS_BAUD_RATE, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("📍 NEO-M8N GPS HardwareSerial2 initialized on GPIO 16 (RX) / 17 (TX).");

  // Initial State Defaults (Dombivli / Kalyan, Maharashtra, India)
  helmetState.latitude = 19.2184;
  helmetState.longitude = 73.0867;
  helmetState.speedKmH = 0.0;
  helmetState.maxSpeedKmH = 0.0;
  helmetState.avgSpeedKmH = 0.0;
  helmetState.totalDistanceKm = 0.0;
  helmetState.altitudeMeters = 15.0;
  helmetState.satellites = 0;
  helmetState.gpsValid = false;
  helmetState.helmetWorn = false;
  helmetState.accelX = 0;
  helmetState.accelY = 0;
  helmetState.accelZ = 1.0;
  helmetState.totalG = 1.0;
  helmetState.tiltAngle = 0.0;
  helmetState.impactDetected = false;
  helmetState.overspeedAlertActive = false;
  helmetState.sosActive = false;
  helmetState.inAccidentCountdown = false;
  helmetState.accidentConfirmed = false;
}

// Diagnostic I2C scanner to check all connected devices
void scanI2CBus() {
  Serial.printf("🔍 Scanning I2C bus (SDA: GPIO %d, SCL: GPIO %d)...\n", MPU_SDA_PIN, MPU_SCL_PIN);
  int devicesFound = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    byte err = Wire.endTransmission();
    if (err == 0) {
      Serial.printf("   📍 I2C device detected at 0x%02X%s\n",
                    addr,
                    (addr == 0x68) ? " (MPU6050 default, AD0=GND)" :
                    (addr == 0x69) ? " (MPU6050 alternate, AD0=HIGH/floating)" : "");
      devicesFound++;
    }
  }
  if (devicesFound == 0) {
    Serial.println("   ❌ No I2C devices responded on the bus.");
    Serial.println("      Wiring Checklist:");
    Serial.println("       1. VCC -> ESP32 3.3V or 5V (Check if red LED on MPU6050 is ON)");
    Serial.println("       2. GND -> ESP32 GND");
    Serial.println("       3. SDA -> ESP32 GPIO 21");
    Serial.println("       4. SCL -> ESP32 GPIO 22");
    Serial.println("       5. AD0 -> Connect to GND (locks address firmly to 0x68)");
  }
}

// Initialize MPU6050 Accelerometer/Gyroscope (Auto-detects 0x68 or 0x69)
void initMPU6050() {
  static int initAttempts = 0;
  initAttempts++;

  // Reset Wire bus to clear any bus freeze or clock-stretching lockup
  Wire.begin(MPU_SDA_PIN, MPU_SCL_PIN, 100000);
  Wire.setTimeOut(25);
  delay(10);

  const uint8_t candidateAddrs[] = {0x68, 0x69};
  byte lastError = 5;

  for (int i = 0; i < 2; i++) {
    uint8_t addr = candidateAddrs[i];
    Wire.beginTransmission(addr);
    Wire.write(0x6B); // PWR_MGMT_1 register
    Wire.write(0x00); // Wake up MPU6050
    byte error = Wire.endTransmission(true);

    if (error == 0) {
      mpuI2cAddress = addr;
      mpuSensorPresent = true;
      Serial.printf("🎮 MPU6050 6-DOF IMU Connected! (Detected at I2C address 0x%02X)\n", addr);
      return;
    }
    lastError = error;
  }

  mpuSensorPresent = false;
  Serial.printf("⚠️ MPU6050 not detected on I2C (Code: %d). (Tried 0x68 & 0x69 | SDA: GPIO %d, SCL: GPIO %d).\n",
                lastError, MPU_SDA_PIN, MPU_SCL_PIN);

  // Run full I2C scan on the 1st boot attempt and every 6th retry (every ~30s)
  if (initAttempts == 1 || (initAttempts % 6 == 0)) {
    scanI2CBus();
  }
}

// ==============================================================================
// 📶 WI-FI CONNECTION
// ==============================================================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  // After boot, never block the main loop for 10s: just kick a reconnect every 10s
  static bool firstTry = true;
  if (!firstTry) {
    if (millis() - lastWifiRetryMs > 10000) {
      lastWifiRetryMs = millis();
      Serial.println("Wi-Fi lost - reconnecting...");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    return;
  }
  firstTry = false;

  Serial.printf("Connecting to Wi-Fi SSID: %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n🌐 Wi-Fi Connected Successfully!");
    Serial.print("📡 Assigned IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n⚠️ Wi-Fi connection timed out. Telemetry will retry in background.");
  }
}

// ==============================================================================
// 📍 GPS DATA PROCESSING (NEO-M8N / NEO-6M)
// ==============================================================================
void readGpsData() {
  while (gpsSerial.available() > 0) {
    char c = gpsSerial.read();
    gps.encode(c);
  }

  // Satellite count is reported even before a fix, so the dashboard shows the GPS is alive
  if (gps.satellites.isValid()) {
    helmetState.satellites = gps.satellites.value();
  }

  if (gps.location.isValid() && gps.location.age() < 3000) {
    double currentLat = gps.location.lat();
    double currentLng = gps.location.lng();

    // Distance calculation
    if (helmetState.gpsValid && prevLat != 0.0 && prevLng != 0.0) {
      double deltaKm = calculateDistanceKm(prevLat, prevLng, currentLat, currentLng);
      if (deltaKm > 0.002 && deltaKm < 0.5) { // Filter jitter (<2m) & teleports
        helmetState.totalDistanceKm += deltaKm;
      }
    }

    prevLat = currentLat;
    prevLng = currentLng;
    helmetState.latitude = currentLat;
    helmetState.longitude = currentLng;
    helmetState.gpsValid = true;
    helmetState.satellites = gps.satellites.value();

    if (gps.speed.isValid()) {
      helmetState.speedKmH = gps.speed.kmph();
    }
    if (gps.altitude.isValid()) {
      helmetState.altitudeMeters = gps.altitude.meters();
    }
  } else {
    helmetState.gpsValid = false;
  }
}

// ==============================================================================
// 🔬 SENSOR SAMPLING (IR WEAR, MPU6050 ACCEL/TILT, BATTERY)
// ==============================================================================
void readSensors() {
  // 1. Dual Helmet Wear Detection (IR Sensor on GPIO 18 + TTP223 Touch on GPIO 19)
  bool irDetected = (digitalRead(IR_SENSOR_PIN) == IR_ACTIVE_LEVEL);
  bool touchDetected = TOUCH_SENSOR_INSTALLED && (digitalRead(TOUCH_SENSOR_PIN) == HIGH);

  #if REQUIRE_BOTH_WEAR_SENSORS
  bool currentWearState = (irDetected && touchDetected);
  #else
  bool currentWearState = (irDetected || touchDetected); // EITHER sensor confirms helmet is worn
  #endif

  // Debounce: new state must stay stable for 300 ms before it is accepted
  if (currentWearState != wearCandidate) {
    wearCandidate = currentWearState;
    wearCandidateSince = millis();
  }
  bool wearStable = (millis() - wearCandidateSince) >= 300;

  if (wearStable && wearCandidate != helmetState.helmetWorn) {
    helmetState.helmetWorn = wearCandidate;
    if (helmetState.helmetWorn) {
      Serial.printf("🟢 Helmet Put On (IR: %s | Touch: %s) -> Worn & Secured.\n", 
                    irDetected ? "DETECTED" : "OFF", touchDetected ? "DETECTED" : "OFF");
      playHelmetWornChime();
    } else {
      Serial.println("🔴 Helmet Removed (IR & Touch both clear)! Voice prompt: Please wear your helmet.");
      playHelmetNotWornWarning();
    }
  }

  // Periodic reminder if riding without helmet
  if (!helmetState.helmetWorn && helmetState.speedKmH > 5.0 && (millis() - lastWearAlertMs > 10000)) {
    lastWearAlertMs = millis();
    playHelmetNotWornWarning();
  }

  // 2. MPU6050 Crash & Tilt Detection
  readMPU6050();

  // 3. Battery Voltage & Charging Status
  helmetState.batteryVoltage = readBatteryVoltage();
  helmetState.isCharging = (digitalRead(TP4056_CHRG_PIN) == LOW);
  
  // Calculate battery percentage (3.3V to 4.2V scale)
  float pct = ((helmetState.batteryVoltage - 3.3) / (4.2 - 3.3)) * 100.0;
  helmetState.batteryPercent = constrain((int)pct, 0, 100);
}

// Read MPU6050 Accelerometer & Gyroscope
void readMPU6050() {
  static unsigned long lastMpuCheck = 0;
  if (!mpuSensorPresent) {
    if (millis() - lastMpuCheck > 5000) {
      lastMpuCheck = millis();
      initMPU6050();
    }
    return;
  }

  Wire.beginTransmission(mpuI2cAddress);
  Wire.write(0x3B); // Starting register for Accel data
  byte err = Wire.endTransmission(false);
  if (err != 0) {
    mpuSensorPresent = false;
    return;
  }

  Wire.requestFrom((uint8_t)mpuI2cAddress, (size_t)6, true);
  if (Wire.available() >= 6) {
    int16_t rawAx = (Wire.read() << 8) | Wire.read();
    int16_t rawAy = (Wire.read() << 8) | Wire.read();
    int16_t rawAz = (Wire.read() << 8) | Wire.read();

    // Convert raw to Gs (at default ±2g sensitivity: 16384 LSB/g)
    helmetState.accelX = rawAx / 16384.0f;
    helmetState.accelY = rawAy / 16384.0f;
    helmetState.accelZ = rawAz / 16384.0f;

    // Total resultant acceleration in Gs
    helmetState.totalG = sqrt(helmetState.accelX * helmetState.accelX +
                              helmetState.accelY * helmetState.accelY +
                              helmetState.accelZ * helmetState.accelZ);

    // Calculate Tilt Angle from gravity vector
    float pitch = atan2(helmetState.accelY, sqrt(helmetState.accelX * helmetState.accelX + helmetState.accelZ * helmetState.accelZ)) * 180.0f / PI;
    float roll  = atan2(-helmetState.accelX, helmetState.accelZ) * 180.0f / PI;
    helmetState.tiltAngle = max(abs(pitch), abs(roll));

    // Check for Crash Impact (> 3.5G) or Severe Fall / Slide (> 60 degrees tilt)
    // CRITICAL SAFETY RULE: An accident can ONLY occur if the helmet is actually WORN by the rider!
    // If the helmet is sitting on a desk, tilted on its side, or not worn, tilt is normal and MUST NOT trigger false alarms!
    bool highImpact = (helmetState.totalG >= MPU_IMPACT_THRESHOLD_G);
    bool abnormalTilt = (helmetState.tiltAngle >= MPU_FALL_TILT_DEG);
    // Dynamic fall: Tilt alone is NOT a crash if the helmet is resting statically (1.0G, 0 speed)
    bool isDynamicFall = abnormalTilt && (helmetState.speedKmH >= 3.0f || helmetState.totalG >= 2.0f || helmetState.totalG <= 0.4f);

    // If helmet is not worn, immediately clear any accident state
    if (!helmetState.helmetWorn) {
      helmetState.inAccidentCountdown = false;
      helmetState.impactDetected = false;
    } else {
      bool canTriggerAccident = (millis() - lastAccidentCancelMs > 15000) &&
                                !helmetState.inAccidentCountdown && 
                                !helmetState.accidentConfirmed;

      if (canTriggerAccident && (highImpact || isDynamicFall)) {
        Serial.printf("💥 ACCIDENT DETECTED! G-Force: %.2fG, Tilt: %.1f deg. Starting 15s Countdown...\n", helmetState.totalG, helmetState.tiltAngle);
        helmetState.inAccidentCountdown = true;
        helmetState.countdownStartTime = millis();
        helmetState.impactDetected = true;
        SAY(v_accident);
      }
    }
  }
}

// ==============================================================================
// 🏃 SPEED MONITORING & OVERSPEED DETECTION (60 km/h)
// ==============================================================================
void checkSpeedMonitoring() {
  if (helmetState.speedKmH > helmetState.maxSpeedKmH) {
    helmetState.maxSpeedKmH = helmetState.speedKmH;
  }

  // Update Average Speed
  if (helmetState.speedKmH > 2.0) {
    totalSpeedSamples++;
    speedSum += helmetState.speedKmH;
    helmetState.avgSpeedKmH = speedSum / totalSpeedSamples;
  }

  // Overspeed Detection (Configurable Limit: 60 km/h)
  if (helmetState.speedKmH >= OVERSPEED_THRESHOLD_KMH) {
    helmetState.overspeedAlertActive = true;
    if (millis() - lastOverspeedAlertMs > 8000) { // Play alert every 8s while overspeeding
      lastOverspeedAlertMs = millis();
      Serial.printf("⚠️ OVERSPEED DETECTED: %.1f km/h (Limit: %.1f km/h). Voice: Please reduce your speed.\n",
                    helmetState.speedKmH, OVERSPEED_THRESHOLD_KMH);
      playOverspeedWarning();
    }
  } else {
    helmetState.overspeedAlertActive = false;
  }
}

// ==============================================================================
// 🔘 PUSH BUTTON HANDLER (Optional SOS / Cancel Button if installed)
// ==============================================================================
void handleButtonPress() {
  // If no separate button is wired, skip button polling
  #if defined(PUSH_BUTTON_PIN) && (PUSH_BUTTON_PIN != HELMET_WEAR_PIN)
  int buttonState = digitalRead(PUSH_BUTTON_PIN);
  bool isPressed = (buttonState == LOW);

  if (isPressed) {
    if (!buttonIsPressed) {
      buttonIsPressed = true;
      buttonPressStartTime = millis();
      longPressTriggered = false;
    } else {
      if (!longPressTriggered && (millis() - buttonPressStartTime >= SOS_LONG_PRESS_MS)) {
        longPressTriggered = true;
        helmetState.sosActive = true;
        Serial.println("🚨 SOS TRIGGERED! Dispatching Emergency Broadcast...");
        playWarningSiren();
        sendEmergencyAlert(SOS_ENDPOINT, "EMERGENCY_SOS");
      }
    }
  } else {
    if (buttonIsPressed) {
      unsigned long duration = millis() - buttonPressStartTime;
      buttonIsPressed = false;
      if (!longPressTriggered && duration > 50 && helmetState.inAccidentCountdown) {
        Serial.println("✅ False Alarm Cancelled by Rider!");
        lastAccidentCancelMs = millis();
        helmetState.inAccidentCountdown = false;
        helmetState.impactDetected = false;
        SAY(v_cancel);
        sendEmergencyAlert(CANCEL_ENDPOINT, "CANCEL_ACCIDENT");
      }
    }
  }
  #endif
}

// ==============================================================================
// ⏱️ ACCIDENT 15-SECOND COUNTDOWN ENGINE
// ==============================================================================
void handleAccidentCountdown() {
  if (!helmetState.inAccidentCountdown) return;

  unsigned long elapsedMs = millis() - helmetState.countdownStartTime;
  int remainingSec = ACCIDENT_COUNTDOWN_SEC - (elapsedMs / 1000);

  // Audible countdown ticking on MAX98357A speaker
  static int lastSecTicked = -1;
  if (remainingSec != lastSecTicked && remainingSec >= 0) {
    lastSecTicked = remainingSec;
    Serial.printf("⏳ Accident Countdown: %d seconds remaining to cancel (Press Button)...\n", remainingSec);
    playCountdownTick(remainingSec);
  }

  // If countdown expires without rider cancelling -> CONFIRM ACCIDENT!
  if (elapsedMs >= (ACCIDENT_COUNTDOWN_SEC * 1000)) {
    helmetState.inAccidentCountdown = false;
    helmetState.accidentConfirmed = true;
    Serial.println("💥 ACCIDENT CONFIRMED! Alerting cloud & emergency medical contacts!");
    playWarningSiren();
    sendEmergencyAlert(TELEMETRY_ENDPOINT, "ACCIDENT_CONFIRMED");
  }
}


// ==============================================================================
// ☁️ CLOUD HTTP TELEMETRY TRANSMISSION
// ==============================================================================
void sendCloudTelemetry() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    return;
  }

  HTTPClient http;
  String url = String(CLOUD_SERVER_URL) + TELEMETRY_ENDPOINT;
  http.setTimeout(2000); // do not freeze the loop (and overflow GPS buffer) if server is unreachable
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Build JSON Payload
  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  doc["latitude"] = helmetState.latitude;
  doc["longitude"] = helmetState.longitude;
  doc["speed"] = helmetState.speedKmH;
  doc["maxSpeed"] = helmetState.maxSpeedKmH;
  doc["avgSpeed"] = helmetState.avgSpeedKmH;
  doc["totalDistance"] = helmetState.totalDistanceKm;
  doc["altitude"] = helmetState.altitudeMeters;
  doc["satellites"] = helmetState.satellites;
  doc["fix"] = helmetState.gpsValid;
  doc["helmetWorn"] = helmetState.helmetWorn;
  doc["totalG"] = helmetState.totalG;
  doc["tiltAngle"] = helmetState.tiltAngle;
  doc["overspeedAlert"] = helmetState.overspeedAlertActive;
  doc["batteryVoltage"] = helmetState.batteryVoltage;
  doc["batteryPercent"] = helmetState.batteryPercent;
  doc["isCharging"] = helmetState.isCharging;
  doc["sosActive"] = helmetState.sosActive;
  doc["inAccidentCountdown"] = helmetState.inAccidentCountdown;
  doc["accidentConfirmed"] = helmetState.accidentConfirmed;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  int httpResponseCode = http.POST(jsonPayload);
  lastHttpCode = httpResponseCode;

  if (httpResponseCode > 0) {
    String response = http.getString();
    
    // Parse response for queued commands from Cloud / Mobile Navigation
    JsonDocument respDoc;
    DeserializationError error = deserializeJson(respDoc, response);
    if (!error && respDoc["commands"].is<JsonArray>()) {
      JsonArray commands = respDoc["commands"];
      for (JsonObject cmd : commands) {
        const char* commandName = cmd["command"];
        Serial.printf("📥 Cloud Audio Command Received: %s\n", commandName);
        if (strcmp(commandName, "VOICE_HELMET_REMINDER") == 0) {
          playHelmetNotWornWarning();
        } else if (strcmp(commandName, "VOICE_OVERSPEED") == 0) {
          playOverspeedWarning();
        } else if (strcmp(commandName, "SIREN_ALARM") == 0) {
          playWarningSiren();
        } else if (strncmp(commandName, "NAV_", 4) == 0) {
          playNavPrompt(commandName);
        }
      }
    }
  }

  http.end();
}

void sendEmergencyAlert(const char* endpoint, const char* alertType) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String(CLOUD_SERVER_URL) + endpoint;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  doc["type"] = alertType;
  doc["latitude"] = helmetState.latitude;
  doc["longitude"] = helmetState.longitude;
  doc["speed"] = helmetState.speedKmH;
  doc["totalG"] = helmetState.totalG;
  doc["tiltAngle"] = helmetState.tiltAngle;

  String payload;
  serializeJson(doc, payload);
  http.POST(payload);
  http.end();
}

// ==============================================================================
// 📶 BLUETOOTH SERIAL TELEMETRY ENGINE (Direct Mobile App Connection)
// ==============================================================================
void sendBluetoothTelemetry() {
  if (!SerialBT.hasClient()) {
    bluetoothConnected = false;
    return;
  }
  bluetoothConnected = true;

  // Build compact JSON packet for Android App
  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  doc["worn"] = helmetState.helmetWorn;
  doc["totalG"] = round(helmetState.totalG * 100.0) / 100.0;
  doc["tilt"] = round(helmetState.tiltAngle * 10.0) / 10.0;
  doc["accelX"] = round(helmetState.accelX * 100.0) / 100.0;
  doc["accelY"] = round(helmetState.accelY * 100.0) / 100.0;
  doc["accelZ"] = round(helmetState.accelZ * 100.0) / 100.0;
  doc["battery"] = helmetState.batteryPercent;
  doc["voltage"] = round(helmetState.batteryVoltage * 100.0) / 100.0;
  doc["charging"] = helmetState.isCharging;
  doc["impact"] = helmetState.impactDetected;
  doc["sos"] = helmetState.sosActive;
  doc["countdown"] = helmetState.inAccidentCountdown;

  // 1/0 Hardware Component Connection Status for Mobile Diagnostics Popup
  doc["espOk"] = 1;                                                            // ESP32 active
  doc["ampOk"] = 1;                                                            // MAX98357A I2S driver active
  doc["mpuOk"] = mpuSensorPresent ? 1 : 0;                                     // MPU6050 6-DOF IMU
  doc["gpsOk"] = (gps.charsProcessed() > 5) ? 1 : 0;                           // NEO-M8N GPS NMEA stream
  doc["irRaw"] = (digitalRead(IR_SENSOR_PIN) == IR_ACTIVE_LEVEL) ? 1 : 0;      // IR Wear Sensor
  doc["touchRaw"] = (digitalRead(TOUCH_SENSOR_PIN) == HIGH) ? 1 : 0;           // TTP223 Touch Sensor
  doc["touchInst"] = TOUCH_SENSOR_INSTALLED ? 1 : 0;

  String jsonPayload;
  serializeJson(doc, jsonPayload);
  SerialBT.println(jsonPayload);
}

void handleBluetoothIncoming() {
  while (SerialBT.available()) {
    String line = SerialBT.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      Serial.printf("📲 Bluetooth Command from App: %s\n", line.c_str());
      JsonDocument doc;
      if (deserializeJson(doc, line) == DeserializationError::Ok) {
        if (doc["cancelAccident"] == true && helmetState.inAccidentCountdown) {
          Serial.println("✅ False Alarm Cancelled via Bluetooth Phone App!");
          lastAccidentCancelMs = millis();
          helmetState.inAccidentCountdown = false;
          helmetState.impactDetected = false;
          SAY(v_cancel);
        } else if (doc["playWarning"] == true || (doc["command"].is<const char*>() && strcmp(doc["command"], "TEST_BEEP") == 0)) {
          Serial.println("🔊 Playing Test Beep Sequence via Bluetooth command...");
          playTonePrompt(1000, 200, 0.95f);
          delay(80);
          playTonePrompt(1200, 250, 0.95f);
        } else if (doc["command"].is<const char*>()) {
          const char* cmd = doc["command"];
          if (strcmp(cmd, "VOICE_HELMET_REMINDER") == 0) playHelmetNotWornWarning();
          else if (strcmp(cmd, "VOICE_OVERSPEED") == 0) playOverspeedWarning();
          else if (strcmp(cmd, "SIREN_ALARM") == 0) playWarningSiren();
          else if (strncmp(cmd, "NAV_", 4) == 0) playNavPrompt(cmd);
        }
      }
    }
  }
}

// ==============================================================================
// 🔊 MAX98357A I2S DIGITAL AUDIO DRIVERS & VOICE ASSISTANCE
// ==============================================================================
void initI2SAudio() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = 16000,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 64,
    .use_apll = false,
    .tx_desc_auto_clear = true
  };

  i2s_pin_config_t pin_config = {
    .mck_io_num = I2S_PIN_NO_CHANGE,
    .bck_io_num = I2S_BCLK_PIN,
    .ws_io_num = I2S_LRC_PIN,
    .data_out_num = I2S_DIN_PIN,
    .data_in_num = I2S_PIN_NO_CHANGE
  };

  esp_err_t err = i2s_driver_install(I2S_PORT_NUM, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("❌ I2S driver install failed: %d\n", err);
    return;
  }
  i2s_set_pin(I2S_PORT_NUM, &pin_config);
  i2s_zero_dma_buffer(I2S_PORT_NUM);
  Serial.println("🔊 MAX98357A I2S Audio Driver active on GPIO 26 (BCLK), 25 (LRC), 27 (DIN).");
}

void playTonePrompt(int frequency, int durationMs, float amplitude) {
  if (frequency <= 0) {
    delay(durationMs);
    return;
  }
  const int sampleRate = 16000;
  const int totalSamples = (sampleRate * durationMs) / 1000;
  int16_t sampleBuffer[128]; // Stereo buffer (L + R interleaved)
  size_t bytesWritten;

  float step = (2.0f * 3.1415926535f * frequency) / sampleRate;
  float phase = 0.0f;
  int samplesGenerated = 0;

  while (samplesGenerated < totalSamples) {
    int chunk = min(64, totalSamples - samplesGenerated);
    for (int i = 0; i < chunk; i++) {
      int16_t sample = (int16_t)(sin(phase) * (32767.0f * amplitude));
      sampleBuffer[i * 2]     = sample; // Left channel
      sampleBuffer[i * 2 + 1] = sample; // Right channel
      phase += step;
      if (phase >= (2.0f * 3.1415926535f)) phase -= (2.0f * 3.1415926535f);
    }
    i2s_write(I2S_PORT_NUM, sampleBuffer, chunk * 4, &bytesWritten, portMAX_DELAY);
    samplesGenerated += chunk;
  }
}

// Play a stored speech clip (16 kHz, 16-bit mono) through the MAX98357A
void playClip(const int16_t* data, uint32_t n, float gain) {
  int16_t buf[128];
  size_t written;
  uint32_t i = 0;
  while (i < n) {
    int chunk = (n - i) < 64 ? (int)(n - i) : 64;
    for (int k = 0; k < chunk; k++) {
      int32_t v = (int32_t)(data[i + k] * gain);
      if (v > 32767) v = 32767;
      if (v < -32768) v = -32768;
      buf[2 * k] = (int16_t)v;
      buf[2 * k + 1] = (int16_t)v;
    }
    i2s_write(I2S_PORT_NUM, buf, chunk * 4, &written, portMAX_DELAY);
    i += chunk;
  }
  // 150 ms of silence so the end of the last word is not cut off
  memset(buf, 0, sizeof(buf));
  for (int k = 0; k < 38; k++) i2s_write(I2S_PORT_NUM, buf, 256, &written, portMAX_DELAY);
}

// 1. Helmet Worn Confirmation ("Helmet detected. Ride safe.")
void playHelmetWornChime() {
  SAY(v_worn);
}

// 2. Helmet Not Worn Voice Warning ("Please wear your helmet.")
void playHelmetNotWornWarning() {
  SAY(v_wear);
}

// 3. Overspeed Warning ("Please reduce your speed.")
void playOverspeedWarning() {
  SAY(v_speed);
}

// 4. 15-Second Accident Countdown Ticking
void playCountdownTick(int secondsRemaining) {
  int freq = 600 + (15 - secondsRemaining) * 50;
  playTonePrompt(freq, 90, 0.6f);
}

// 5. Emergency Siren Alarms
void playWarningSiren() {
  for (int i = 0; i < 3; i++) {
    playTonePrompt(960, 180, 0.7f);
    delay(40);
    playTonePrompt(770, 180, 0.7f);
    delay(40);
  }
}

// 6. Navigation Turn-By-Turn Voice Prompts
void playNavPrompt(const char* navType) {
  if (strcmp(navType, "NAV_TURN_LEFT") == 0) {
    SAY(v_left);
  } else if (strcmp(navType, "NAV_TURN_RIGHT") == 0) {
    SAY(v_right);
  } else if (strcmp(navType, "NAV_STRAIGHT") == 0) {
    SAY(v_straight);
  } else if (strcmp(navType, "NAV_DESTINATION") == 0) {
    SAY(v_dest);
  }
}

// ==============================================================================
// 🔋 BATTERY VOLTAGE ADC SENSING (TP4056 + 18650)
// ==============================================================================
float readBatteryVoltage() {
  int rawAdc = analogRead(BATTERY_ADC_PIN);
  float pinVoltage = (rawAdc / 4095.0f) * 3.3f;
  float batteryVoltage = pinVoltage * 2.0f * 1.05f; // 2x divider with calibration
  return constrain(batteryVoltage, 3.0f, 4.25f);
}

// Haversine formula to compute distance in KM between 2 GPS coordinates
double calculateDistanceKm(double lat1, double lon1, double lat2, double lon2) {
  double dLat = (lat2 - lat1) * PI / 180.0;
  double dLon = (lon2 - lon1) * PI / 180.0;
  lat1 = lat1 * PI / 180.0;
  lat2 = lat2 * PI / 180.0;

  double a = sin(dLat / 2.0) * sin(dLat / 2.0) +
             cos(lat1) * cos(lat2) * sin(dLon / 2.0) * sin(dLon / 2.0);
  double c = 2.0 * atan2(sqrt(a), sqrt(1.0 - a));
  return 6371.0 * c; // Earth radius in km
}


// ==============================================================================
// 🩺 LIVE DIAGNOSTICS (Serial Monitor @115200)
// ==============================================================================
void printDiagnostics() {
  uint32_t chars = gps.charsProcessed();
  int rawIr = digitalRead(IR_SENSOR_PIN);
  int rawTouch = digitalRead(TOUCH_SENSOR_PIN);
  bool irDet = (rawIr == IR_ACTIVE_LEVEL);
  bool touchDet = TOUCH_SENSOR_INSTALLED && (rawTouch == HIGH);

  Serial.printf("[DIAG] IR(P%d)=%d(%s) | Touch(P%d)=%d(%s) -> WORN=%s | MPU: %.2fG (Tilt: %.1f°) | GPS: chars=%lu sats=%d fix=%s | WiFi=%s | HTTP=%d\n",
                IR_SENSOR_PIN, rawIr, irDet ? "DETECTED" : "CLEAR",
                TOUCH_SENSOR_PIN, rawTouch, touchDet ? "DETECTED" : (TOUCH_SENSOR_INSTALLED ? "CLEAR" : "OFF"),
                helmetState.helmetWorn ? "YES" : "NO",
                helmetState.totalG,
                helmetState.tiltAngle,
                (unsigned long)chars,
                helmetState.satellites,
                helmetState.gpsValid ? "YES" : "NO",
                WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "DOWN",
                lastHttpCode);
  if (millis() > 5000 && chars < 10) {
    Serial.println("[DIAG] ⚠️ GPS sends NO data: check GPS TX->GPIO16, RX->GPIO17, VCC, GND (and that its LED is on).");
  } else if (chars > 10 && !helmetState.gpsValid) {
    Serial.println("[DIAG] GPS data OK but no fix yet: take the helmet OUTDOORS with open sky, wait 1-10 min.");
  }
}
