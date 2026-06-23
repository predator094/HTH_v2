import os
from slowapi import Limiter
from slowapi.util import get_remote_address

_TESTING = os.getenv("TESTING", "false").lower() == "true"


def _key_func(request):
    if _TESTING:
        # Each unique X-Test-IP header gets its own bucket; falls back to a shared
        # test key so tests never hit real rate limits.
        return request.headers.get("X-Test-IP", "test-client")
    return get_remote_address(request)


limiter = Limiter(key_func=_key_func)
