"""
URL configuration for smart_helmet_project.
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('helmet_app.urls')),
]
