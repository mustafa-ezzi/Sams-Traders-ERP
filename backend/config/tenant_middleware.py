class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = request.user

        if user and user.is_authenticated:
            request.tenant_id = user.tenant_id
        else:
            request.tenant_id = None

        return self.get_response(request)