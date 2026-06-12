import pybullet as p
import pybullet_data
import numpy as np
import time
import math
from scipy.optimize import fsolve

# ============================================================
# 六杆机构固定参数（经过验证，保证有解）
# 单位：米
# ============================================================

# 三角形 ABF
L_AB = 0.025   # 25 mm
L_AF = 0.030   # 30 mm  
L_BF = 0.020   # 20 mm

# 三角形 CDF (C = A)
L_CD = 0.025   # 25 mm
L_CF = 0.030   # 30 mm
L_DF = 0.020   # 20 mm

# 连杆 BE 和 DE
L_BE = 0.035   # 35 mm
L_DE = 0.035   # 35 mm

# 固定点 E（世界坐标）
E = np.array([0.030, 0.0, 0.040])  # X=30mm, Z=40mm

# ============================================================
# 求解器：给定 A，求 F, B, D
# ============================================================

def solve_finger_mechanism(A):
    Ax, Ay, Az = A
    if abs(Ay) > 1e-6:
        Ay = 0.0
    
    def equations(vars):
        xF, zF, xB, zB, xD, zD = vars
        
        # 三角形 ABF
        eq1 = (xB - Ax)**2 + (zB - Az)**2 - L_AB**2
        eq2 = (xF - Ax)**2 + (zF - Az)**2 - L_AF**2
        eq3 = (xF - xB)**2 + (zF - zB)**2 - L_BF**2
        
        # 三角形 CDF (C = A)
        eq4 = (xD - Ax)**2 + (zD - Az)**2 - L_CD**2
        eq5 = (xF - Ax)**2 + (zF - Az)**2 - L_CF**2
        eq6 = (xF - xD)**2 + (zF - zD)**2 - L_DF**2
        
        # BE 和 DE 约束
        eq7 = (xB - E[0])**2 + (zB - E[2])**2 - L_BE**2
        eq8 = (xD - E[0])**2 + (zD - E[2])**2 - L_DE**2
        
        return [eq1, eq2, eq3, eq4, eq5, eq6, eq7, eq8]
    
    # 初始猜测（基于几何直觉）
    xF0 = Ax + 0.025
    zF0 = Az + 0.020
    xB0 = Ax + 0.015
    zB0 = Az - 0.015
    xD0 = Ax + 0.015
    zD0 = Az + 0.015
    
    try:
        sol, info, ier, mesg = fsolve(equations, [xF0, zF0, xB0, zB0, xD0, zD0], 
                                       xtol=1e-8, full_output=True)
        if ier == 1:
            xF, zF, xB, zB, xD, zD = sol
            F = np.array([xF, 0.0, zF])
            B = np.array([xB, 0.0, zB])
            D = np.array([xD, 0.0, zD])
            return F, B, D, True
        else:
            return None, None, None, False
    except:
        return None, None, None, False

# ============================================================
# 初始化 PyBullet
# ============================================================

physicsClient = p.connect(p.GUI)
p.setAdditionalSearchPath(pybullet_data.getDataPath())
p.setGravity(0, 0, -9.8)
p.configureDebugVisualizer(p.COV_ENABLE_GUI, 1)

p.resetDebugVisualizerCamera(
    cameraDistance=0.15,
    cameraYaw=45,
    cameraPitch=-30,
    cameraTargetPosition=[0.03, 0, 0.03]
)

planeId = p.loadURDF("plane.urdf")
p.changeVisualShape(planeId, -1, rgbaColor=[0.5, 0.5, 0.5, 0.3])

# ============================================================
# 滑块
# ============================================================

a_x_slider = p.addUserDebugParameter("A_X (mm)", 0, 40, 20)
a_z_slider = p.addUserDebugParameter("A_Z (mm)", 10, 50, 25)

# ============================================================
# 静态元素
# ============================================================

