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
              "step": 4, "desc": "A 与局部 +Z 夹角"},
    "L_A":   {"value": 7.0,   "min": 1,   "max": 20,  "unit": "mm",  "label": "arm length",
              "step": 4, "desc": "P → A 距离"},
    "gamma": {"value": -5.0,  "min": -180, "max": 180, "unit": "deg", "label": "proximal angle",
              "step": 5, "desc": "Q 与局部 +Z 夹角"},
    "L_Q":   {"value": 55.0,  "min": 1,   "max": 100, "unit": "mm",  "label": "proximal length",
              "step": 5, "desc": "P → Q 距离"},
    "L_U":   {"value": 55.0,  "min": 1,   "max": 100, "unit": "mm",  "label": "upright length",
              "step": 6, "desc": "P 沿局部 +Z 距离"},
    "L_T":   {"value": 40.0,  "min": 1,   "max": 100, "unit": "mm",  "label": "tip length",
              "step": 7, "desc": "U → T 距离"},
    "L_B":   {"value": 14.0,  "min": 1,   "max": 30,  "unit": "mm",  "label": "bar span",
              "step": 8, "desc": "R ↔ L 距离"},
    "theta": {"value": 0.0,   "min": -90, "max": 90,  "unit": "deg", "label": "rocker tilt",
              "step": 3, "desc": "绕 X 轴旋转"},
    "x_e":   {"value": 11.0,  "min": 0,   "max": 30,  "unit": "mm",  "label": "servo X",
              "step": 10, "desc": "舵机圆心 X"},
    "y_e":   {"value": 7.0,   "min": 0,   "max": 20,  "unit": "mm",  "label": "servo Y",
              "step": 10, "desc": "舵机圆心 Y（绝对值）"},
    "z_e":   {"value": 0.0,   "min": -20, "max": 20,  "unit": "mm",  "label": "servo Z",
              "step": 10, "desc": "舵机圆心 Z"},
    "R":     {"value": 16.0,  "min": 1,   "max": 30,  "unit": "mm",  "label": "servo radius",
              "step": 11, "desc": "舵机圆半径"},
    "beta1": {"value": 60.0,  "min": 0,   "max": 360, "unit": "deg", "label": "D angle",
              "step": 11, "desc": "右舵机初始角度"},
    "beta2": {"value": 120.0, "min": 0,   "max": 360, "unit": "deg", "label": "F angle",
              "step": 13, "desc": "左舵机初始角度"},
}

GROWTH_TREE = {
    "name": "world", "type": "frame", "children": [
        {"name": "B", "type": "frame", "step": 1,
         "relation": "translate +Z by z0",
         "params": ["z0"],
         "children": [
             {"name": "P", "type": "frame", "step": 2,
              "relation": "translate +X by L_cp",
              "params": ["L_cp"],
              "children": [
                  {"name": "Rk", "type": "frame", "step": 3,  # rocker frame, P 点旋转后的坐标系
                   "relation": "rotate around X by theta",
                   "params": ["theta"],
                   "children": [
                       {"name": "A", "type": "point", "step": 4,
                        "params": ["alpha", "L_A"]},
                       {"name": "Q", "type": "point", "step": 5,
                        "params": ["gamma", "L_Q"]},
                       {"name": "U", "type": "point", "step": 6,
                        "params": ["L_U"]},
                       {"name": "T", "type": "point", "step": 7,
                        "params": ["L_T"]},
                       {"name": "R", "type": "point", "step": 8,
                        "params": ["L_B"]},
                       {"name": "L", "type": "point", "step": 9,
                        "params": ["L_B"]},
                   ]},
              ]},
         ]},
        {"name": "C", "type": "frame", "step": 10,
         "relation": "translate to [x_e, +y_e, z_e]",
         "params": ["x_e", "y_e", "z_e"],
         "children": [
             {"name": "D", "type": "point", "step": 11,
              "relation": "on circle, radius R, angle beta1",
              "params": ["R", "beta1"]},
         ]},
        {"name": "E", "type": "frame", "step": 12,
         "relation": "translate to [x_e, -y_e, z_e]",
         "params": ["x_e", "y_e", "z_e"],
         "children": [
             {"name": "F", "type": "point", "step": 13,
              "relation": "on circle, radius R, angle beta2",
              "params": ["R", "beta2"]},
         ]},
    ],
}

