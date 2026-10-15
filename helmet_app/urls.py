from django.urls import path
from . import views

urlpatterns = [
    # Web UI Dashboard
    path('', views.dashboard_view, name='dashboard'),

    # Mobile Rider Companion App (NEO-M8N GPS Bridge)
    path('mobile', views.mobile_view, name='mobile_noslash'),
    path('mobile/', views.mobile_view, name='mobile'),

    # REST Endpoints for ESP32 & Web Dashboard (accepting both / and non-slash)
    path('api/telemetry', views.api_telemetry, name='api_telemetry_noslash'),
    path('api/telemetry/', views.api_telemetry, name='api_telemetry'),
    path('api/telemetry/latest', views.api_telemetry_latest, name='api_telemetry_latest_noslash'),
    path('api/telemetry/latest/', views.api_telemetry_latest, name='api_telemetry_latest'),
    path('api/emergency/sos', views.api_emergency_sos, name='api_emergency_sos_noslash'),
    path('api/emergency/sos/', views.api_emergency_sos, name='api_emergency_sos'),
    path('api/emergency/accident', views.api_emergency_accident, name='api_emergency_accident_noslash'),
    path('api/emergency/accident/', views.api_emergency_accident, name='api_emergency_accident'),
    path('api/emergency/cancel', views.api_emergency_cancel, name='api_emergency_cancel_noslash'),
    path('api/emergency/cancel/', views.api_emergency_cancel, name='api_emergency_cancel'),
    path('api/navigation/guidance', views.api_navigation_guidance, name='api_navigation_guidance_noslash'),
    path('api/navigation/search', views.api_navigation_search, name='api_navigation_search_noslash'),
    path('api/navigation/search/', views.api_navigation_search, name='api_navigation_search'),
    path('api/navigation/route', views.api_navigation_route, name='api_navigation_route_noslash'),
    path('api/navigation/route/', views.api_navigation_route, name='api_navigation_route'),
    path('api/config/overspeed', views.api_config_overspeed, name='api_config_overspeed_noslash'),
    path('api/config/overspeed/', views.api_config_overspeed, name='api_config_overspeed'),
    path('api/incidents', views.api_incidents, name='api_incidents_noslash'),
    path('api/incidents/', views.api_incidents, name='api_incidents'),
    path('api/health', views.api_health, name='api_health_noslash'),
    path('api/health/', views.api_health, name='api_health'),
]
