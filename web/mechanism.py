"""
机构运动学 — 纯 Python，无 Web 依赖。

当前阶段：生长定义（初始状态设定）。
给定所有生长参数，计算各点世界坐标和坐标系变换。
连杆长度 L_link 由连线的两端点自动算出，不手动设定。
"""

import math

import numpy as np


# ============================================================
# 生长参数定义
# ============================================================

GROWTH_PARAMS = {
    "z0":    {"value": 36.0,  "min": 0,   "max": 80,  "unit": "mm",  "label": "base height",
              "step": 1, "desc": "沿 +Z 平移"},
    "L_cp":  {"value": 10.0,  "min": 1,   "max": 30,  "unit": "mm",  "label": "pivot offset",
              "step": 2, "desc": "沿 +X 平移"},
    "alpha": {"value": 45.0,  "min": 0,   "max": 180, "unit": "deg", "label": "arm angle",
              "step": 4, "desc": "arm 与局部 +Z 夹角"},
    "L_A":   {"value": 7.0,   "min": 1,   "max": 20,  "unit": "mm",  "label": "arm length",
              "step": 4, "desc": "pivot → arm 距离"},
    "L_B":   {"value": 14.0,  "min": 1,   "max": 30,  "unit": "mm",  "label": "bar span",
              "step": 5, "desc": "bar_upper ↔ bar_lower 距离"},
    "theta": {"value": 0.0,   "min": -90, "max": 90,  "unit": "deg", "label": "platform tilt",
              "step": 3, "desc": "绕 X 轴旋转"},
    "x_e":   {"value": 11.0,  "min": 0,   "max": 30,  "unit": "mm",  "label": "servo X",
              "step": 7, "desc": "舵机圆心 X"},
    "y_e":   {"value": 7.0,   "min": 0,   "max": 20,  "unit": "mm",  "label": "servo Y",
              "step": 7, "desc": "舵机圆心 Y（绝对值）"},
    "z_e":   {"value": 0.0,   "min": -20, "max": 20,  "unit": "mm",  "label": "servo Z",
              "step": 7, "desc": "舵机圆心 Z"},
    "R":     {"value": 16.0,  "min": 1,   "max": 30,  "unit": "mm",  "label": "servo radius",
              "step": 8, "desc": "舵机圆半径"},
    "beta1": {"value": 60.0,  "min": 0,   "max": 360, "unit": "deg", "label": "link_r angle",
              "step": 8, "desc": "右舵机初始角度"},
    "beta2": {"value": 120.0, "min": 0,   "max": 360, "unit": "deg", "label": "link_l angle",
              "step": 10, "desc": "左舵机初始角度"},
}

GROWTH_TREE = {
    "name": "world", "type": "frame", "children": [
        {"name": "base", "type": "frame", "step": 1,
         "relation": "translate +Z by z0",
         "params": ["z0"],
         "children": [
             {"name": "pivot", "type": "frame", "step": 2,
              "relation": "translate +X by L_cp",
              "params": ["L_cp"],
              "children": [
                  {"name": "platform", "type": "frame", "step": 3,
                   "relation": "rotate around X by theta",
                   "params": ["theta"],
                   "children": [
                       {"name": "arm", "type": "point", "step": 4,
                        "params": ["alpha", "L_A"]},
                       {"name": "bar_upper", "type": "point", "step": 5,
                        "params": ["L_B"]},
                       {"name": "bar_lower", "type": "point", "step": 6,
                        "params": ["L_B"]},
                   ]},
              ]},
         ]},
        {"name": "servo_r", "type": "frame", "step": 7,
         "relation": "translate to [x_e, +y_e, z_e]",
         "params": ["x_e", "y_e", "z_e"],
         "children": [
             {"name": "link_r", "type": "point", "step": 8,
              "relation": "on circle, radius R, angle beta1",
              "params": ["R", "beta1"]},
         ]},
        {"name": "servo_l", "type": "frame", "step": 9,
         "relation": "translate to [x_e, -y_e, z_e]",
         "params": ["x_e", "y_e", "z_e"],
         "children": [
             {"name": "link_l", "type": "point", "step": 10,
              "relation": "on circle, radius R, angle beta2",
              "params": ["R", "beta2"]},
         ]},
    ],
}

VIS_ELEMENTS = [
    {"id": "base_sphere",       "type": "sphere", "color": "#00cc44", "label": "base",      "radius": 1.5, "point": "base"},
    {"id": "pivot_sphere",      "type": "sphere", "color": "#0088ff", "label": "pivot",     "radius": 1.5, "point": "pivot"},
    {"id": "base_pivot_line",   "type": "line",   "color": "#888888", "dash": True, "from": "base", "to": "pivot"},
    {"id": "rot_axis",          "type": "line",   "color": "#00cccc", "dash": True,
     "from": "rot_axis_start", "to": "rot_axis_end"},
    {"id": "arm_sphere",        "type": "sphere", "color": "#ddaa00", "label": "arm",       "radius": 1.2, "point": "arm"},
    {"id": "bar_upper_sphere",  "type": "sphere", "color": "#ee3333", "label": "bar_upper", "radius": 1.5, "point": "bar_upper"},
    {"id": "bar_lower_sphere",  "type": "sphere", "color": "#ee3333", "label": "bar_lower", "radius": 1.5, "point": "bar_lower"},
    {"id": "bar_line",          "type": "line",   "color": "#aa00dd", "from": "bar_upper", "to": "bar_lower", "width": 3},
    {"id": "pivot_arm_line",    "type": "line",   "color": "#ff8800", "from": "pivot", "to": "arm"},
    {"id": "servo_r_circle",    "type": "circle", "color": "#00aaaa", "center": "servo_r", "radius_param": "R", "dash": True},
    {"id": "servo_l_circle",    "type": "circle", "color": "#aa00aa", "center": "servo_l", "radius_param": "R", "dash": True},
    {"id": "servo_r_sphere",    "type": "sphere", "color": "#333333", "label": "servo_r",   "radius": 1.0, "point": "servo_r"},
    {"id": "servo_l_sphere",    "type": "sphere", "color": "#333333", "label": "servo_l",   "radius": 1.0, "point": "servo_l"},
    {"id": "link_r_sphere",     "type": "sphere", "color": "#ff8800", "label": "link_r",    "radius": 1.5, "point": "link_r"},
    {"id": "link_l_sphere",     "type": "sphere", "color": "#ff8800", "label": "link_l",    "radius": 1.5, "point": "link_l"},
    {"id": "link_right_line",   "type": "line",   "color": "#ee3333", "from": "bar_upper", "to": "link_r", "width": 2},
    {"id": "link_left_line",    "type": "line",   "color": "#3366ee", "from": "bar_lower", "to": "link_l", "width": 2},
]

