import pybullet as p
import pybullet_data
import numpy as np
import time
import math
from scipy.optimize import fsolve

# ============================================================
# 系统固定参数（设计值：mm，运行时转换为 m）
# ============================================================
SCALE = 0.001  # mm → m

# 世界坐标系固定点
z0 = 36.0 * SCALE
L_cp = 10.0 * SCALE
CPS = np.array([0.0, 0.0, z0])
CPE = np.array([L_cp, 0.0, z0])

# 旋转子系统内部固定几何
L_A = 7.0 * SCALE
L_B = 14.0 * SCALE

# 舵机圆固定参数
x_e = 11.0 * SCALE
y_e = 7.0 * SCALE
z_e = 0.0 * SCALE
R = 16.0 * SCALE

# 固定连杆长度
L_link = 28.4 * SCALE

# 角度合理范围
ALPHA_MIN_DEG = 0.0
ALPHA_MAX_DEG = 180.0
THETA_MIN_DEG = -90.0
THETA_MAX_DEG = 90.0

# ============================================================
# 求解器：给定 β₁, β₂，求解 α, θ
# ============================================================

# 存储上一个有效解
last_valid_solution = {"alpha": 0.8, "theta": 0.0, "beta1": 60.0, "beta2": 120.0}

def is_angle_valid(alpha_deg, theta_deg):
    """检查角度是否在合理范围内"""
    return (ALPHA_MIN_DEG <= alpha_deg <= ALPHA_MAX_DEG and 
            THETA_MIN_DEG <= theta_deg <= THETA_MAX_DEG)

def solve_alpha_theta(beta1_deg, beta2_deg):
    """
    根据舵机角度求解子系统角度
    返回: (alpha_rad, theta_rad, success)
    """
    global last_valid_solution
    
    beta1 = math.radians(beta1_deg)
    beta2 = math.radians(beta2_deg)
    
    # 计算舵机点位置
    P1 = np.array([x_e, y_e + R * math.cos(beta1), z_e + R * math.sin(beta1)])
    P2 = np.array([x_e, -y_e + R * math.cos(beta2), z_e + R * math.sin(beta2)])
    
    def equations(vars):
        alpha, theta = vars
        xA = L_A * math.sin(alpha)
        zA = L_A * math.cos(alpha)
        
        Rmat = np.array([
            [1, 0, 0],
            [0, math.cos(theta), -math.sin(theta)],
            [0, math.sin(theta), math.cos(theta)]
        ])
        
        A_plus_local = np.array([xA, L_B/2, zA])
        A_plus = CPE + Rmat @ A_plus_local
        A_minus_local = np.array([xA, -L_B/2, zA])
        A_minus = CPE + Rmat @ A_minus_local
        
        eq1 = np.linalg.norm(A_plus - P1) - L_link
        eq2 = np.linalg.norm(A_minus - P2) - L_link
        return [eq1, eq2]
    
    # 使用上一个有效解作为初始猜测
    initial_guess = [last_valid_solution["alpha"], last_valid_solution["theta"]]
    
    # 尝试多种初始猜测
    guesses = [
        initial_guess,
        [0.8, 0.0],      # alpha≈45°, theta=0°
        [1.2, 0.2],      # alpha≈70°, theta≈10°
        [0.5, -0.2],     # alpha≈30°, theta≈-10°
        [1.0, 0.5],      # alpha≈57°, theta≈30°
    ]
    
    best_sol = None
    best_error = float('inf')
    
    for guess in guesses:
        try:
            sol, info, ier, mesg = fsolve(equations, guess, xtol=1e-8, full_output=True)
            if ier == 1:  # 成功收敛
                alpha_rad, theta_rad = sol
                alpha_deg = math.degrees(alpha_rad)
                theta_deg = math.degrees(theta_rad)
                
                # 检查范围
                if is_angle_valid(alpha_deg, theta_deg):
                    # 验证解的精度
                    eq1, eq2 = equations(sol)
                    error = abs(eq1) + abs(eq2)
                    if error < best_error:
                        best_error = error
                        best_sol = (alpha_rad, theta_rad)
        except:
            continue
    
    if best_sol is not None and best_error < 0.005:  # 误差小于5mm（已转为米）
        alpha_rad, theta_rad = best_sol
        last_valid_solution = {
            "alpha": alpha_rad,
            "theta": theta_rad,
            "beta1": beta1_deg,
            "beta2": beta2_deg
        }
        return alpha_rad, theta_rad, True
    else:
        # 返回上一个有效解
        print(f"⚠️ 警告: β₁={beta1_deg}°, β₂={beta2_deg}° 无有效解，使用上一个有效值")
        return last_valid_solution["alpha"], last_valid_solution["theta"], False

# ============================================================
# 初始化 PyBullet
# ============================================================

