# 🛡️ Kavach — IoE-Based Smart Helmet with Navigation, Speed Monitoring, and Accident Detection

A comprehensive Internet of Everything (IoE) and IoT rider safety system powered by **Django 5.0 Backend**, **Neon Serverless PostgreSQL**, **ESP32 Microcontroller**, **NEO-M8N GPS tracking**, **MPU6050 6-DOF accident & tilt sensing**, **IR wear detection**, **Speed monitoring & overspeed alerts**, **15-second false-alarm cancellation window**, **MAX98357A I2S digital voice assistance**, and **Li-Ion battery telemetry**.

---

## 🚀 Key Features

### 🪖 1. Helmet Wear Detection
* Optical IR sensor continuously checks if the helmet is worn and secured on the rider's head.
* **If Not Worn**:
  * Voice prompt on helmet speaker: **"Please wear your helmet."**
  * Dashboard status: **Helmet Not Worn**.

### 📍 2. GPS Navigation (NEO-M8N + Cloud / Mobile App)
* User sets destination in the mobile app / cloud dashboard.
* Route is calculated with remaining distance and ETA.
* Helmet provides turn-by-turn voice guidance directly in rider's ears:
  * *"Turn left"*
  * *"Turn right"*
  * *"Continue straight"*
  * *"You have reached your destination"*

### 🚨 3. Accident & Fall Detection (MPU6050 IMU)
* Measures resultant acceleration ($>3.5g$) and abnormal tilt ($>60^\circ$).
* Starts an audible **15-second countdown window**.
* Voice prompt:
  > *"Accident detected. Press the cancel button if you are safe."*
* **If Conscious**: Rider presses the push button on the helmet within 15 seconds to cancel false alarms.
* **If Unconscious / Real Crash**:
  * Broadcasts critical crash coordinates with Google Maps link to emergency contacts (Medical/Police/Family).
  * Updates the cloud dashboard and records in Neon PostgreSQL with critical accident status.

### 🏃 4. Speed Monitoring
* Real-time GPS Doppler speed calculation:
  * Current speed ($km/h$)
  * Average speed ($km/h$)
  * Maximum speed ($km/h$)
  * Total distance traveled ($km$)

### 🚫 5. Overspeed Detection
* Configurable speed limit (default: **60 km/h**).
* **If Exceeded**:
  * Voice alert: **"Please reduce your speed."**
  * Recorded in the cloud database & displayed on live HUD.

### 🔋 6. Li-Ion Battery Level Telemetry (Required)
* Live battery voltage divider sensing on ESP32 (`GPIO 36 VP`).
* TP4056 charging status detection (`GPIO 23`).
* Real-time battery percentage ($0-100\%$) and voltage ($3.3\text{V}-4.2\text{V}$) displayed on dashboard and stored in Neon DB.

### 🔊 7. Voice Assistance (MAX98357A I2S Audio)
The helmet announces:
* *"Please wear your helmet."*
* *"Turn left / Turn right / Continue straight"*
* *"Please reduce your speed."*
* *"You have reached your destination."*
* *"Accident detected. Press the cancel button if you are safe."*
* *"Emergency alert cancelled."*

---

## 🛠️ Hardware Specifications

| Component | Purpose | Pins / Interface |
| :--- | :--- | :--- |
| **ESP32 DevKit V1** | Main IoT controller with Wi-Fi & Bluetooth | Dual-Core 240MHz, 4MB Flash |
| **NEO-M8N GPS** | Location, speed, distance, altitude | UART2: `GPIO 16 (RX)`, `GPIO 17 (TX)` |
| **MPU6050 6-DOF IMU** | Impact force ($g$) & tilt fall angle ($^\circ$) | I2C: `GPIO 21 (SDA)`, `GPIO 22 (SCL)` |
| **IR Proximity Sensor** | Helmet wear detection | Digital In: `GPIO 18` |
| **Push Button** | Cancel emergency alert / SOS distress | Digital In: `GPIO 19` (Pullup) |
| **MAX98357A I2S Amp** | Crystal-clear voice guidance & sirens (3.2W) | I2S: `GPIO 27 (BCLK)`, `GPIO 25 (LRC)`, `GPIO 26 (DIN)` |
| **4Ω / 8Ω Speaker** | Audio output inside helmet ear pads | Connected to MAX98357A $+ / -$ |
| **TP4056 + 18650 Li-Ion**| Rechargeable battery telemetry & charging sense | ADC: `GPIO 36 (VP)`, CHRG: `GPIO 23` |

---

## 🏗️ System Architecture

```text
┌───────────────────────────────────────────────────────────────┐
│                     KAVACH SMART HELMET                       │
│                                                               │
│   ┌──────────────┐   ┌──────────────┐   ┌─────────────────┐   │
│   │ MPU6050 IMU  │   │  NEO-M8N GPS │   │ IR Wear Sensor  │   │
│   └──────┬───────┘   └──────┬───────┘   └────────┬────────┘   │
│          │ I2C              │ UART2              │ GPIO 18    │
│          ▼                  ▼                    ▼            │
│       ┌──────────────────────────────────────────────┐        │
│       │           ESP32 Microcontroller              │        │
│       └──────────────────────┬───────────────────────┘        │
│                              │ I2S Audio                      │
│                              ▼                                │
│                   ┌─────────────────────┐                     │
│                   │ MAX98357A + Speaker │                     │
│                   │ (Voice Guidance)    │                     │
│                   └─────────────────────┘                     │
└──────────────────────────────┬────────────────────────────────┘
                        │
                        │ Wi-Fi / Mobile Hotspot (REST JSON)
                        ▼
       ┌──────────────────────────────────────────────┐
       │             Django 5.0 IoT Cloud             │
       │    ├── Neon Serverless PostgreSQL            │
       │    ├── Live Telemetry & Battery Telemetry    │
       │    └── Emergency & Overspeed Incident Logs   │
       └────────────────┬─────────────────────────────┘
                        │
                        ▼
       ┌──────────────────────────────────────────────┐
       │         Real-Time Web UI Dashboard           │
       │   ├── Leaflet GPS Live Tracking              │
       │   ├── Turn-by-Turn Navigation HUD            │
       │   ├── Speedometer & Overspeed Control (60km) │
       │   ├── MPU6050 Crash & Tilt Gauges            │
       │   ├── Battery Level Gauge (Voltage & %)      │
       │   ├── 15s False Alarm Cancellation Modal     │
       │   └── Interactive Hardware Simulator         │
       └──────────────────────────────────────────────┘
```

---

## ⚡ Quick Start (Local Run & Testing)

```bash
# 1. Apply database migrations to Neon PostgreSQL
python manage.py migrate

# 2. Collect static assets
python manage.py collectstatic --no-input

# 3. Start local development server
python manage.py runserver 8000
```

Open your browser at **`(https://kavach-smart-helmet-django.onrender.com/)`** to view the interactive dashboard.
