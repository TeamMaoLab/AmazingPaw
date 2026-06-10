"""
机构运动学求解器 — 纯 Python，无 Web 依赖。

从 notebook cell 7 和 ref/b_pybullet_space_four_bar.py 提取，
封装为可被 FastAPI 或其他代码直接调用的模块。
"""

import math

import numpy as np
from scipy.optimize import fsolve


# ============================================================
# 参数定义（与 docs/growth_structure.md 一致）
# ============================================================

FIXED_PARAMS = {
    "z0":     {"value": 36.0,  "min": 0,   "max": 80,  "unit": "mm",  "label": "CPS/CPE 高度"},
    "L_cp":   {"value": 10.0,  "min": 1,   "max": 30,  "unit": "mm",  "label": "cp 线长度"},
    "L_A":    {"value": 7.0,   "min": 1,   "max": 20,  "unit": "mm",  "label": "CPE→A 距离"},
    "L_B":    {"value": 14.0,  "min": 1,   "max": 30,  "unit": "mm",  "label": "A+↔A- 距离"},
    "x_e":    {"value": 11.0,  "min": 0,   "max": 30,  "unit": "mm",  "label": "舵机圆心 X"},
    "y_e":    {"value": 7.0,   "min": 0,   "max": 20,  "unit": "mm",  "label": "舵机圆心 Y"},
    "z_e":    {"value": 0.0,   "min": -20, "max": 20,  "unit": "mm",  "label": "舵机圆心 Z"},
    "R":      {"value": 16.0,  "min": 1,   "max": 30,  "unit": "mm",  "label": "舵机圆半径"},
    "L_link": {"value": 28.4,  "min": 10,  "max": 50,  "unit": "mm",  "label": "连杆长度"},
}

ACTIVE_PARAMS = {
    "beta1": {"value": 60.0,  "min": 0, "max": 360, "unit": "deg", "label": "右舵机角度 β₁"},
    "beta2": {"value": 120.0, "min": 0, "max": 360, "unit": "deg", "label": "左舵机角度 β₂"},
}

GROWTH_TREE = {
    "name": "world", "type": "frame", "children": [
        {"name": "cps", "type": "frame", "step": 1,
         "relation": "translate +Z by z0",
         "children": [
             {"name": "cpe", "type": "frame", "step": 2,
              "relation": "translate +X by L_cp",
              "children": [
                  {"name": "rotated", "type": "frame", "step": 3,
                   "relation": "rotate around X by theta",
                   "children": [
                       {"name": "A",   "type": "point", "step": 4},
                       {"name": "A+",  "type": "point", "step": 5},
                       {"name": "A-",  "type": "point", "step": 6},
                   ]},
              ]},
         ]},
        {"name": "servo1", "type": "frame", "step": 7,
         "relation": "translate to [x_e, +y_e, z_e]",
         "children": [
             {"name": "P1", "type": "point", "step": 8},
         ]},
        {"name": "servo2", "type": "frame", "step": 9,
         "relation": "translate to [x_e, -y_e, z_e]",
         "children": [
             {"name": "P2", "type": "point", "step": 10},
         ]},
    ],
}

VIS_ELEMENTS = [
    {"id": "cps_sphere",     "type": "sphere", "color": "#00ff00", "label": "CPS",  "radius": 1.5, "point": "CPS"},
    {"id": "cpe_sphere",     "type": "sphere", "color": "#0088ff", "label": "CPE",  "radius": 1.5, "point": "CPE"},
    {"id": "cp_line",        "type": "line",   "color": "#888888", "dash": True, "from": "CPS", "to": "CPE"},
    {"id": "rot_axis",       "type": "line",   "color": "#00ffff", "dash": True,
     "from": "rot_axis_start", "to": "rot_axis_end"},
    {"id": "a_sphere",       "type": "sphere", "color": "#ffff00", "label": "A",   "radius": 1.2, "point": "A"},
    {"id": "a_plus_sphere",  "type": "sphere", "color": "#ff0000", "label": "A+",  "radius": 1.5, "point": "A+"},
    {"id": "a_minus_sphere", "type": "sphere", "color": "#ff0000", "label": "A-",  "radius": 1.5, "point": "A-"},
    {"id": "vert_line",      "type": "line",   "color": "#aa00ff", "from": "A+", "to": "A-", "width": 3},
    {"id": "oa_line",        "type": "line",   "color": "#ff8800", "from": "CPE", "to": "A"},
    {"id": "servo1_circle",  "type": "circle", "color": "#00ffff", "center": "servo1", "radius_param": "R"},
    {"id": "servo2_circle",  "type": "circle", "color": "#ff00ff", "center": "servo2", "radius_param": "R"},
    {"id": "p1_sphere",      "type": "sphere", "color": "#ff8800", "label": "P1",  "radius": 1.5, "point": "P1"},
    {"id": "p2_sphere",      "type": "sphere", "color": "#ff8800", "label": "P2",  "radius": 1.5, "point": "P2"},
    {"id": "link_right",     "type": "line",   "color": "#ff0000", "from": "A+", "to": "P1", "width": 2},
    {"id": "link_left",      "type": "line",   "color": "#0044ff", "from": "A-", "to": "P2", "width": 2},
]


