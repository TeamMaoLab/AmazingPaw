# 手指机构完整数学模型

## 1. 坐标系与固定参数

### 1.1 世界坐标系

右手系 XYZ，原点任意选取。机构关于 XZ 平面近似对称。

### 1.2 固定点

$$B = (0,\ 0,\ z_0) \quad \text{--- 轴承安装位置（固定）}$$

$$P = (L_{BP},\ 0,\ z_0) \quad \text{--- 三体共轴点}$$

$$C = (x_e,\ +y_e,\ z_e) \quad \text{--- 右舵机旋转中心（固定）}$$

$$E = (x_e,\ -y_e,\ z_e) \quad \text{--- 左舵机旋转中心（固定）}$$

### 1.3 结构参数（由生长过程确定，此模型中为固定常数）

这些参数由生长工具（web 端）交互式设定，确定机构的初始几何。在本运动学模型中视为已知常数。

| 参数 | 含义 |
|------|------|
| $z_0$ | B, P 点的 Z 坐标（轴承高度） |
| $L_{BP}$ | BP 杆长度（B 到 P 的 X 方向距离） |
| $L_A$ | PA 杆长度 |
| $\alpha_0$ | PA 与局部 +Z 轴的初始夹角 |
| $L_Q$ | PQ 杆长度 |
| $\gamma_0$ | PQ 与局部 +Z 轴的初始夹角 |
| $\delta$ | PA 与 PQ 的固定夹角，$\delta = \alpha_0 - \gamma_0$ |
| $L_U$ | link 杆长（P 到 U 的距离） |
| $L_T$ | plate 延伸长度（U 到 T 的距离） |
| $L_B$ | 横杆宽度（R 与 L 之间的距离） |
| $x_e$ | 舵机圆心 X 坐标 |
| $y_e$ | 舵机圆心 Y 坐标（绝对值） |
| $z_e$ | 舵机圆心 Z 坐标 |
| $R$ | 舵机摇臂半径 |
| $\beta_{1,0}$ | 右舵机初始角度 |
| $\beta_{2,0}$ | 左舵机初始角度 |

### 1.4 被动参数（由结构参数和初始角度自动计算）

$$L_{rod} = \|R(\theta_0, \alpha_0) - D(\beta_{1,0})\| \quad \text{（连杆长度，左右对称）}$$

$$L_{QU} = \|Q_0 - U_0\| \quad \text{（三角闭环 QU 边长，由初始配置确定）}$$

连杆长度和三角形边长不是独立设计参数。初始状态按对称设定。它们由初始配置（生长结果）自动确定，在运动模拟中作为常数约束使用。

### 1.5 旋转矩阵

**X 轴旋转**（整体旋转，轴承在 B 通过 BP 杆传递到 P）：

$$R_x(\theta) = \begin{bmatrix} 1 & 0 & 0 \\ 0 & \cos\theta & -\sin\theta \\ 0 & \sin\theta & \cos\theta \end{bmatrix}$$

**Y 轴旋转**（arm 刚体在 P 处绕 Y 轴旋转）：

$$R_y(\psi) = \begin{bmatrix} \cos\psi & 0 & \sin\psi \\ 0 & 1 & 0 \\ -\sin\psi & 0 & \cos\psi \end{bmatrix}$$

arm 刚体绕 Y 轴旋转 ψ 后，PA 的有效角度变为 $\alpha = \alpha_0 + \psi$，PQ 的有效角度变为 $\gamma = \gamma_0 + \psi$。由于 arm 是刚体，PA-PQ 夹角恒为 $\delta = \alpha_0 - \gamma_0$。

---

## 2. 刚体几何构成

初始状态设定完成后，每个刚体的内部尺寸固定为常数。

### 2.1 arm（P, A, Q, R, L）

arm 是一个刚体，在 P 处有两个旋转自由度：X 轴旋转（θ）和 Y 轴旋转（ψ）。整个刚体一起转动，PA-PQ 夹角恒为 $\delta = \alpha_0 - \gamma_0$。

