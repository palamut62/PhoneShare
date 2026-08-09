"""Token basina istek hizi limiti ve bayt/saniye aktarim hizi limiti."""

from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field


class RateLimitError(Exception):
    """Istek limiti asildi (HTTP 429)."""

    def __init__(self, retry_after: int = 1) -> None:
        super().__init__("Istek limiti asildi.")
        self.retry_after = retry_after


@dataclass
class RequestRateLimiter:
    """Kayan pencere: anahtar basina `limit` istek / `window` saniye."""

    limit: int
    window: float = 60.0
    _hits: dict[str, deque[float]] = field(default_factory=dict)

    def check(self, key: str, now: float | None = None) -> None:
        ts = now if now is not None else time.monotonic()
        bucket = self._hits.setdefault(key, deque())
        cutoff = ts - self.window
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= self.limit:
            retry_after = max(1, int(bucket[0] + self.window - ts) + 1)
            raise RateLimitError(retry_after)
        bucket.append(ts)

    def reset(self, key: str | None = None) -> None:
        if key is None:
            self._hits.clear()
        else:
            self._hits.pop(key, None)


class ByteRateLimiter:
    """Token bucket ile bayt/saniye sinirlamasi (0 = sinirsiz)."""

    def __init__(self, bytes_per_sec: int) -> None:
        self.rate = max(0, bytes_per_sec)
        self._tokens = float(self.rate)
        self._last = time.monotonic()
        self._lock = asyncio.Lock()

    async def consume(self, amount: int) -> None:
        if self.rate <= 0 or amount <= 0:
            return
        async with self._lock:
            while True:
                now = time.monotonic()
                self._tokens = min(float(self.rate), self._tokens + (now - self._last) * self.rate)
                self._last = now
                if self._tokens >= amount or amount > self.rate:
                    self._tokens = max(0.0, self._tokens - amount)
                    return
                await asyncio.sleep(min(1.0, (amount - self._tokens) / self.rate))