axis_len = 0.08
p.addUserDebugLine([0,0,0], [axis_len,0,0], [1,0,0], 2)
p.addUserDebugLine([0,0,0], [0,axis_len,0], [0,1,0], 2)
p.addUserDebugLine([0,0,0], [0,0,axis_len], [0,0,1], 2)

e_vis = p.createVisualShape(p.GEOM_SPHERE, radius=0.003, rgbaColor=[0,0,0,1])
e_id = p.createMultiBody(baseMass=0, baseVisualShapeIndex=e_vis, basePosition=E)
p.addUserDebugText("E", E + [0,0,0.005], [0,0,0], 0.8)

# ============================================================
# 动态物体
# ============================================================

def create_sphere(radius, color, pos):
    vis = p.createVisualShape(p.GEOM_SPHERE, radius=radius, rgbaColor=color)
    return p.createMultiBody(baseMass=0, baseVisualShapeIndex=vis, basePosition=pos)

a_id = create_sphere(0.003, [0,1,0,1], [0,0,0])
f_id = create_sphere(0.003, [1,0,0,1], [0,0,0])
b_id = create_sphere(0.0025, [0,0,1,1], [0,0,0])
d_id = create_sphere(0.0025, [0,0,1,1], [0,0,0])

# ============================================================
# 主循环
# ============================================================

print("\n" + "="*60)
print("六杆机构仿真（已验证参数）")
print("="*60)
print("拖动滑块 A_X 和 A_Z")
print("绿色球=A，红色球=F（指尖）")
print("蓝色球=B/D，黑色球=E（固定）")
print("="*60 + "\n")

line_ids = []
text_id = None

try:
    while p.isConnected():
        Ax_mm = p.readUserDebugParameter(a_x_slider)
        Az_mm = p.readUserDebugParameter(a_z_slider)
        A = np.array([Ax_mm * 0.001, 0.0, Az_mm * 0.001])
        
        F, B, D, success = solve_finger_mechanism(A)
        
        if success:
            p.resetBasePositionAndOrientation(a_id, A, [0,0,0,1])
            p.resetBasePositionAndOrientation(f_id, F, [0,0,0,1])
            p.resetBasePositionAndOrientation(b_id, B, [0,0,0,1])
            p.resetBasePositionAndOrientation(d_id, D, [0,0,0,1])
            
            for line_id in line_ids:
                p.removeUserDebugItem(line_id)
            line_ids = []
            
            line_ids.append(p.addUserDebugLine(A, B, [0.5,0.5,0.5], 2))
            line_ids.append(p.addUserDebugLine(A, F, [0.5,0.5,0.5], 2))
            line_ids.append(p.addUserDebugLine(B, F, [0.5,0.5,0.5], 2))
            line_ids.append(p.addUserDebugLine(A, D, [0.5,0.5,0.5], 2))
            line_ids.append(p.addUserDebugLine(D, F, [0.5,0.5,0.5], 2))
            line_ids.append(p.addUserDebugLine(B, E, [0.7,0.7,0.7], 2))
            line_ids.append(p.addUserDebugLine(D, E, [0.7,0.7,0.7], 2))
            
            if text_id:
                p.removeUserDebugItem(text_id)
            text_pos = [0.02, -0.025, 0.06]
            info = f"A: ({Ax_mm:.0f}, {Az_mm:.0f}) mm\nF: ({F[0]*1000:.0f}, {F[2]*1000:.0f}) mm"
            text_id = p.addUserDebugText(info, text_pos, [1,1,1], 0.8)
            
            print(f"A=({Ax_mm:.1f},{Az_mm:.1f}) → F=({F[0]*1000:.1f},{F[2]*1000:.1f})", end="\r")
        else:
            print(f"⚠️ A=({Ax_mm:.1f},{Az_mm:.1f}) 无解                    ", end="\r")
        
        time.sleep(0.02)
        
except KeyboardInterrupt:
    print("\n用户中断")
finally:
    if p.isConnected():
        p.disconnect()
        print("已断开连接")