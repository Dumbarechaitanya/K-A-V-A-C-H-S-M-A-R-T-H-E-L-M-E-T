import json
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from .models import HelmetDeviceState, IncidentAlert, PendingAudioCommand

def get_or_create_device_state(device_id='KAVACH-ESP32-01'):
    state, _ = HelmetDeviceState.objects.get_or_create(device_id=device_id)
    return state

latest_hardware_diagnostics = {
    'espOk': 1,
    'ampOk': 1,
    'mpuOk': 0,
    'gpsOk': 0,
    'irRaw': 0,
    'touchRaw': 0,
    'touchInst': 0
}

def calculate_battery_percent(voltage):
    if voltage >= 4.2:
        return 100
    if voltage <= 3.3:
        return 0
    return round(((voltage - 3.3) / (4.2 - 3.3)) * 100)

def dashboard_view(request):
    """Render the cyber-dark glassmorphic Web Dashboard"""
    state = get_or_create_device_state()
    incidents = IncidentAlert.objects.all()[:30]
    return render(request, 'index.html', {
        'state': state,
        'incidents': incidents
    })

def mobile_view(request):
    """Render the Mobile Companion App / NEO-M8N GPS Bridge"""
    state = get_or_create_device_state()
    incidents = IncidentAlert.objects.all()[:15]
    return render(request, 'mobile.html', {
        'state': state,
        'incidents': incidents
    })