在 arm 的局部坐标系中（原点 P，θ = 0），仅考虑 Y 轴旋转 ψ 后各点坐标为：

$$A = (L_A \sin\alpha,\ 0,\ L_A \cos\alpha), \quad \alpha = \alpha_0 + \psi$$

$$Q = (L_Q \sin\gamma,\ 0,\ L_Q \cos\gamma), \quad \gamma = \gamma_0 + \psi = \alpha - \delta$$

横杆 RL 连接在 A 的 Y 方向偏移处：

$$R = (L_A \sin\alpha,\ L_B/2,\ L_A \cos\alpha)$$

$$L = (L_A \sin\alpha,\ -L_B/2,\ L_A \cos\alpha)$$

内部固定距离：
- $\|PA\| = L_A$
- $\|PQ\| = L_Q$
- $\|AQ\| = \sqrt{L_A^2 + L_Q^2 - 2L_A L_Q \cos\delta}$（常数，刚体不变）
- $\|RL\| = L_B$（横杆）

### 2.2 link（P, U）

link 从 P 出发，长度 $L_U$ 固定。U 的局部坐标不由 Z 轴方向硬编码，而是由三角闭环（见第 5 节）确定。

- $\|PU\| = L_U$（杆长，固定）

### 2.3 plate（Q, U, T）

plate 是刚体三角形 QUT，形状固定。

- $\|QU\| = L_{QU}$（被动参数）
- $\|UT\| = L_T$
- $\|QT\| = \sqrt{L_{QU}^2 + L_T^2 - 2 L_{QU} L_T \cos\angle QUT}$

三角形 QUT 在初始状态设定后形状完全固定，运动中不变形。

### 2.4 servo_r（C, D） / servo_l（E, F）

- $\|CD\| = R$（舵机摇臂半径）
- $\|EF\| = R$

### 2.5 rod_r（R, D） / rod_l（L, F）

- $\|RD\| = L_{rod}$（被动参数，由初始配置计算）
- $\|LF\| = L_{rod}$（对称，相同）

### 2.6 base（B）

仅包含固定点 B，无内部几何。

---

## 3. 变量分类

### 3.1 主动输入（由舵机驱动）

$$\mathbf{q}_{in} = (\beta_1,\ \beta_2)^T$$

- $\beta_1$ — 右舵机旋转角（主动驱动）
- $\beta_2$ — 左舵机旋转角（主动驱动）

这是系统的全部独立变量。给定 $\beta_1, \beta_2$，其余变量由两阶段求解确定。

### 3.2 两阶段求解

**阶段 1 — 驱动系统**：舵机 → 连杆约束 → 求解 arm 姿态

$$\text{被动变量：} (\theta,\ \psi)$$

- $\theta$ — arm 绕 X 轴的旋转角（轴承在 B 通过 BP 杆传递到 P）
- $\psi$ — arm 绕 Y 轴的旋转角（整个 arm 刚体绕 P 处 Y 轴转动）

定义 $\alpha = \alpha_0 + \psi$ 为 PA 的当前角度，$\gamma = \gamma_0 + \psi$ 为 PQ 的当前角度。

由连杆约束方程求解：$\begin{cases} f_1(\theta, \psi;\ \beta_1) = 0 \\ f_2(\theta, \psi;\ \beta_2) = 0 \end{cases}$

**阶段 2 — 手指位置**：arm 姿态已知 → 刚性三角 → 求解 U, T

$$\text{被动变量：} (u_0)$$

由三角闭环 P-U-Q 的 SSS 构造自动确定。无需迭代求解。

---

## 4. 阶段 1 — 驱动系统求解

### 4.1 位置公式

arm 刚体绕 Y 轴旋转 ψ 后，再整体绕 X 轴旋转 θ。在 arm 的局部坐标系中（原点 P），各点坐标为：

$$\mathbf{a}_0 = (L_A \sin\alpha,\ 0,\ L_A \cos\alpha), \quad \alpha = \alpha_0 + \psi$$

