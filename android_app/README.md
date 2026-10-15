# 🛡️ Kavach Smart Helmet — Android Native Application (APK Project)

This directory contains the complete **Native Android Application** for the **Kavach IoE Smart Helmet** system.
It compiles into a standalone **`.apk`** file that can be installed directly onto any Android smartphone.

---

## 🚀 Key Features

* **📱 Standalone Native APK**: Installed directly on Android devices. No browser chrome, no address bar.
* **🛰️ High-Precision NEO-M8N GPS Engine**: Real-time GNSS engine providing location, Doppler speed calculation, heading, and distance.
* **🏃 Speedometer & Trip Telemetry**: Real-time Doppler speed calculation in km/h, distance traveled, max speed, average speed, and altitude.
* **🚫 Overspeed Alert**: Configurable speed threshold (default: 60 km/h) with audible voice warning: *"Please reduce your speed."*
* **🪖 Helmet Wear Detection Interlock**: Optical IR wear sensor status and vehicle ignition relay safety interlock.
* **🚨 15-Second False-Alarm Cancellation Window**: Full MPU6050 accident sensing pipeline with audible siren, voice warning (*"Accident detected. Press the cancel button if you are safe."*), and a tactile **"I Am Safe (Cancel Alert)"** button.
* **🆘 Emergency SOS Distress Signal**: One-touch broadcast of live crash/distress coordinates with Google Maps link.
* **📡 Neon Cloud & Django Sync**: Sends live telemetry every 1.5 seconds to `/api/telemetry` so the Web Dashboard and PostgreSQL database receive live rider telemetry.

---

## 🛠️ How to Build the APK in Android Studio (1-Click Build)

1. Open **Android Studio**.
2. Click **File > Open...** and select the `android_app` folder (`D:\Smart Helmet IOE\android_app`).
3. Allow Android Studio to sync the Gradle project automatically.
4. From the top menu, click:
   ```
   Build > Build Bundle(s) / APK(s) > Build APK(s)
   ```
5. Once compilation finishes, click **"locate"** in the popup, or find the compiled APK at:
   ```
   android_app/app/build/outputs/apk/debug/app-debug.apk
   ```
6. Transfer `app-debug.apk` to your Android phone via USB cable, WhatsApp, or Google Drive.
7. Tap the file on your phone and tap **Install**!

---

## 💻 How to Build via Command Line (CLI)

If you have Android SDK command-line tools installed:

```bash
cd android_app
gradle assembleDebug
```
The output APK will be generated at `app/build/outputs/apk/debug/app-debug.apk`.