@csrf_exempt
def api_telemetry(request):
    """
    ESP32 / Simulator Telemetry Endpoint
    Accepts JSON packet with GPS, Speed, MPU6050, IR wear, Battery Voltage/Percent.
    Persists to Neon PostgreSQL and returns any queued audio commands.
    """
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception:
            data = request.POST.dict()

        device_id = data.get('deviceId', 'KAVACH-ESP32-01')
        state = get_or_create_device_state(device_id)
        now = timezone.now()

        source = data.get('source', '')

        # Mark device online ONLY if the packet is genuinely from the physical ESP32 or Bluetooth serial link
        # Mobile app client polling/location updates must NEVER mark the helmet online
        if source in ('esp32', 'bluetooth_serial', 'mobile_app_bluetooth'):
            state.online = True
            state.last_seen = now
        elif source == 'mobile_app':
            # Do not touch online or last_seen; client is just a display/companion
            pass
        else:
            # Fallback: only if actual physical sensor telemetry is present in the payload
            if 'totalG' in data or 'helmetWorn' in data or 'batteryVoltage' in data or 'espOk' in data:
                state.online = True
                state.last_seen = now

        # Ingest 1/0 Hardware Component Connection Status for Diagnostics (only if provided by hardware)
        if source != 'mobile_app':
            for key in ['espOk', 'ampOk', 'mpuOk', 'gpsOk', 'irRaw', 'touchRaw', 'touchInst']:
                if key in data:
                    latest_hardware_diagnostics[key] = int(data[key])

        # GPS Data
        if 'latitude' in data and 'longitude' in data:
            state.latitude = float(data.get('latitude', state.latitude))
            state.longitude = float(data.get('longitude', state.longitude))
            state.speed_kmh = float(data.get('speed', data.get('speedKmH', state.speed_kmh)))
            state.altitude_m = float(data.get('altitude', state.altitude_m))
            state.satellites = int(data.get('satellites', state.satellites))
            state.gps_fix = bool(data.get('fix', True))
            if 'heading' in data:
                state.heading = float(data.get('heading', state.heading))
            if 'totalDistanceKm' in data:
                state.total_distance_km = float(data.get('totalDistanceKm', state.total_distance_km))
            if 'avgSpeedKmH' in data:
                state.avg_speed_kmh = float(data.get('avgSpeedKmH', state.avg_speed_kmh))

            if state.speed_kmh > state.max_speed_kmh:
                state.max_speed_kmh = round(state.speed_kmh, 1)

            # Overspeed detection (60 km/h)
            is_overspeed = state.speed_kmh >= state.overspeed_limit_kmh
            if is_overspeed and not state.overspeed_alert:
                state.overspeed_alert = True
                IncidentAlert.objects.create(
                    device_id=device_id,
                    alert_type='OVERSPEED',
                    message=f"Overspeed alert: {state.speed_kmh:.1f} km/h (Limit: {state.overspeed_limit_kmh:.1f} km/h). Voice prompt: 'Please reduce your speed.'",
                    severity='warning',
                    speed_kmh=state.speed_kmh,
                    latitude=state.latitude,
                    longitude=state.longitude
                )
            elif not is_overspeed:
                state.overspeed_alert = False

        # Helmet Hardware Sensors (from ESP32 or Bluetooth Mobile Bridge)
        # Helmet Wear Detection (IR Sensor)
        if 'helmetWorn' in data:
            was_worn = state.helmet_worn
            state.helmet_worn = bool(data['helmetWorn'])
            if was_worn != state.helmet_worn:
                if state.helmet_worn:
                    IncidentAlert.objects.create(
                        device_id=device_id,
                        alert_type='HELMET_STATUS',
                        message='Helmet worn and secured. Ignition relay enabled.',
                        severity='success'
                    )
                else:
                    IncidentAlert.objects.create(
                        device_id=device_id,
                        alert_type='HELMET_STATUS',
                        message='Helmet removed! Ignition relay locked. Voice: "Please wear your helmet."',
                        severity='warning'
                    )

        # MPU6050 IMU Data
        if 'totalG' in data:
            state.total_g = float(data['totalG'])
        if 'tiltAngle' in data:
            state.tilt_angle = float(data['tiltAngle'])
        if 'accelX' in data:
            state.accel_x = float(data['accelX'])
        if 'accelY' in data:
            state.accel_y = float(data['accelY'])
        if 'accelZ' in data:
            state.accel_z = float(data['accelZ'])

        # Battery Telemetry (Required Li-Ion Sensing)
        if 'batteryVoltage' in data:
            state.battery_voltage = float(data['batteryVoltage'])
            state.battery_percent = calculate_battery_percent(state.battery_voltage)
        elif 'batteryPercent' in data:
            state.battery_percent = int(data['batteryPercent'])

        if 'isCharging' in data:
            state.is_charging = bool(data['isCharging'])

        # SOS Push Button Trigger
        if data.get('sosActive') and not state.sos_active:
            state.sos_active = True
            maps_url = f"https://maps.google.com/?q={state.latitude},{state.longitude}"
            IncidentAlert.objects.create(
                device_id=device_id,
                alert_type='EMERGENCY_SOS',
                message=f"EMERGENCY SOS Triggered by Rider! Location: {state.latitude:.5f}, {state.longitude:.5f}",
                severity='danger',
                latitude=state.latitude,
                longitude=state.longitude,
                speed_kmh=state.speed_kmh,
                maps_url=maps_url
            )

        # Accident confirmation sync
        if data.get('accidentConfirmed') and not state.accident_confirmed:
            state.accident_confirmed = True
            state.in_accident_countdown = False
            state.accident_time = now
            maps_url = f"https://maps.google.com/?q={state.latitude},{state.longitude}"
            IncidentAlert.objects.create(
                device_id=device_id,
                alert_type='ACCIDENT_CRITICAL',
                message=f"CRITICAL: Accident confirmed via MPU6050 ({state.total_g:.2f}g, {state.tilt_angle:.1f}°). Emergency dispatch notified!",
                severity='danger',
                latitude=state.latitude,
                longitude=state.longitude,
                speed_kmh=state.speed_kmh,
                maps_url=maps_url
            )

        state.save()

        # Fetch pending audio commands for ESP32
        pending = list(PendingAudioCommand.objects.filter(device_id=device_id, dispatched=False))
        command_list = [{'command': p.command, 'text': p.text} for p in pending]
        for p in pending:
            p.dispatched = True
            p.save()

        return JsonResponse({
            'status': 'success',
            'timestamp': now.isoformat(),
            'commands': command_list
        })

    return JsonResponse({'error': 'POST required'}, status=405)


