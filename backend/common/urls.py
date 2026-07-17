from django.urls import path

from common.views import GlobalSearchView

urlpatterns = [
    path("search/", GlobalSearchView.as_view(), name="global-search"),
]
