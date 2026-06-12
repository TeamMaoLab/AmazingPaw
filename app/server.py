"""
Parametric Skeleton — FastAPI dev server.
Static file serving for local development.

Usage:
  uv run app/server.py
"""

import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import uvicorn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, 'static')

app = FastAPI()

# Static files — mounted at /static so existing import paths work unchanged
app.mount('/static', StaticFiles(directory=STATIC_DIR, html=True), name='static')


if __name__ == '__main__':
    print(f'Serving on http://localhost:8002')
    uvicorn.run(app, host='0.0.0.0', port=8002, log_level='warning')