def api_telemetry_latest(request):
    """Return the latest full state for Web Dashboard polling/updates with dynamic online check"""
    state = get_or_create_device_state()
    now = timezone.now()
    seconds_since_last_seen = (now - state.last_seen).total_seconds()
    # Device is considered truly online only if telemetry was received in the last 10 seconds
    is_online = seconds_since_last_seen < 10

    if state.online != is_online:
        state.online = is_online
        state.save(update_fields=['online'])

    return JsonResponse({
        'deviceId': state.device_id,
        'online': is_online,
        'secondsSinceLastSeen': int(seconds_since_last_seen),
        'lastSeen': state.last_seen.isoformat(),
        'hardwareDiagnostics': latest_hardware_diagnostics if is_online else None,
        'gps': {
            'latitude': state.latitude if is_online else None,
            'longitude': state.longitude if is_online else None,
            'speedKmH': state.speed_kmh if is_online else 0.0,
            'maxSpeedKmH': state.max_speed_kmh if is_online else 0.0,
            'avgSpeedKmH': state.avg_speed_kmh if is_online else 0.0,
            'totalDistanceKm': state.total_distance_km if is_online else 0.0,
            'altitudeMeters': state.altitude_m if is_online else None,
            'satellites': state.satellites if is_online else 0,
            'fix': state.gps_fix if is_online else False,
            'heading': state.heading if is_online else None
        },
        'sensors': {
            'helmetWorn': state.helmet_worn if is_online else None,
            'totalG': state.total_g if is_online else None,
            'tiltAngle': state.tilt_angle if is_online else None,
            'accelX': state.accel_x if is_online else None,
            'accelY': state.accel_y if is_online else None,
            'accelZ': state.accel_z if is_online else None,
            'overspeedAlert': state.overspeed_alert if is_online else False,
            'overspeedLimitKmH': state.overspeed_limit_kmh,
            'batteryVoltage': state.battery_voltage if is_online else None,
            'batteryPercent': state.battery_percent if is_online else None,
            'isCharging': state.is_charging if is_online else False,
            'sosActive': state.sos_active if is_online else False
        },
        'emergency': {
            'inAccidentCountdown': state.in_accident_countdown if is_online else False,
            'accidentTriggered': state.accident_confirmed if is_online else False,
            'accidentTime': state.accident_time.isoformat() if state.accident_time and is_online else None
        },
        'navigation': {
            'active': state.nav_active,
            'destinationName': state.nav_destination if state.nav_active else '',
            'distanceRemainingKm': state.nav_dist_rem_km if state.nav_active else 0.0,
            'etaMinutes': state.nav_eta_mins if state.nav_active else 0,
            'instruction': state.nav_instruction if state.nav_active else 'Ready — Select destination',
            'turnType': state.nav_turn_type if state.nav_active else ''
        }
    })


