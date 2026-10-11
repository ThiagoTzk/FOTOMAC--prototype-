"""Request limiting per client address (RNF10, RS018: brute force on login).

In memory, per process: correct for the single-server prototype. With several API
processes it must move to a shared store (e.g. the database or Redis) — noted for the
deployment phase.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.max_requests:
                raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                    "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.")
            hits.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def __call__(self, request: Request) -> None:
        """Usable directly as a FastAPI dependency."""
        self.check(request.client.host if request.client else "unknown")


login_limiter = RateLimiter(max_requests=10, window_seconds=60)
password_link_limiter = RateLimiter(max_requests=5, window_seconds=300)
