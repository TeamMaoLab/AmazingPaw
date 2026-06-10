"""
FastAPI 服务 — 机构运动学 Web 工具后端。

启动: uvicorn web.server:app --reload
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from web.mechanism import get_mechanism_definition, solve

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(title="Finger Mechanism Kinematics")


# ---- 请求/响应模型 ----

class SolveRequest(BaseModel):
    fixed_params: dict[str, float]
    active_params: dict[str, float]


# ---- API 端点 ----

@app.get("/api/mechanism/default")
async def api_mechanism_default():
    """返回机构定义（参数规格 + 生长树 + 可视化元素）"""
    return get_mechanism_definition()


@app.post("/api/solve")
async def api_solve(req: SolveRequest):
    """正运动学求解：给定 β₁, β₂ → 求 α, θ + 所有点坐标"""
    return solve(
        fixed=req.fixed_params,
        beta1_deg=req.active_params["beta1"],
        beta2_deg=req.active_params["beta2"],
    )


# ---- 静态文件 ----

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")