@csrf_exempt
def api_emergency_sos(request):
    """Direct SOS trigger or resolution endpoint"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception:
            data = request.POST.dict()

        action = data.get('action', 'trigger')
        state = get_or_create_device_state()

        if action == 'reset':
            state.sos_active = False
            state.accident_confirmed = False
            state.save()
            IncidentAlert.objects.create(
                device_id=state.device_id,
                alert_type='EMERGENCY_SOS',
                message='SOS Emergency alert cleared / resolved.',
                severity='info'
            )
        else:
            state.sos_active = True
            state.save()
            maps_url = f"https://maps.google.com/?q={state.latitude},{state.longitude}"
            IncidentAlert.objects.create(
                device_id=state.device_id,
                alert_type='EMERGENCY_SOS',
                message=f"EMERGENCY SOS Triggered! Location: {maps_url}",
                severity='danger',
                latitude=state.latitude,
                longitude=state.longitude,
                maps_url=maps_url
            )

        return JsonResponse({'success': True, 'sosActive': state.sos_active})
    return JsonResponse({'error': 'POST required'}, status=405)


@csrf_exempt
def api_emergency_accident(request):
    """Accident trigger (15s countdown) or confirmation endpoint"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception:
            data = request.POST.dict()

        confirmed = data.get('confirmed', False)
        g_force = float(data.get('gForce', 4.2))
        tilt = float(data.get('tilt', 72.0))
        state = get_or_create_device_state()

        if confirmed:
            state.in_accident_countdown = False
            state.accident_confirmed = True
            state.accident_time = timezone.now()
            state.save()

            maps_url = f"https://maps.google.com/?q={state.latitude},{state.longitude}"
            IncidentAlert.objects.create(
                device_id=state.device_id,
                alert_type='ACCIDENT_CRITICAL',
                message=f"CRITICAL: Crash confirmed via MPU6050 ({g_force:.2f}g, {tilt:.1f}°). First responders dispatched!",
                severity='danger',
                latitude=state.latitude,
                longitude=state.longitude,
                maps_url=maps_url
            )
        else:
            state.in_accident_countdown = True
            state.save()
            IncidentAlert.objects.create(
                device_id=state.device_id,
                alert_type='ACCIDENT_WARNING',
                message=f"MPU6050 Impact/Tilt Detected ({g_force:.2f}g, {tilt:.1f}°)! 15-second countdown started. Voice: 'Accident detected. Press cancel button if you are safe.'",
                severity='warning',
                latitude=state.latitude,
                longitude=state.longitude
            )

        return JsonResponse({'success': True, 'inCountdown': state.in_accident_countdown, 'accidentConfirmed': state.accident_confirmed})
    return JsonResponse({'error': 'POST required'}, status=405)


@csrf_exempt
def api_emergency_cancel(request):
    """Rider cancels 15-second false alarm accident alert"""
    if request.method == 'POST':
        state = get_or_create_device_state()
        state.in_accident_countdown = False
        state.accident_confirmed = False
        state.save()

        IncidentAlert.objects.create(
            device_id=state.device_id,
            alert_type='ACCIDENT_CANCELLED',
            message='Accident alert cancelled by rider (Push button pressed within 15s window). False alarm avoided.',
            severity='success'
        )
        return JsonResponse({'success': True, 'message': 'Accident cancelled'})
    return JsonResponse({'error': 'POST required'}, status=405)


@csrf_exempt
def api_navigation_guidance(request):
    """Dispatch Turn-by-Turn Voice Guidance to Helmet Speaker"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception:
            data = request.POST.dict()

        command = data.get('command', 'NAV_STRAIGHT')
        instruction = data.get('instruction', 'Continue straight')
        state = get_or_create_device_state()

        state.nav_instruction = instruction
        state.nav_turn_type = command
        state.save()

        # Queue audio prompt for ESP32
        PendingAudioCommand.objects.create(
            device_id=state.device_id,
            command=command,
            text=instruction
        )

        IncidentAlert.objects.create(
            device_id=state.device_id,
            alert_type='VOICE_NAV',
            message=f"Navigation Voice: '{instruction}'",
            severity='info'
        )

        return JsonResponse({'success': True, 'command': command, 'instruction': instruction})
    return JsonResponse({'error': 'POST required'}, status=405)


@csrf_exempt
def api_config_overspeed(request):
    """Update overspeed threshold limit (e.g. 60 km/h)"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception:
            data = request.POST.dict()

        limit = float(data.get('limitKmH', 60.0))
        state = get_or_create_device_state()
        state.overspeed_limit_kmh = limit
        state.save()

        IncidentAlert.objects.create(
            device_id=state.device_id,
            alert_type='CONFIG',
            message=f"Overspeed limit configured to {limit:.1f} km/h",
            severity='info'
        )
        return JsonResponse({'success': True, 'limitKmH': state.overspeed_limit_kmh})
    return JsonResponse({'error': 'POST required'}, status=405)


