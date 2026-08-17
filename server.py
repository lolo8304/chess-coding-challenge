#!/usr/bin/env python3

import glob
import os
import time
import threading
import queue

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = 8080

clients = []


def get_js_files():
    return {
        file: os.path.getmtime(file)
        for file in glob.glob("**/*.js", recursive=True)
    }


def notify_clients(filename):
    print(f"Changed: {filename}")

    for q in clients[:]:
        q.put(filename)


def watch_files():
    # Initial snapshot - don't trigger events
    previous = get_js_files()

    print("Watching *.js files...")

    while True:
        time.sleep(0.2)

        current = get_js_files()

        # created / modified
        for file, mtime in current.items():
            if file not in previous:
                notify_clients(file)

            elif mtime != previous[file]:
                notify_clients(file)

        # deleted
        for file in previous:
            if file not in current:
                notify_clients(file)

        previous = current


class Handler(SimpleHTTPRequestHandler):

    def do_GET(self):

        # SSE endpoint
        if self.path == "/events":

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()

            q = queue.Queue()
            clients.append(q)

            print("Browser connected")

            try:
                while True:
                    filename = q.get()

                    message = f"data: {filename}\n\n"

                    self.wfile.write(message.encode())
                    self.wfile.flush()

            except (BrokenPipeError, ConnectionResetError):
                pass

            finally:
                clients.remove(q)
                print("Browser disconnected")

            return

        # normal static files
        super().do_GET()


if __name__ == "__main__":

    watcher = threading.Thread(
        target=watch_files,
        daemon=True
    )

    watcher.start()

    server = ThreadingHTTPServer(
        ("0.0.0.0", PORT),
        Handler
    )

    print(f"Server running:")
    print(f"http://localhost:{PORT}")

    server.serve_forever()