FRAME_NAMES = ["base", "pivot", "platform", "servo_r", "servo_l"]


# ============================================================
# 坐标计算
# ============================================================

def _rot_x(angle_rad: float) -> np.ndarray:
    c, s = math.cos(angle_rad), math.sin(angle_rad)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def compute(params: dict[str, float]) -> dict:
    """
    给定所有生长参数，计算初始状态的所有点坐标、坐标系变换、连杆长度。
    """
    z0    = params["z0"]
    L_cp  = params["L_cp"]
    L_A   = params["L_A"]
    L_B   = params["L_B"]
    theta = math.radians(params["theta"])
    alpha = math.radians(params["alpha"])
    x_e   = params["x_e"]
    y_e   = params["y_e"]
    z_e   = params["z_e"]
    R     = params["R"]
    beta1 = math.radians(params["beta1"])
    beta2 = math.radians(params["beta2"])

    # 固定点
    base_pos  = np.array([0.0, 0.0, z0])
    pivot_pos = np.array([L_cp, 0.0, z0])

    # 旋转子系统
    Rmat = _rot_x(theta)
    xA = L_A * math.sin(alpha)
    zA = L_A * math.cos(alpha)

    arm_local       = np.array([xA, 0.0, zA])
    bar_upper_local = np.array([xA,  L_B / 2, zA])
    bar_lower_local = np.array([xA, -L_B / 2, zA])

    arm_world       = pivot_pos + Rmat @ arm_local
    bar_upper_world = pivot_pos + Rmat @ bar_upper_local
    bar_lower_world = pivot_pos + Rmat @ bar_lower_local

    # 舵机
    servo_r_pos = np.array([x_e,  y_e, z_e])
    servo_l_pos = np.array([x_e, -y_e, z_e])

    link_r_pos = servo_r_pos + np.array([0, R * math.cos(beta1), R * math.sin(beta1)])
    link_l_pos = servo_l_pos + np.array([0, R * math.cos(beta2), R * math.sin(beta2)])

    # 旋转轴
    axis_half = 25
    rot_axis_start = pivot_pos + np.array([-axis_half, 0, 0])
    rot_axis_end   = pivot_pos + np.array([ axis_half, 0, 0])

    # 连杆长度（自动计算）
    L_link_r = float(np.linalg.norm(bar_upper_world - link_r_pos))
    L_link_l = float(np.linalg.norm(bar_lower_world - link_l_pos))

    points = {
        "origin":         [0.0, 0.0, 0.0],
        "base":           base_pos.tolist(),
        "pivot":          pivot_pos.tolist(),
        "arm":            arm_world.tolist(),
        "bar_upper":      bar_upper_world.tolist(),
        "bar_lower":      bar_lower_world.tolist(),
        "servo_r":        servo_r_pos.tolist(),
        "servo_l":        servo_l_pos.tolist(),
        "link_r":         link_r_pos.tolist(),
        "link_l":         link_l_pos.tolist(),
        "rot_axis_start": rot_axis_start.tolist(),
        "rot_axis_end":   rot_axis_end.tolist(),
    }

    I3 = np.eye(3).tolist()
    axes_platform = Rmat.T.tolist()

    frames = {
        "world":    {"origin": [0, 0, 0],             "axes": I3},
        "base":     {"origin": base_pos.tolist(),      "axes": I3},
        "pivot":    {"origin": pivot_pos.tolist(),     "axes": I3},
        "platform": {"origin": pivot_pos.tolist(),     "axes": axes_platform},
        "servo_r":  {"origin": servo_r_pos.tolist(),   "axes": I3},
        "servo_l":  {"origin": servo_l_pos.tolist(),   "axes": I3},
    }

    return {
        "points": points,
        "frames": frames,
        "link_lengths": {"right": round(L_link_r, 4), "left": round(L_link_l, 4)},
    }


def get_mechanism_definition() -> dict:
    """返回完整的机构定义"""
    return {
        "growth_params": GROWTH_PARAMS,
        "growth_tree": GROWTH_TREE,
        "visualization": VIS_ELEMENTS,
        "frame_names": FRAME_NAMES,
    }


if __name__ == "__main__":
    defaults = {k: v["value"] for k, v in GROWTH_PARAMS.items()}
    result = compute(defaults)

    print("=" * 50)
    print(f"L_link_right = {result['link_lengths']['right']:.4f} mm")
    print(f"L_link_left  = {result['link_lengths']['left']:.4f} mm")
    print("=" * 50)
    for name, coord in result["points"].items():
        print(f"  {name:20s} = [{coord[0]:8.3f}, {coord[1]:8.3f}, {coord[2]:8.3f}]")