@csrf_exempt
def api_incidents(request):
    """Return recent incident alerts list, or clear them if POST/DELETE with action=clear"""
    if request.method == 'DELETE' or (request.method == 'POST' and request.GET.get('action') == 'clear'):
        IncidentAlert.objects.all().delete()
        return JsonResponse({'success': True, 'cleared': True, 'incidents': []})

    incidents = list(IncidentAlert.objects.all()[:50].values(
        'id', 'alert_type', 'message', 'severity', 'created_at', 'maps_url'
    ))
    for inc in incidents:
        inc['created_at'] = inc['created_at'].isoformat()
    return JsonResponse({'incidents': incidents})


def api_health(request):
    """Health check endpoint for Render / Uptime pingers"""
    state = get_or_create_device_state()
    return JsonResponse({
        'status': 'healthy',
        'backend': 'Django 5.0 + Neon PostgreSQL',
        'deviceId': state.device_id,
        'batteryPercent': state.battery_percent,
        'batteryVoltage': state.battery_voltage,
        'online': state.online
    })


def api_navigation_search(request):
    """Proxy geocoding search to avoid client-side CORS/User-Agent issues"""
    query = request.GET.get('q', '').strip()
    if not query:
        return JsonResponse({'results': []})

    import urllib.request, urllib.parse
    headers = {'User-Agent': 'KavachSmartHelmet/1.0 (kavach-iot-project)'}
    results = []

    # 1. Try Nominatim with custom User-Agent
    try:
        url = f"https://nominatim.openstreetmap.org/search?format=json&q={urllib.parse.quote(query)}&limit=5"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode())
            for item in data:
                name = item.get('display_name', '').split(',')[0].strip()
                results.append({
                    'name': name,
                    'display_name': item.get('display_name', ''),
                    'lat': float(item.get('lat')),
                    'lon': float(item.get('lon'))
                })
    except Exception:
        pass

    # 2. If Nominatim empty or failed, fallback to Photon API
    if not results:
        try:
            p_url = f"https://photon.komoot.io/api/?q={urllib.parse.quote(query)}&lat=19.218&lon=73.086&limit=5"
            req = urllib.request.Request(p_url)
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode())
                for f in data.get('features', []):
                    p = f['properties']
                    c = f['geometry']['coordinates']
                    name = p.get('name') or p.get('city') or query
                    city = p.get('city', '')
                    display = f"{name}, {city}".strip(', ')
                    results.append({
                        'name': name,
                        'display_name': display,
                        'lat': float(c[1]),
                        'lon': float(c[0])
                    })
        except Exception:
            pass

    return JsonResponse({'results': results})


def api_navigation_route(request):
    """Proxy road routing query to OSRM Driving Engine to ensure reliable road paths"""
    try:
        from_lat = float(request.GET.get('from_lat', 0))
        from_lng = float(request.GET.get('from_lng', 0))
        to_lat = float(request.GET.get('to_lat', 0))
        to_lng = float(request.GET.get('to_lng', 0))
    except (ValueError, TypeError):
        return JsonResponse({'code': 'InvalidCoordinates', 'error': 'Invalid coordinates provided'}, status=400)

    if not from_lat or not to_lat:
        return JsonResponse({'code': 'InvalidCoordinates', 'error': 'Coordinates cannot be zero'}, status=400)

    import urllib.request
    osrm_url = f"https://router.project-osrm.org/route/v1/driving/{from_lng},{from_lat};{to_lng},{to_lat}?overview=full&geometries=geojson&steps=true"
    headers = {'User-Agent': 'KavachSmartHelmet/1.0 (kavach-iot-project)'}

    try:
        req = urllib.request.Request(osrm_url, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            return JsonResponse(data)
    except Exception as e:
        return JsonResponse({'code': 'Error', 'error': str(e)}, status=502)