$$\mathbf{q}_0 = (L_Q \sin\gamma,\ 0,\ L_Q \cos\gamma), \quad \gamma = \gamma_0 + \psi = \alpha - \delta$$

$$\mathbf{r}_0 = (L_A \sin\alpha,\ L_B/2,\ L_A \cos\alpha)$$

$$\mathbf{l}_0 = (L_A \sin\alpha,\ -L_B/2,\ L_A \cos\alpha)$$

施加整体旋转 $R_x(\theta)$ 后，各点的全局坐标为：

**A 点**：

$$A(\theta, \psi) = P + R_x(\theta) \cdot \mathbf{a}_0 = \begin{pmatrix} L_{BP} + L_A \sin\alpha \\ -L_A \cos\alpha \cdot \sin\theta \\ z_0 + L_A \cos\alpha \cdot \cos\theta \end{pmatrix}$$

**Q 点**：

$$Q(\theta, \psi) = P + R_x(\theta) \cdot \mathbf{q}_0 = \begin{pmatrix} L_{BP} + L_Q \sin\gamma \\ -L_Q \cos\gamma \cdot \sin\theta \\ z_0 + L_Q \cos\gamma \cdot \cos\theta \end{pmatrix}$$

**R 点**（右连杆连接点）：

$$R(\theta, \psi) = P + R_x(\theta) \cdot \mathbf{r}_0 = \begin{pmatrix} L_{BP} + L_A \sin\alpha \\[4pt] \dfrac{L_B}{2}\cos\theta - L_A \cos\alpha \cdot \sin\theta \\[4pt] z_0 + \dfrac{L_B}{2}\sin\theta + L_A \cos\alpha \cdot \cos\theta \end{pmatrix}$$

**L 点**（左连杆连接点）：

$$L(\theta, \psi) = P + R_x(\theta) \cdot \mathbf{l}_0 = \begin{pmatrix} L_{BP} + L_A \sin\alpha \\[4pt] -\dfrac{L_B}{2}\cos\theta - L_A \cos\alpha \cdot \sin\theta \\[4pt] z_0 - \dfrac{L_B}{2}\sin\theta + L_A \cos\alpha \cdot \cos\theta \end{pmatrix}$$

### 4.2 舵机子系统点

**D 点**（右舵机摇臂末端）：

$$D(\beta_1) = C + \begin{pmatrix} 0 \\ R\cos\beta_1 \\ R\sin\beta_1 \end{pmatrix} = \begin{pmatrix} x_e \\ y_e + R\cos\beta_1 \\ z_e + R\sin\beta_1 \end{pmatrix}$$

**F 点**（左舵机摇臂末端）：

$$F(\beta_2) = E + \begin{pmatrix} 0 \\ R\cos\beta_2 \\ R\sin\beta_2 \end{pmatrix} = \begin{pmatrix} x_e \\ -y_e + R\cos\beta_2 \\ z_e + R\sin\beta_2 \end{pmatrix}$$

### 4.3 连杆约束方程

球关节（D, R 处和 F, L 处）只传递距离约束。连杆必须保持恒定长度：

$$\boxed{f_1(\theta, \psi;\ \beta_1) = \|R(\theta, \psi) - D(\beta_1)\|^2 - L_{rod}^2 = 0}$$

$$\boxed{f_2(\theta, \psi;\ \beta_2) = \|L(\theta, \psi) - F(\beta_2)\|^2 - L_{rod}^2 = 0}$$

注：R 和 L 的表达式中 $\alpha = \alpha_0 + \psi$，因此 f₁, f₂ 实际上是 $(\theta, \psi)$ 的函数。

### 4.4 约束方程展开

以下展开中记 $\alpha = \alpha_0 + \psi$。

**右连杆 $f_1$**：

$$\Delta x_1 = L_{BP} + L_A \sin\alpha - x_e$$