VIS_ELEMENTS = [
    # ── reference (dot line, light grey) ──
    {"id": "BP_line",          "type": "line",   "color": "#cccccc", "style": "ref",
     "from": "B", "to": "P"},
    {"id": "rot_axis",         "type": "line",   "color": "#cccccc", "style": "ref",
     "from": "rot_axis_start", "to": "rot_axis_end"},
    {"id": "C_circle",          "type": "circle", "color": "#cccccc", "center": "C", "radius_param": "R", "style": "ref"},
    {"id": "E_circle",          "type": "circle", "color": "#cccccc", "center": "E", "radius_param": "R", "style": "ref"},

    # ── spheres ──
    {"id": "B_sphere",         "type": "sphere", "color": "#e8a020", "label": "B",  "radius": 1.5, "point": "B"},
    {"id": "P_sphere",         "type": "sphere", "color": "#e8a020", "label": "P",  "radius": 1.5, "point": "P"},
    {"id": "A_sphere",         "type": "sphere", "color": "#e8a020", "label": "A",  "radius": 1.2, "point": "A"},
    {"id": "Q_sphere",         "type": "sphere", "color": "#e8a020", "label": "Q",  "radius": 1.5, "point": "Q"},
    {"id": "U_sphere",         "type": "sphere", "color": "#e8a020", "label": "U",  "radius": 1.5, "point": "U"},
    {"id": "T_sphere",         "type": "sphere", "color": "#e8a020", "label": "T",  "radius": 1.2, "point": "T"},
    {"id": "R_sphere",         "type": "sphere", "color": "#e8a020", "label": "R",  "radius": 1.5, "point": "R"},
    {"id": "L_sphere",         "type": "sphere", "color": "#e8a020", "label": "L",  "radius": 1.5, "point": "L"},
    {"id": "C_sphere",         "type": "sphere", "color": "#e8a020", "label": "C",  "radius": 1.0, "point": "C"},
    {"id": "E_sphere",         "type": "sphere", "color": "#e8a020", "label": "E",  "radius": 1.0, "point": "E"},
    {"id": "D_sphere",         "type": "sphere", "color": "#e8a020", "label": "D",  "radius": 1.5, "point": "D"},
    {"id": "F_sphere",         "type": "sphere", "color": "#e8a020", "label": "F",  "radius": 1.5, "point": "F"},

    # ── active (solid) ──
    {"id": "PA_line",          "type": "line",   "color": "#c88800", "from": "P", "to": "A"},
    {"id": "PQ_line",          "type": "line",   "color": "#c88800", "from": "P", "to": "Q"},
    {"id": "PU_line",          "type": "line",   "color": "#c88800", "from": "P", "to": "U"},
    {"id": "UT_line",          "type": "line",   "color": "#c88800", "from": "U", "to": "T"},
    {"id": "RL_line",          "type": "line",   "color": "#c88800", "from": "R", "to": "L"},

    # ── passive (short dash) ──
    {"id": "QU_line",          "type": "line",   "color": "#d4b870", "style": "passive", "from": "Q", "to": "U"},
    {"id": "QT_line",          "type": "line",   "color": "#d4b870", "style": "passive", "from": "Q", "to": "T"},
    {"id": "AQ_line",          "type": "line",   "color": "#d4b870", "style": "passive", "from": "A", "to": "Q"},
    {"id": "RD_line",          "type": "line",   "color": "#d4b870", "style": "passive", "from": "R", "to": "D"},
    {"id": "LF_line",          "type": "line",   "color": "#d4b870", "style": "passive", "from": "L", "to": "F"},
]

FRAME_NAMES = ["B", "P", "Rk", "C", "E"]  # Rk = P 点 rocker 坐标系（随 θ 旋转）

RIGID_BODIES = [
    {"name": "arm", "label": "drive arm", "points": ["P", "A", "Q", "R", "L"],
     "faces": [["P", "A", "Q"]], "edges": [["R", "L"]],
     "color": "#4488cc"},
    {"name": "link", "label": "upright link", "points": ["P", "U"], "color": "#44aa66"},
    {"name": "plate", "label": "finger plate", "points": ["T", "U", "Q"], "color": "#cc6644"},
    {"name": "rod_r", "label": "right rod", "points": ["R", "D"], "color": "#888888"},
    {"name": "rod_l", "label": "left rod", "points": ["L", "F"], "color": "#888888"},
    {"name": "base", "label": "base", "points": ["B"], "color": "#888888"},
    {"name": "servo_r", "label": "right servo horn", "points": ["C", "D"], "color": "#aa44aa"},
    {"name": "servo_l", "label": "left servo horn", "points": ["E", "F"], "color": "#aa44aa"},
]

