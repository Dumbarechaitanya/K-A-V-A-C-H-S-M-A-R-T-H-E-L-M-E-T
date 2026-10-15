#ifndef CONFIG_H
#define CONFIG_H

// ==============================================================================
// 📶 WI-FI & CLOUD SERVER CONFIGURATION
// ==============================================================================
#define WIFI_SSID       "Dumbre_House"
#define WIFI_PASSWORD   "shalinee81"

// Replace with your hosted cloud server URL (e.g., Render, Railway, or local IP for testing)
// Example: "http://smart-helmet-cloud.onrender.com" or "http://192.168.1.100:3000"
// #define CLOUD_SERVER_URL  "http://your-cloud-server.onrender.com"
#define CLOUD_SERVER_URL  "http://192.168.0.106:3000"
#define TELEMETRY_ENDPOINT "/api/telemetry/"
#define SOS_ENDPOINT        "/api/emergency/sos/"
#define CANCEL_ENDPOINT     "/api/emergency/cancel/"

#define DEVICE_ID           "KAVACH-ESP32-01"
#define BT_DEVICE_NAME      "KAVACH_HELMET_01"

// ==============================================================================
// 📌 GPIO PIN ASSIGNMENTS (ESP32 DevKit V1)
// ==============================================================================
// GPS NEO-M8N / NEO-6M (Hardware Serial 2)
#define GPS_RX_PIN          16   // Connect to GPS TX
#define GPS_TX_PIN          17   // Connect to GPS RX
#define GPS_BAUD_RATE       9600 // NEO-M8N default 9600 bps

// MPU6050 6-DOF IMU (Accelerometer + Gyroscope over I2C)
#define MPU_SDA_PIN         21   // I2C Data
#define MPU_SCL_PIN         22   // I2C Clock

// ==============================================================================
// 🪖 DUAL HELMET WEAR DETECTION (IR Proximity + TTP223 Capacitive Touch)
// ==============================================================================
#define IR_SENSOR_PIN         18   // IR Obstacle Sensor OUT (GPIO 18)
#define IR_ACTIVE_LEVEL       LOW  // Most IR modules pull OUT LOW when head detected. If inverted, change to HIGH
#define TOUCH_SENSOR_PIN      19   // TTP223 Touch Sensor OUT (GPIO 19)
#define TOUCH_SENSOR_INSTALLED false // Set to true ONLY if physical TTP223 touch sensor is wired to GPIO 19
#define REQUIRE_BOTH_WEAR_SENSORS false // false = EITHER sensor confirms wear (fail-safe)

// Push Button (SOS & Accident False Alarm Cancellation)
#define PUSH_BUTTON_PIN       4    // Push Button to GND with internal pull-up (GPIO 4)

// MAX98357A I2S Class-D Amplifier (Crystal Clear Digital Audio)
#define I2S_BCLK_PIN        26   // I2S Bit Clock (BCLK)  (matches your wiring: GPIO 26)
#define I2S_LRC_PIN         25   // I2S Word Select / Left-Right Clock (LRC / WS)
#define I2S_DIN_PIN         27   // I2S Serial Data In (DIN)  (matches your wiring: GPIO 27)

// Battery Voltage Divider & TP4056 Charging Detection
#define BATTERY_ADC_PIN     36   // ADC1_CH0 (VP) (with 2x 100k ohm resistor divider)
#define TP4056_CHRG_PIN     23   // Digital Input connected to TP4056 CHRG pin

// ==============================================================================
// ⚙️ SYSTEM THRESHOLDS & TIMINGS
// ==============================================================================
#define MPU_IMPACT_THRESHOLD_G     3.5f   // Total acceleration > 3.5G flags sudden crash/impact
#define MPU_FALL_TILT_DEG          60.0f  // Helmet tilt > 60 degrees flags fall/slide
#define OVERSPEED_THRESHOLD_KMH    60.0f  // Default overspeed limit (60 km/h)
#define SOS_LONG_PRESS_MS          2000   // 2 seconds hold to trigger SOS
#define ACCIDENT_COUNTDOWN_SEC     15     // 15-second countdown window to cancel false alarm
#define TELEMETRY_INTERVAL_MS      2000   // Send GPS & telemetry to cloud every 2 seconds

#endif // CONFIG_H