$$\Delta y_1 = \frac{L_B}{2}\cos\theta - L_A \cos\alpha \cdot \sin\theta - y_e - R\cos\beta_1$$

$$\Delta z_1 = z_0 + \frac{L_B}{2}\sin\theta + L_A \cos\alpha \cdot \cos\theta - z_e - R\sin\beta_1$$

$$f_1 = \Delta x_1^2 + \Delta y_1^2 + \Delta z_1^2 - L_{rod}^2 = 0$$

**左连杆 $f_2$**：

$$\Delta x_2 = L_{BP} + L_A \sin\alpha - x_e$$

$$\Delta y_2 = -\frac{L_B}{2}\cos\theta - L_A \cos\alpha \cdot \sin\theta + y_e - R\cos\beta_2$$

$$\Delta z_2 = z_0 - \frac{L_B}{2}\sin\theta + L_A \cos\alpha \cdot \cos\theta - z_e - R\sin\beta_2$$

$$f_2 = \Delta x_2^2 + \Delta y_2^2 + \Delta z_2^2 - L_{rod}^2 = 0$$

### 4.5 Newton-Raphson 求解

给定 $(\beta_1, \beta_2)$，求解非线性方程组 $\begin{cases} f_1 = 0 \\ f_2 = 0 \end{cases}$，未知量为 $(\theta, \psi)$。

**Jacobian 矩阵**：

$$J = \begin{bmatrix} \dfrac{\partial f_1}{\partial \theta} & \dfrac{\partial f_1}{\partial \psi} \\[6pt] \dfrac{\partial f_2}{\partial \theta} & \dfrac{\partial f_2}{\partial \psi} \end{bmatrix}$$

由于 $\alpha = \alpha_0 + \psi$，有 $\dfrac{\partial}{\partial \psi} = \dfrac{\partial}{\partial \alpha}$，所以 Jacobian 的元素与对 $\alpha$ 求偏导相同。

**迭代格式**：

$$\begin{pmatrix} \theta \\ \psi \end{pmatrix}^{(k+1)} = \begin{pmatrix} \theta \\ \psi \end{pmatrix}^{(k)} - J^{-1} \begin{pmatrix} f_1 \\ f_2 \end{pmatrix}^{(k)}$$

### 4.6 Jacobian 解析表达式

#### $f_1$ 对 $\theta$ 的偏导

$$\frac{\partial \Delta y_1}{\partial \theta} = -\frac{L_B}{2}\sin\theta - L_A \cos\alpha \cdot \cos\theta$$

$$\frac{\partial \Delta z_1}{\partial \theta} = \frac{L_B}{2}\cos\theta - L_A \cos\alpha \cdot \sin\theta$$

$$\frac{\partial f_1}{\partial \theta} = 2\left[\Delta y_1 \cdot \frac{\partial \Delta y_1}{\partial \theta} + \Delta z_1 \cdot \frac{\partial \Delta z_1}{\partial \theta}\right]$$

#### $f_1$ 对 $\alpha$ 的偏导

$$\frac{\partial f_1}{\partial \alpha} = 2L_A\left[\Delta x_1 \cos\alpha + \Delta y_1 \sin\alpha \sin\theta - \Delta z_1 \sin\alpha \cos\theta\right]$$

#### $f_2$ 的偏导

$f_2$ 的偏导与 $f_1$ 完全类似，唯一区别是 $L_B/2$ 的符号取反：

$$\frac{\partial \Delta y_2}{\partial \theta} = \frac{L_B}{2}\sin\theta - L_A \cos\alpha \cdot \cos\theta$$

$$\frac{\partial \Delta z_2}{\partial \theta} = -\frac{L_B}{2}\cos\theta - L_A \cos\alpha \cdot \sin\theta$$

### 4.7 多解与奇异点

给定 $\beta_1, \beta_2$，约束 $f_1 = 0$ 和 $f_2 = 0$ 各定义 $\theta$-$\psi$ 平面上的一条曲线。两条曲线的交点即为解。

