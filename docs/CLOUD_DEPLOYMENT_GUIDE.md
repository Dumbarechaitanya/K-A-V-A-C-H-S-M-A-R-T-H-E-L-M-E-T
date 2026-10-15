# ☁️ Cloud Server Deployment Guide for Kavach Smart Helmet (Django + Neon)

This guide outlines how to host your Django IoT Backend and Web Dashboard on Render for free with Neon Serverless PostgreSQL.

---

## 🚀 1-Click Free Deployment on Render (Django + Neon PostgreSQL)

[Render.com](https://render.com) provides free web service hosting for Python / Django applications with automatic HTTPS and database integration.

### Step-by-Step Instructions:

1. **Push your code to GitHub**:
   - Create a new GitHub repository (e.g. `kavach-smart-helmet-django`).
   - Push the project folder:
     ```bash
     git init
     git add .
     git commit -m "Kavach Smart Helmet with Django & Neon PostgreSQL"
     git branch -M main
     git remote add origin https://github.com/YOUR_USERNAME/kavach-smart-helmet-django.git
     git push -u origin main
     ```

2. **Deploy on Render using `render.yaml` or Web Service**:
   - Log in to [dashboard.render.com](https://dashboard.render.com).
   - Click **New +** -> **Web Service**.
   - Connect your GitHub repository `kavach-smart-helmet-django`.
   - Configure the following settings:
     - **Name**: `kavach-smart-helmet`
     - **Runtime**: `Python 3`
     - **Build Command**:
       ```bash
       pip install -r requirements.txt && python manage.py collectstatic --no-input && python manage.py migrate
       ```
     - **Start Command**:
       ```bash
       gunicorn smart_helmet_project.wsgi:application --bind 0.0.0.0:$PORT
       ```
     - **Instance Type**: `Free`
   - Under **Environment Variables**, add:
     - `DATABASE_URL`: `postgresql://neondb_owner:npg_Pxy2Ij8LXcEf@ep-divine-bar-az7p1inj-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
     - `DEBUG`: `False`
     - `SECRET_KEY`: (Click Generate or provide random secret)
   - Click **Create Web Service**.

3. **Get your Live Public URL**:
   - Render will assign you a live HTTPS URL:
     `https://kavach-smart-helmet-xxxx.onrender.com`
   - Open this URL in any browser on your laptop or smartphone to view the **Live Dashboard**!

---

## 💻 Local Run (Quick Start)

```bash
# Apply migrations to Neon DB
python manage.py migrate

# Collect static assets
python manage.py collectstatic --no-input

# Start local development server
python manage.py runserver 8000
```
Open **`http://localhost:8000`** in your browser.

---

## 🔗 Connecting ESP32 to Your Django Cloud Server

1. Open `esp32_firmware/config.h` in Arduino IDE or VS Code.
2. Replace `CLOUD_SERVER_URL` with your public server URL:
   ```cpp
   #define WIFI_SSID       "YOUR_WIFI_OR_MOBILE_HOTSPOT"
   #define WIFI_PASSWORD   "YOUR_PASSWORD"

   // Example public Render URL:
   #define CLOUD_SERVER_URL  "https://kavach-smart-helmet-xxxx.onrender.com"
   ```
3. Upload `smart_helmet_esp32.ino` to your ESP32 board.
4. When ESP32 connects to Wi-Fi, it will stream live GPS, MPU6050 crash/tilt data, IR wear state, and battery level directly into Neon PostgreSQL!
