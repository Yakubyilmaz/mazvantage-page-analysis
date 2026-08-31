#!/usr/bin/env python3
"""
Maz Vantage — local server.

    python serve.py            # http://localhost:8792
    python serve.py 9000       # pick a port

The report is a static ES-module app, so it needs to be served over http://
rather than opened from the filesystem (module imports are blocked on file://).

Responses are sent with `Cache-Control: no-store`, because browsers cache ES
modules hard enough that an edited file will keep serving the old version
until a manual hard-reload.

The server is threaded. A single-threaded one deadlocks here: the report's
module graph is a dozen files deep, the browser opens several connections at
once to fetch it, and the queued ones are aborted before they are ever served.
"""
from __future__ import annotations

import http.server
import os
import socket
import socketserver
import sys
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8792


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        # One tidy line per request; drop the noisy default timestamp block.
        sys.stderr.write("  %s\n" % (fmt % args))

    def handle_one_request(self):
        # A browser that navigates away mid-download aborts the socket. That is
        # normal, not an error, and the default handler prints a full traceback
        # for every one of them.
        try:
            super().handle_one_request()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, socket.timeout):
            self.close_connection = True


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True          # do not keep the process alive on Ctrl+C

    # Deliberately NOT allow_reuse_address. On Windows that flag lets a second
    # process bind a port something else is already serving, and requests then
    # land on whichever happened to accept — which looks exactly like a stale
    # cache, because half the responses come from the older process. Better to
    # fail the bind loudly; main() turns it into a readable message.
    allow_reuse_address = False


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    try:
        with Server(("127.0.0.1", port), Handler) as httpd:
            url = f"http://localhost:{port}/"
            print(f"Maz Vantage running at {url}")
            print("  ?symbol=MSFT to load another ticker · Ctrl+C to stop")
            if "--no-open" not in sys.argv:
                webbrowser.open(url)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    except OSError as exc:
        print(f"could not bind port {port}: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
