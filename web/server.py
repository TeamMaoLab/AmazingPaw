"""
FastAPI 服务 — 机构生长定义工具。

启动: uvicorn web.server:app --reload
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from web.mechanism import compute, get_mechanism_definition

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="Finger Mechanism Growth Tool")


class ComputeRequest(BaseModel):
    params: dict[str, float]


@app.get("/api/mechanism/default")
async def api_definition():
    """返回机构定义（生长参数规格 + 生长树 + 可视化元素）"""
    return get_mechanism_definition()


@app.post("/api/compute")
async def api_compute(req: ComputeRequest):
    """给定生长参数，计算所有点坐标、坐标系、连杆长度"""
    return compute(req.params)


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")