physicsClient = p.connect(p.GUI)
p.setAdditionalSearchPath(pybullet_data.getDataPath())
p.setGravity(0, 0, -9.8)
p.configureDebugVisualizer(p.COV_ENABLE_GUI, 1)

# 加载地面（半透明）
planeId = p.loadURDF("plane.urdf")
p.changeVisualShape(planeId, -1, rgbaColor=[0.5, 0.5, 0.5, 0.3])

# 设置相机（自动拉远到合适距离）
p.resetDebugVisualizerCamera(
    cameraDistance=0.12,
    cameraYaw=45,
    cameraPitch=-30,
    cameraTargetPosition=[0.02, 0, 0.02]
)

# ============================================================
# 创建调试滑块（参数控制）
# ============================================================

beta1_slider = p.addUserDebugParameter("β₁ (右舵机角度, 度)", 0, 360, 60)
beta2_slider = p.addUserDebugParameter("β₂ (左舵机角度, 度)", 0, 360, 120)

# ============================================================
# 创建静态视觉元素
# ============================================================

# 世界坐标轴
axis_len = 0.05  # 5 cm
p.addUserDebugLine([0,0,0], [axis_len,0,0], [1,0,0], 2)
p.addUserDebugLine([0,0,0], [0,axis_len,0], [0,1,0], 2)
p.addUserDebugLine([0,0,0], [0,0,axis_len], [0,0,1], 2)
p.addUserDebugText("X", [axis_len,0,0], [1,0,0], 0.5)
p.addUserDebugText("Y", [0,axis_len,0], [0,1,0], 0.5)
p.addUserDebugText("Z", [0,0,axis_len], [0,0,1], 0.5)

# CPS 和 CPE
cps_vis = p.createVisualShape(p.GEOM_SPHERE, radius=0.002, rgbaColor=[0,1,0,1])
cpe_vis = p.createVisualShape(p.GEOM_SPHERE, radius=0.002, rgbaColor=[0,0,1,1])
p.createMultiBody(baseMass=0, baseVisualShapeIndex=cps_vis, basePosition=CPS)
p.createMultiBody(baseMass=0, baseVisualShapeIndex=cpe_vis, basePosition=CPE)
p.addUserDebugText("CPS", CPS + [0,0,0.005], [0,1,0], 0.5)
p.addUserDebugText("CPE", CPE + [0,0,0.005], [0,0,1], 0.5)
p.addUserDebugLine(CPS, CPE, [0.5,0.5,0.5], 1)

# 辅助函数：绘制圆环
def draw_circle(center, radius, color, line_width=1):
    for i in range(60):
        angle1 = 2 * math.pi * i / 60
        angle2 = 2 * math.pi * (i+1) / 60
        x = center[0]
        y1 = center[1] + radius * math.cos(angle1)
        z1 = center[2] + radius * math.sin(angle1)
        y2 = center[1] + radius * math.cos(angle2)
        z2 = center[2] + radius * math.sin(angle2)
        p.addUserDebugLine([x, y1, z1], [x, y2, z2], color, line_width)

# 舵机圆
draw_circle([x_e,  y_e, z_e], R, [0,1,1], 1)
draw_circle([x_e, -y_e, z_e], R, [1,0,1], 1)

# 舵机圆心
center_vis = p.createVisualShape(p.GEOM_SPHERE, radius=0.0015, rgbaColor=[0,0,0,1])
p.createMultiBody(baseMass=0, baseVisualShapeIndex=center_vis, basePosition=[x_e,  y_e, z_e])
p.createMultiBody(baseMass=0, baseVisualShapeIndex=center_vis, basePosition=[x_e, -y_e, z_e])

# ============================================================
# 创建动态物体
# ============================================================

a_plus_vis = p.createVisualShape(p.GEOM_SPHERE, radius=0.002, rgbaColor=[1,0,0,1])
a_minus_vis = p.createVisualShape(p.GEOM_SPHERE, radius=0.002, rgbaColor=[1,0,0,1])
a_vis = p.createVisualShape(p.GEOM_SPHERE, radius=0.0015, rgbaColor=[1,1,0,1])
p1_vis = p.createVisualShape(p.GEOM_SPHERE, radius=0.002, rgbaColor=[1,0.5,0,1])
p2_vis = p.createVisualShape(p.GEOM_SPHERE, radius=0.002, rgbaColor=[1,0.5,0,1])

a_plus_id = p.createMultiBody(baseMass=0, baseVisualShapeIndex=a_plus_vis, basePosition=[0,0,0])
a_minus_id = p.createMultiBody(baseMass=0, baseVisualShapeIndex=a_minus_vis, basePosition=[0,0,0])
a_id = p.createMultiBody(baseMass=0, baseVisualShapeIndex=a_vis, basePosition=[0,0,0])
p1_id = p.createMultiBody(baseMass=0, baseVisualShapeIndex=p1_vis, basePosition=[0,0,0])
p2_id = p.createMultiBody(baseMass=0, baseVisualShapeIndex=p2_vis, basePosition=[0,0,0])

