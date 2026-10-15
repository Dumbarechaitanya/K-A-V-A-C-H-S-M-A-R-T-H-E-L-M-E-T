from django.db import models
from django.utils import timezone

class HelmetDeviceState(models.Model):
    """
    Live Telemetry Snapshot for Smart Helmet
    Includes GPS, MPU6050, IR wear sensor, and required Li-Ion Battery Level telemetry.
    (Ride history is omitted per requirements).
    """
    device_id = models.CharField(max_length=64, default='KAVACH-ESP32-01', unique=True)
    online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(default=timezone.now)

    # GPS Telemetry (NEO-M8N)
    latitude = models.FloatField(default=19.2184)
    longitude = models.FloatField(default=73.0867)
    speed_kmh = models.FloatField(default=0.0)
    max_speed_kmh = models.FloatField(default=0.0)
    avg_speed_kmh = models.FloatField(default=0.0)
    total_distance_km = models.FloatField(default=0.0)
    altitude_m = models.FloatField(default=0.0)
    satellites = models.IntegerField(default=0)
    gps_fix = models.BooleanField(default=False)
    heading = models.FloatField(default=0.0)

    # Sensor States
    helmet_worn = models.BooleanField(default=False)  # Optical IR sensor
    total_g = models.FloatField(default=0.0)          # MPU6050 Resultant G-Force
    tilt_angle = models.FloatField(default=0.0)       # MPU6050 Tilt Angle (deg)
    accel_x = models.FloatField(default=0.0)
    accel_y = models.FloatField(default=0.0)
    accel_z = models.FloatField(default=0.0)
    overspeed_alert = models.BooleanField(default=False)
    overspeed_limit_kmh = models.FloatField(default=60.0)

    # Required Battery Telemetry (TP4056 + 18650 Li-Ion)
    battery_voltage = models.FloatField(default=0.0)  # 3.3V to 4.2V
    battery_percent = models.IntegerField(default=0)  # 0 to 100%
    is_charging = models.BooleanField(default=False)   # TP4056 CHRG pin

    # Emergency & Accident State
    sos_active = models.BooleanField(default=False)
    in_accident_countdown = models.BooleanField(default=False)
    accident_confirmed = models.BooleanField(default=False)
    accident_time = models.DateTimeField(null=True, blank=True)

    # Navigation State
    nav_active = models.BooleanField(default=False)
    nav_destination = models.CharField(max_length=128, default='')
    nav_dist_rem_km = models.FloatField(default=0.0)
    nav_eta_mins = models.IntegerField(default=0)
    nav_instruction = models.CharField(max_length=255, default='Ready — Select destination')
    nav_turn_type = models.CharField(max_length=32, default='')

    class Meta:
        verbose_name = 'Helmet Device State'
        verbose_name_plural = 'Helmet Device States'

    def __str__(self):
        return f"{self.device_id} ({'Online' if self.online else 'Offline'}) - Batt: {self.battery_percent}%"


class IncidentAlert(models.Model):
    """
    Emergency and Safety Incidents Log
    Records Accidents, SOS, Overspeed, and Helmet Wear events.
    """
    device_id = models.CharField(max_length=64, default='KAVACH-ESP32-01')
    alert_type = models.CharField(max_length=64)  # 'ACCIDENT_CRITICAL', 'EMERGENCY_SOS', 'OVERSPEED', 'HELMET_STATUS'
    message = models.TextField()
    severity = models.CharField(max_length=20, default='info')  # 'info', 'warning', 'danger', 'success'
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    speed_kmh = models.FloatField(null=True, blank=True)
    maps_url = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Incident Alert'
        verbose_name_plural = 'Incident Alerts'

    def __str__(self):
        return f"[{self.alert_type}] {self.message[:40]} ({self.created_at.strftime('%H:%M:%S')})"


class PendingAudioCommand(models.Model):
    """
    Queued voice and audio prompts dispatched to ESP32 speaker
    """
    device_id = models.CharField(max_length=64, default='KAVACH-ESP32-01')
    command = models.CharField(max_length=64)  # 'VOICE_HELMET_REMINDER', 'VOICE_OVERSPEED', 'NAV_TURN_LEFT', etc.
    text = models.TextField(blank=True, default='')
    dispatched = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Pending Audio Command'
        verbose_name_plural = 'Pending Audio Commands'

    def __str__(self):
        return f"{self.command} - Dispatched: {self.dispatched}"