# ============================================================
# 求解器
# ============================================================

def _rot_x(angle_rad: float) -> np.ndarray:
    """绕 X 轴的 3x3 旋转矩阵"""
    c, s = math.cos(angle_rad), math.sin(angle_rad)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def solve(
    fixed: dict[str, float],
    beta1_deg: float,
    beta2_deg: float,
    last_alpha: float = 0.8,
    last_theta: float = 0.0,
) -> dict:
    """
    正运动学求解：给定 β₁, β₂，求 α, θ。

    返回:
        {
            "success": bool,
            "alpha_deg": float, "theta_deg": float,
            "points": {name: [x, y, z], ...},
            "frames": {name: {"origin": [...], "axes": [[...],[...],[...]]}, ...},
            "link_lengths": {"right": float, "left": float},
        }
    """
    z0     = fixed["z0"]
    L_cp   = fixed["L_cp"]
    L_A    = fixed["L_A"]
    L_B    = fixed["L_B"]
    x_e    = fixed["x_e"]
    y_e    = fixed["y_e"]
    z_e    = fixed["z_e"]
    R      = fixed["R"]
    L_link = fixed["L_link"]

    beta1 = math.radians(beta1_deg)
    beta2 = math.radians(beta2_deg)

    CPS = np.array([0.0, 0.0, z0])
    CPE = np.array([L_cp, 0.0, z0])

    # 舵机圆上的点
    P1 = np.array([x_e,  y_e + R * math.cos(beta1), z_e + R * math.sin(beta1)])
    P2 = np.array([x_e, -y_e + R * math.cos(beta2), z_e + R * math.sin(beta2)])

    def equations(vars):
        alpha, theta = vars
        xA = L_A * math.sin(alpha)
        zA = L_A * math.cos(alpha)
        Rmat = _rot_x(theta)

        A_plus_local  = np.array([xA,  L_B / 2, zA])
        A_minus_local = np.array([xA, -L_B / 2, zA])

        A_plus  = CPE + Rmat @ A_plus_local
        A_minus = CPE + Rmat @ A_minus_local

        eq1 = np.linalg.norm(A_plus - P1) - L_link
        eq2 = np.linalg.norm(A_minus - P2) - L_link
        return [eq1, eq2]

    # 多初始值策略（来自 ref/b_pybullet_space_four_bar.py）
    guesses = [
        [last_alpha, last_theta],
        [0.8, 0.0],
        [1.2, 0.2],
        [0.5, -0.2],
        [1.0, 0.5],
    ]

    best_sol = None
    best_error = float("inf")

    for guess in guesses:
        try:
            sol, info, ier, _ = fsolve(equations, guess, xtol=1e-8, full_output=True)
            if ier != 1:
                continue
            alpha_rad, theta_rad = sol
            alpha_d = math.degrees(alpha_rad)
            theta_d = math.degrees(theta_rad)

            if not (0 <= alpha_d <= 180 and -90 <= theta_d <= 90):
                continue

            eq1, eq2 = equations(sol)
            error = abs(eq1) + abs(eq2)
            if error < best_error:
                best_error = error
                best_sol = (alpha_rad, theta_rad)
        except Exception:
            continue

    success = best_sol is not None and best_error < 0.005
    if not success:
        # 回退到上次有效值（如果有）
        if best_sol is None:
            alpha_rad, theta_rad = last_alpha, last_theta
        else:
            alpha_rad, theta_rad = best_sol
    else:
        alpha_rad, theta_rad = best_sol

    alpha_deg = math.degrees(alpha_rad)
    theta_deg = math.degrees(theta_rad)

    # 计算所有点的世界坐标
    Rmat = _rot_x(theta_rad)
    xA = L_A * math.sin(alpha_rad)
    zA = L_A * math.cos(alpha_rad)

    A_local      = np.array([xA, 0.0, zA])
    A_plus_local = np.array([xA,  L_B / 2, zA])
    A_minus_local = np.array([xA, -L_B / 2, zA])

    A_world      = CPE + Rmat @ A_local
    A_plus_world = CPE + Rmat @ A_plus_local
    A_minus_world = CPE + Rmat @ A_minus_local

    servo1_origin = np.array([x_e,  y_e, z_e])
    servo2_origin = np.array([x_e, -y_e, z_e])

    rot_axis_half = 25
    rot_axis_start = CPE + np.array([-rot_axis_half, 0, 0])
    rot_axis_end   = CPE + np.array([ rot_axis_half, 0, 0])

    points = {
        "origin":         [0.0, 0.0, 0.0],
        "CPS":            CPS.tolist(),
        "CPE":            CPE.tolist(),
        "A":              A_world.tolist(),
        "A+":             A_plus_world.tolist(),
        "A-":             A_minus_world.tolist(),
        "servo1":         servo1_origin.tolist(),
        "servo2":         servo2_origin.tolist(),
        "P1":             P1.tolist(),
        "P2":             P2.tolist(),
        "rot_axis_start": rot_axis_start.tolist(),
        "rot_axis_end":   rot_axis_end.tolist(),
    }

    # 坐标系变换
    I3 = np.eye(3).tolist()
    axes_rotated = Rmat.T.tolist()  # 旋转后的轴在世界坐标中的方向

    frames = {
        "world":   {"origin": [0, 0, 0],       "axes": I3},
        "cps":     {"origin": CPS.tolist(),     "axes": I3},
        "cpe":     {"origin": CPE.tolist(),     "axes": I3},
        "rotated": {"origin": CPE.tolist(),     "axes": axes_rotated},
        "servo1":  {"origin": servo1_origin.tolist(), "axes": I3},
        "servo2":  {"origin": servo2_origin.tolist(), "axes": I3},
    }

    link_right = float(np.linalg.norm(A_plus_world - P1))
    link_left  = float(np.linalg.norm(A_minus_world - P2))

    return {
        "success": bool(success),
        "alpha_deg": round(float(alpha_deg), 4),
        "theta_deg": round(float(theta_deg), 4),
        "points": points,
        "frames": frames,
        "link_lengths": {"right": round(float(link_right), 4), "left": round(float(link_left), 4)},
    }


def get_mechanism_definition() -> dict:
    """返回完整的机构定义（参数规格 + 生长树 + 可视化元素）"""
    return {
        "fixed_params": FIXED_PARAMS,
        "active_params": ACTIVE_PARAMS,
        "growth_tree": GROWTH_TREE,
        "visualization": VIS_ELEMENTS,
    }


# ============================================================
# 独立测试
# ============================================================

if __name__ == "__main__":
    defaults = {k: v["value"] for k, v in FIXED_PARAMS.items()}
    result = solve(defaults, beta1_deg=60.0, beta2_deg=120.0)

    print("=" * 50)
    print(f"success: {result['success']}")
    print(f"alpha = {result['alpha_deg']:.4f} deg")
    print(f"theta = {result['theta_deg']:.4f} deg")
    print(f"link_right = {result['link_lengths']['right']:.4f} mm")
    print(f"link_left  = {result['link_lengths']['left']:.4f} mm")
    print("=" * 50)
    for name, coord in result["points"].items():
        print(f"  {name:20s} = [{coord[0]:8.3f}, {coord[1]:8.3f}, {coord[2]:8.3f}]")