JOINTS = [
    # ── P点：三体共轴 (base/arm/link) ──
    {"name": "j_b", "type": "revolute", "bodies": ["base", "arm"], "point": "P", "axis": "X", "desc": "base-arm at P (X-axis, bearing at B)"},
    {"name": "j_p", "type": "revolute", "bodies": ["arm", "link"], "point": "P", "axis": "Y", "desc": "arm-link at P (Y-axis)"},
    # ── revolute (arm-link-plate 三角闭环) ──
    {"name": "j_u", "type": "revolute", "bodies": ["link", "plate"], "point": "U", "axis": "Y", "desc": "link-plate at U"},
    {"name": "j_q", "type": "revolute", "bodies": ["plate", "arm"], "point": "Q", "axis": "Y", "desc": "plate-arm at Q"},
    # ── revolute (servo rotation at C/E) ──
    {"name": "j_cr", "type": "revolute", "bodies": ["servo_r"], "point": "C", "axis": "X", "desc": "servo_r rotates at C"},
    {"name": "j_el", "type": "revolute", "bodies": ["servo_l"], "point": "E", "axis": "X", "desc": "servo_l rotates at E"},
    # ── ball joint (servo ↔ rod) ──
    {"name": "j_dr", "type": "ball", "bodies": ["servo_r", "rod_r"], "point": "D", "desc": "servo_r-rod_r at D"},
    {"name": "j_fl", "type": "ball", "bodies": ["servo_l", "rod_l"], "point": "F", "desc": "servo_l-rod_l at F"},
    # ── ball joint (rod ↔ arm) ──
    {"name": "j_rr", "type": "ball", "bodies": ["rod_r", "arm"], "point": "R", "desc": "rod_r-arm at R"},
    {"name": "j_rl", "type": "ball", "bodies": ["rod_l", "arm"], "point": "L", "desc": "rod_l-arm at L"},
]


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
    L_Q   = params["L_Q"]
    L_U   = params["L_U"]
    L_T   = params["L_T"]
    L_B   = params["L_B"]
    theta = math.radians(params["theta"])
    alpha = math.radians(params["alpha"])
    gamma = math.radians(params["gamma"])
    x_e   = params["x_e"]
    y_e   = params["y_e"]
    z_e   = params["z_e"]
    R     = params["R"]
    beta1 = math.radians(params["beta1"])
    beta2 = math.radians(params["beta2"])

    # 固定点（B: 轴承座, P: 三体共轴点，在旋转轴线上位置不变）
    B_pos = np.array([0.0, 0.0, z0])
    P_pos = np.array([L_cp, 0.0, z0])

    # 摇臂旋转（轴承在 B，通过 BP 传动到 P，绕 X 轴旋转 θ）
    Rmat = _rot_x(theta)
    xA = L_A * math.sin(alpha)
    zA = L_A * math.cos(alpha)

    A_local  = np.array([xA, 0.0, zA])
    xQ = L_Q * math.sin(gamma)
    zQ = L_Q * math.cos(gamma)
    Q_local  = np.array([xQ, 0.0, zQ])
    U_local  = np.array([0.0, 0.0, L_U])
    T_local  = np.array([0.0, 0.0, L_U + L_T])
    R_local  = np.array([xA,  L_B / 2, zA])
    L_local  = np.array([xA, -L_B / 2, zA])

    A_world = P_pos + Rmat @ A_local
    Q_world = P_pos + Rmat @ Q_local
    U_world = P_pos + Rmat @ U_local
    T_world = P_pos + Rmat @ T_local
    R_world = P_pos + Rmat @ R_local
    L_world = P_pos + Rmat @ L_local

    # 舵机
    C_pos = np.array([x_e,  y_e, z_e])
    E_pos = np.array([x_e, -y_e, z_e])

    D_pos = C_pos + np.array([0, R * math.cos(beta1), R * math.sin(beta1)])
    F_pos = E_pos + np.array([0, R * math.cos(beta2), R * math.sin(beta2)])

    # 旋转轴
    axis_half = 25
    rot_axis_start = P_pos + np.array([-axis_half, 0, 0])
    rot_axis_end   = P_pos + np.array([ axis_half, 0, 0])

    # 连杆长度（自动计算）
    L_link_r = float(np.linalg.norm(R_world - D_pos))
    L_link_l = float(np.linalg.norm(L_world - F_pos))

    points = {
        "origin":         [0.0, 0.0, 0.0],
        "B":              B_pos.tolist(),
        "P":              P_pos.tolist(),
        "A":              A_world.tolist(),
        "Q":              Q_world.tolist(),
        "U":              U_world.tolist(),
        "T":              T_world.tolist(),
        "R":              R_world.tolist(),
        "L":              L_world.tolist(),
        "C":              C_pos.tolist(),
        "E":              E_pos.tolist(),
        "D":              D_pos.tolist(),
        "F":              F_pos.tolist(),
        "rot_axis_start": rot_axis_start.tolist(),
        "rot_axis_end":   rot_axis_end.tolist(),
    }

    I3 = np.eye(3).tolist()
    axes_rocker = Rmat.T.tolist()

    frames = {
        "world": {"origin": [0, 0, 0],             "axes": I3},
        "B":     {"origin": B_pos.tolist(),          "axes": I3},
        "P":     {"origin": P_pos.tolist(),           "axes": I3},
        "Rk":    {"origin": P_pos.tolist(),           "axes": axes_rocker},
        "C":     {"origin": C_pos.tolist(),           "axes": I3},
        "E":     {"origin": E_pos.tolist(),           "axes": I3},
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
        "rigid_bodies": RIGID_BODIES,
        "joints": JOINTS,
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