- **解的数量**：通常 0、1、2 或 4 个，取决于参数
- **解的选择**：由初始装配位置确定唯一分支
- **奇异点**：当 $|J| = 0$ 时，机构处于奇异位形，两条约束曲线相切

---

## 5. 阶段 2 — 手指位置计算

### 5.1 问题

阶段 1 求出 $(\theta, \psi)$ 后，P 和 Q 的全局坐标已知（Q 也随 ψ 旋转）。需要确定 U 和 T 的位置。

U 由刚性三角闭环 P-U-Q 的 SSS 构造确定，T 由 plate 刚体确定。

### 5.2 三角闭环 P-U-Q

三角闭环由 3 个刚体（arm, link, plate）和 3 个 revolute Y 关节（j_p 在 P 处、j_u 在 U 处、j_q 在 Q 处）组成。

在 arm 的局部坐标系中（原点 P，已施加 $R_x(\theta)$ 后），P 和 Q 是已知点：

$$P_{local} = (0, 0, 0), \quad Q_{local} = (L_Q\sin\gamma,\ 0,\ L_Q\cos\gamma), \quad \gamma = \gamma_0 + \psi$$

注意 P 和 Q 的 Y 坐标都为 0，三角闭环被限制在 ZX 平面内。

### 5.3 SSS 构造求解 U

已知三边长度：
- $\|PU\| = L_U$
- $\|QU\| = L_{QU}$
- $\|PQ\| = L_Q$（固定）

设 $U_{local} = (x_U,\ 0,\ z_U)$，由两个距离方程求解：

$$\begin{cases} x_U^2 + z_U^2 = L_U^2 \\ (x_U - L_Q\sin\gamma)^2 + (z_U - L_Q\cos\gamma)^2 = L_{QU}^2 \end{cases}$$

其中 $\gamma = \gamma_0 + \psi$，由阶段 1 的解确定。

展开第二个方程并减去第一个：

$$-2 x_U L_Q\sin\gamma - 2 z_U L_Q\cos\gamma + L_Q^2 = L_{QU}^2 - L_U^2$$

令 $C = \frac{L_U^2 + L_Q^2 - L_{QU}^2}{2 L_Q}$，则：

$$x_U \sin\gamma + z_U \cos\gamma = C$$

与 $x_U^2 + z_U^2 = L_U^2$ 联立，得到两组解（对称于 PQ 轴），物理上由初始装配位置选择其中一组。

由于三角闭环刚性（0 DOF），U 随 arm 刚体一起运动。等价地，可直接旋转初始坐标：$U_{local} = R_y(\psi) \cdot U_0$，其中 $U_0$ 是生长过程中 U 的初始局部坐标。

### 5.4 U 和 T 的全局坐标

$$U(\theta, \psi) = P + R_x(\theta) \cdot R_y(\psi) \cdot U_0$$

$$T(\theta, \psi) = P + R_x(\theta) \cdot R_y(\psi) \cdot T_0$$

其中 $U_0$ 和 $T_0$ 是生长过程中 U 和 T 在 arm 局部坐标系中的初始坐标。

其中 $\mathbf{t}_{offset}$ 是 plate 刚体中 T 相对于 U 的固定方向和距离（由初始配置确定）。

### 5.5 闭环刚性证明

三个 revolute Y 关节（j_p, j_u, j_q）的轴线互相平行且共面，整个三角形被限制在 ZX 平面内运动。Y 分量恒为 0，自动满足。

2 个有效方程（X 和 Z 分量）恰好确定 2 个未知量（$x_U, z_U$），方程组封闭。

$$\boxed{\text{P-U-Q 三角闭环为刚性，内部 DOF} = 0}$$

---

## 6. 自由度分析

### 6.1 从约束方程直接论证

**广义坐标**：$\mathbf{q} = (\theta, \psi, \beta_1, \beta_2)$，共 4 个变量。

**独立约束方程**：$f_1 = 0$ 和 $f_2 = 0$，共 2 个。

