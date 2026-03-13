#!/usr/bin/env python3
"""
The Swing · Local Server
Run this to serve the dashboard locally with proper CORS headers.

Usage:
    python3 serve.py

Then open: http://localhost:8000
"""

import http.server
import socketserver
import webbrowser
import os

PORT = 8000

class CORSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress request logging for cleaner output
        pass

os.chdir(os.path.dirname(os.path.abspath(__file__)))

print("=" * 50)
print("  THE SWING · Live P-B-P Dashboard")
print("=" * 50)
print(f"  Server running at http://localhost:{PORT}")
print(f"  Press Ctrl+C to stop")
print("=" * 50)

webbrowser.open(f'http://localhost:{PORT}')

with socketserver.TCPServer(("", PORT), CORSHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
