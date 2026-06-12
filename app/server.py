"""
Parametric Skeleton — FastAPI dev server.
Static file serving + /api/params for parameter persistence.

Usage:
  uv run app/server.py
"""

import json
import os

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, 'static')
PARAMS_FILE = os.path.join(BASE_DIR, 'saved_params.json')

app = FastAPI()


@app.get('/api/params')
async def get_params():
    if os.path.exists(PARAMS_FILE):
        with open(PARAMS_FILE) as f:
            return json.load(f)
    return {}


@app.post('/api/params')
async def save_params(params: dict):
    with open(PARAMS_FILE, 'w') as f:
        json.dump(params, f, indent=2)
    return {'status': 'ok'}


# Static files — mounted at /static so existing import paths work unchanged
app.mount('/static', StaticFiles(directory=STATIC_DIR, html=True), name='static')


if __name__ == '__main__':
    print(f'Serving on http://localhost:8002')
    print(f'Params file: {PARAMS_FILE}')
    uvicorn.run(app, host='0.0.0.0', port=8002, log_level='warning')
        with open(PARAMS_FILE) as f:
            return json.load(f)
    return {}


@app.post('/api/params')
async def save_params(params: dict):
    with open(PARAMS_FILE, 'w') as f:
        json.dump(params, f, indent=2)
    return {'status': 'ok'}


# Static files — mounted at /static so existing import paths work unchanged
app.mount('/static', StaticFiles(directory=STATIC_DIR, html=True), name='static')


if __name__ == '__main__':
    print(f'Serving on http://localhost:8002')
    print(f'Params file: {PARAMS_FILE}')
    uvicorn.run(app, host='0.0.0.0', port=8002, log_level='warning')