# ============================================================
# 主循环
# ============================================================

print("\n" + "="*60)
print("PyBullet 仿真已启动（单位：米）")
print("="*60)
print(f"机构尺寸范围: X≈{L_cp + L_A + R:.3f}m, Y≈{y_e + R:.3f}m, Z≈{z0 + L_A:.3f}m")
print("在窗口中拖动滑块 'β₁' 和 'β₂' 即可控制舵机角度")
print(f"α 有效范围: {ALPHA_MIN_DEG}° ~ {ALPHA_MAX_DEG}°")
print(f"θ 有效范围: {THETA_MIN_DEG}° ~ {THETA_MAX_DEG}°")
print("当角度超出范围或求解失败时，系统会保持上一个有效位置")
print("关闭窗口即可退出")
print("="*60 + "\n")

line_ids = []
text_id = None
last_print_time = time.time()

try:
    while p.isConnected():
        # 读取滑块值
        beta1_deg = p.readUserDebugParameter(beta1_slider)
        beta2_deg = p.readUserDebugParameter(beta2_slider)
        
        # 求解 α, θ
        alpha_rad, theta_rad, success = solve_alpha_theta(beta1_deg, beta2_deg)
        alpha_deg = math.degrees(alpha_rad)
        theta_deg = math.degrees(theta_rad)
        
        # 计算各点位置
        xA = L_A * math.sin(alpha_rad)
        zA = L_A * math.cos(alpha_rad)
        
        Rmat = np.array([
            [1, 0, 0],
            [0, math.cos(theta_rad), -math.sin(theta_rad)],
            [0, math.sin(theta_rad), math.cos(theta_rad)]
        ])
        
        A_plus_local = np.array([xA, L_B/2, zA])
        A_plus = CPE + Rmat @ A_plus_local
        
        A_minus_local = np.array([xA, -L_B/2, zA])
        A_minus = CPE + Rmat @ A_minus_local
        
        A_local = np.array([xA, 0, zA])
        A = CPE + Rmat @ A_local
        
        beta1_rad = math.radians(beta1_deg)
        beta2_rad = math.radians(beta2_deg)
        P1 = np.array([x_e, y_e + R * math.cos(beta1_rad), z_e + R * math.sin(beta1_rad)])
        P2 = np.array([x_e, -y_e + R * math.cos(beta2_rad), z_e + R * math.sin(beta2_rad)])
        
        # 更新球体位置
        p.resetBasePositionAndOrientation(a_plus_id, A_plus, [0,0,0,1])
        p.resetBasePositionAndOrientation(a_minus_id, A_minus, [0,0,0,1])
        p.resetBasePositionAndOrientation(a_id, A, [0,0,0,1])
        p.resetBasePositionAndOrientation(p1_id, P1, [0,0,0,1])
        p.resetBasePositionAndOrientation(p2_id, P2, [0,0,0,1])
        
        # 更新连线
        for line_id in line_ids:
            p.removeUserDebugItem(line_id)
        line_ids = []
        line_ids.append(p.addUserDebugLine(A_plus, P1, [1,0,0], 2))
        line_ids.append(p.addUserDebugLine(A_minus, P2, [0,0,1], 2))
        line_ids.append(p.addUserDebugLine(A_plus, A_minus, [0.5,0,0.5], 3))
        line_ids.append(p.addUserDebugLine(CPE, A, [1,0.5,0], 2))
        
        # 更新文字信息
        if text_id:
            p.removeUserDebugItem(text_id)
        text_pos = [L_cp - 0.005, -0.02, z0 + 0.03]
        status = "✓" if success else "⚠️ (保持上次)"
        info_text = f"β₁ = {beta1_deg:.0f}°\nβ₂ = {beta2_deg:.0f}°\nα = {alpha_deg:.0f}°\nθ = {theta_deg:.0f}°\n{status}"
        text_id = p.addUserDebugText(info_text, text_pos, [1,1,1], 0.8)
        
        # 每秒打印一次状态
        if time.time() - last_print_time > 1.0:
            if success:
                print(f"β₁={beta1_deg:.1f}°, β₂={beta2_deg:.1f}° → α={alpha_deg:.1f}°, θ={theta_deg:.1f}°")
            else:
                print(f"⚠️ β₁={beta1_deg:.1f}°, β₂={beta2_deg:.1f}° 无解，保持 α={alpha_deg:.1f}°, θ={theta_deg:.1f}°")
            last_print_time = time.time()
        
        time.sleep(0.02)
        
except KeyboardInterrupt:
    print("\n用户中断")
finally:
    if p.isConnected():
        p.disconnect()
        print("已断开连接")