$$\boxed{F = 4 - 2 = 2}$$

其余约束（刚体距离、关节轴线方向、三角闭环封闭性）均被位置公式隐式满足。

### 6.2 过约束说明

Gruebler-Kutzbach 公式对本机构给出 $F_{GK} = 0$（$6 \times (8-10-1) + 6 + 12 = 0$），与实际 $F = 2$ 矛盾。差值 2 为过约束量，来源：

1. 三角闭环 3 个共面平行 revolute Y 关节（比一般空间情况多约 2 个过约束）
2. 左右对称链共享 arm 刚体（约 1 个过约束）

由于过约束存在，GK 公式不适用于本机构，直接从约束方程分析更可靠。

---

## 7. 完整求解流程

### 7.1 总流程

给定输入 $(\beta_1, \beta_2)$：

1. **阶段 1**：建立方程组 $\begin{cases} f_1(\theta, \psi;\ \beta_1) = 0 \\ f_2(\theta, \psi;\ \beta_2) = 0 \end{cases}$，用 Newton-Raphson 迭代求解 $(\theta, \psi)$
2. **阶段 2**：由 $(\theta, \psi)$ 计算 Q 位置 → 刚性三角确定 U → plate 刚体确定 T

### 7.2 位置计算顺序

| 步骤 | 阶段 | 点 | 公式 | 依赖 |
|------|------|---|------|------|
| 1 | — | $P$ | $(L_{BP}, 0, z_0)$ | 固定 |
| 2 | — | $D$ | $(x_e, y_e + R\cos\beta_1, z_e + R\sin\beta_1)$ | $\beta_1$ |
| 3 | — | $F$ | $(x_e, -y_e + R\cos\beta_2, z_e + R\sin\beta_2)$ | $\beta_2$ |
| 4 | 1 | $A$ | $P + R_x(\theta) \cdot (L_A\sin\alpha, 0, L_A\cos\alpha)$ | $\theta, \psi$ |
| 5 | 1 | $Q$ | $P + R_x(\theta) \cdot (L_Q\sin\gamma, 0, L_Q\cos\gamma)$ | $\theta, \psi$ |
| 6 | 1 | $R$ | $P + R_x(\theta) \cdot (L_A\sin\alpha, L_B/2, L_A\cos\alpha)$ | $\theta, \psi$ |
| 7 | 1 | $L$ | $P + R_x(\theta) \cdot (L_A\sin\alpha, -L_B/2, L_A\cos\alpha)$ | $\theta, \psi$ |
| 8 | 2 | $U$ | $P + R_x(\theta) \cdot R_y(\psi) \cdot U_0$ | $\theta, \psi$ |
| 9 | 2 | $T$ | $P + R_x(\theta) \cdot R_y(\psi) \cdot T_0$ | $\theta, \psi$ |

注：表中 $\alpha = \alpha_0 + \psi$，$\gamma = \gamma_0 + \psi$。

---

## 附录 A：符号对照表

| 本文档 | mechanism_analysis.md | compute.js | 含义 |
|--------|----------------------|------------|------|
| $R$（点） | R | R_world | 右连杆连接点 |
| $L$（点） | L | L_world | 左连杆连接点 |
| $L_{rod}$ | $L_{rod\_r}$ / $L_{rod\_l}$ | link_lengths.right/left | 连杆长度 |
| $\psi$ | — | — | arm 刚体 Y 轴旋转角 |
| $\alpha$ | $\alpha$ | alpha | PA 当前角度，$\alpha = \alpha_0 + \psi$ |
| $\theta$ | $\theta$ | theta | arm X 轴旋转角 |
| $\beta_1$ | $\beta_1$ | beta1 | 右舵机角度 |
| $\beta_2$ | $\beta_2$ | beta2 | 左舵机角度 |
| $L_{QU}$ | — | — | 三角闭环 QU 边长 |
| $(x_U, z_U)$ | — | — | U 的局部坐标（SSS 求解） |
