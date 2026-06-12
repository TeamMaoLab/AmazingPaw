# Hands — 机器人手指机构

[English](README.md) | 中文

**在线演示**: [https://amazing-paw.netlify.app/](https://amazing-paw.netlify.app/)

球连杆驱动的机械手指参数化 3D 骨架建模 + 运动学求解工具。

## 功能

- **设计模式** — 基于生长树的参数化编辑器，15 个参数，CAD 风格标注，双击内联编辑
- **网格模式** — β₁×β₂ 工作空间热力图，BFS 逐点求解，物理有效性过滤
- **逆运动学模式** — 3D 拖拽目标球，网格查表 IK 驱动机构跟随运动
- **追踪模式** — MediaPipe 手部追踪，指尖位移 → β 网格查表 → 实时驱动机构
- **工作空间曲面** — U 点（指尖）可达流形的 3D 可视化
- **数学面板** — KaTeX 渲染的 8 刚体数学模型 + SVG 拓扑图

## 快速开始

```bash
uv sync
uv run app/server.py
# → http://localhost:8002/static/index.html
```

## 架构

单页应用，无构建工具。FastAPI 开发服务器仅用于静态文件。参数通过 `localStorage` 持久化。

| 模块 | 职责 |
|------|------|
| `app/server.py` | FastAPI 开发服务器：仅静态文件 |
| `app/static/main.js` | 入口，异步初始化 |
| `app/static/defs.js` | 生长定义，15 个参数 |
| `app/static/scene-builder.js` | Three.js 场景生命周期 |
| `app/static/solver.js` | Newton-Raphson 求解器，网格计算 |
| `app/static/ik-solver.js` | 阻尼最小二乘逆运动学 |
| `app/static/mode-manager.js` | 设计 / 网格 / IK / 追踪四模式切换 |
| `app/static/grid-mode.js` | β₁×β₂ 热力图渲染 |
| `app/static/workspace.js` | U 工作空间曲面可视化 + 最近邻查找 |
| `app/static/ik-mode.js` | IK 拖拽交互（网格查表） |
| `app/static/hand-track-mode.js` | MediaPipe 手部追踪 → β 网格查表 → 驱动机构 |
| `app/static/math-drawer.js` | KaTeX 数学面板 + SVG 拓扑 |
| `app/static/ui.js` | 选择、hover、生长树 |
| `app/static/annotations.js` | CAD 标注 |
| `app/static/geometry.js` | Three.js 几何体工厂 |
| `app/static/state.js` | 共享状态 |

## 机构模型

8 个刚体，11 个关节（5 转动、4 球铰、2 舵机），2 自由度。
两个舵机（β₁, β₂）通过连杆驱动刚性臂。
被动变量（θ, ∠KAP）通过 Newton-Raphson 从杆长约束中求解。

## 文档

- `docs/rigid_body_math_model.md` — 8 体分解、约束方程、雅可比、自由度分析
- `docs/mechanism_math_model.md` — 6 体模型（参考）
- `CLAUDE.md` — 完整项目历史与开发指南

## License

MIT
