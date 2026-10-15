from django.contrib import admin
from .models import HelmetDeviceState, IncidentAlert, PendingAudioCommand

@admin.register(HelmetDeviceState)
class HelmetDeviceStateAdmin(admin.ModelAdmin):
    list_display = ('device_id', 'online', 'speed_kmh', 'helmet_worn', 'battery_percent', 'battery_voltage', 'is_charging', 'sos_active', 'last_seen')
    list_filter = ('online', 'helmet_worn', 'sos_active', 'is_charging')

@admin.register(IncidentAlert)
class IncidentAlertAdmin(admin.ModelAdmin):
    list_display = ('alert_type', 'severity', 'message', 'speed_kmh', 'created_at')
    list_filter = ('alert_type', 'severity')

@admin.register(PendingAudioCommand)
class PendingAudioCommandAdmin(admin.ModelAdmin):
    list_display = ('command', 'text', 'dispatched', 'created_at')
    list_filter = ('dispatched', 'command')
