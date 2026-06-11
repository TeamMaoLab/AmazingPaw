# 手指机构刚体分解数学模型

## 1. 坐标系与固定参数

### 1.1 世界坐标系

右手系 XYZ，Z 朝上。原点 O = (0, 0, 0)。机构关于 XZ 平面近似对称。

初始状态下，所有点位于 XZ 平面（Y = 0），横杆端点除外（Y = ±BarHalf）。

### 1.2 固定点（与地面固连）

$$O = (0,\ 0,\ 0) \quad \text{--- 世界原点}$$

$$B = (0,\ 0,\ z_0) \quad \text{--- 轴承安装位置（固定）}$$

$$S = (x_e,\ 0,\ 0) \quad \text{--- 舵机面标记点}$$

$$H = (x_e,\ 0,\ z_e) \quad \text{--- 舵机高度偏移点}$$

$$C = (x_e,\ +y_e,\ z_e) \quad \text{--- 右舵机旋转中心（固定）}$$

$$E = (x_e,\ -y_e,\ z_e) \quad \text{--- 左舵机旋转中心（固定）}$$

### 1.3 结构参数（设计常数）

| 参数 | 默认值 | 单位 | 含义 |
|------|--------|------|------|
| $x_e$ | 11 | mm | 舵机面到 YZ 平面的 X 距离 |
| $z_e$ | 0 | mm | 舵机中心 Z 偏移 |
| $y_e$ | 16 | mm | 舵机中心到 XZ 平面的 Y 距离（绝对值） |
| $R$ | 16 | mm | 舵机摇臂半径 |
| $\beta_1$ | 70 | ° | 右舵机臂角度（从 +Z 方向计量） |
| $z_0$ | 36 | mm | 轴承安装高度（B 点 Z 坐标） |
| $L_{BP}$ | 10 | mm | B → P 距离（+X 方向） |
| $L_{PQ}$ | 50 | mm | P → Q 距离（+Z 方向） |
| $L_{QU}$ | 40 | mm | Q → U 距离（+Z 方向） |
| $L_{PA}$ | 7 | mm | P → A 距离（+X 方向） |
| $L_{AT}$ | 7 | mm | A → T 长度 |
| $\alpha$ | 35 | ° | A → T 角度（从 +X 方向计量，XZ 平面内） |
| $L_{AK}$ | 50 | mm | A → K（plate_end）长度 |
| $\gamma$ | 70 | ° | A → K 角度（相对 A→T 方向计量） |
| $\text{BarHalf}$ | 7 | mm | T 横杆半宽（±Y 方向） |

### 1.4 被动参数（由初始配置自动计算）

连杆长度和三角形的非生长定义边长不是独立设计参数，由初始配置（生长结果）确定：

$$L_{rod\_r} = \|R_0 - D_0\| \quad \text{--- 右连杆长度}$$

$$L_{rod\_l} = \|L_0 - F_0\| \quad \text{--- 左连杆长度}$$

$$L_{QK} = \|Q_0 - K_0\| \quad \text{--- UQK 三角形 QK 边长}$$

$$L_{UK} = \|U_0 - K_0\| \quad \text{--- UQK 三角形 UK 边长}$$

$$\|AK\| = L_{AK} \quad \text{--- KATLR 刚体内固定距离}$$

$$\|AT\| = L_{AT} \quad \text{--- KATLR 刚体内固定距离}$$

$$\|TL\| = \|TR\| = \text{BarHalf} \quad \text{--- 横杆半宽}$$

其中下标 $0$ 表示初始配置下的位置。

### 1.5 旋转矩阵

**AB 轴旋转**（轴承在 B 处，APB 刚体绕 AB 方向旋转；AB 平行于 +X，位于 $z = z_0$ 高度。数学上等价于平移至 B 后施加 $R_x(\theta)$ 再平移回来）：

$$R_x(\theta) = \begin{bmatrix} 1 & 0 & 0 \\ 0 & \cos\theta & -\sin\theta \\ 0 & \sin\theta & \cos\theta \end{bmatrix}$$

### 1.6 初始配置下的关键点坐标

初始状态下 $\theta = 0$，所有点位于 XZ 平面（Y = 0）：

$$P_0 = (L_{BP},\ 0,\ z_0)$$

$$A_0 = (L_{BP} + L_{PA},\ 0,\ z_0)$$

$$Q_0 = (L_{BP},\ 0,\ z_0 + L_{PQ})$$

$$U_0 = (L_{BP},\ 0,\ z_0 + L_{PQ} + L_{QU})$$

$$T_0 = (L_{BP} + L_{PA} + L_{AT}\cos\alpha,\ 0,\ z_0 + L_{AT}\sin\alpha)$$

$$K_0 = (L_{BP} + L_{PA} + L_{AK}\cos(\alpha+\gamma),\ 0,\ z_0 + L_{AK}\sin(\alpha+\gamma))$$

$$R_0 = (T_{0x},\ +\text{BarHalf},\ T_{0z})$$

$$L_0 = (T_{0x},\ -\text{BarHalf},\ T_{0z})$$

$$D_0 = (x_e,\ y_e + R\sin\beta_1,\ z_e + R\cos\beta_1)$$

$$F_0 = (x_e,\ -y_e - R\sin\beta_1,\ z_e + R\cos\beta_1)$$

注：代码中舵机臂角度 $\beta_1$ 从 +Z 方向计量，D 的 Y 分量为 $R\sin\beta_1$，Z 分量为 $R\cos\beta_1$。左舵机对称取反。

---

## 2. 刚体几何构成

系统由 8 个刚体组成。每个刚体内部尺寸在运动过程中保持恒定。

### 2.1 APB — 基座刚体（点 B, P, A）

APB 是连接轴承与手指机构的基座刚体，在 B 处通过轴承绕 AB 方向旋转。

在 APB 的局部坐标系中（原点 P，$\theta = 0$ 时）：

$$B_{local} = (-L_{BP},\ 0,\ 0)$$

$$P_{local} = (0,\ 0,\ 0)$$

$$A_{local} = (L_{PA},\ 0,\ 0)$$

内部固定距离：
- $\|BP\| = L_{BP}$
- $\|PA\| = L_{PA}$
- $\|BA\| = L_{BP} + L_{PA}$（三点共线，沿 +X 方向排列）

**关键性质**：APB 绕 AB 轴旋转角度 $\theta$ 后，B、P、A 三点均在旋转轴上（AB 方向，y=0, z=z₀），全局坐标不变。下游刚体（QP、UQK、KATLR）上的点绕此轴旋转。

### 2.2 QP — 臂延伸刚体（点 Q, P）

QP 从 P 向 +Z 延伸至 Q。在 P 处与 APB 通过旋转关节连接。

在 QP 的局部坐标系中（原点 P）：

$$P_{local} = (0,\ 0,\ 0)$$

$$Q_{local} = (0,\ 0,\ L_{PQ})$$

内部固定距离：
- $\|PQ\| = L_{PQ}$

### 2.3 UQK — 连接三角刚体（点 U, Q, K）

UQK 是刚性三角形，连接臂延伸（Q 点）和手指板（K 点）。

内部固定距离：
- $\|QU\| = L_{QU}$
- $\|QK\| = L_{QK}$（被动参数）
- $\|UK\| = L_{UK}$（被动参数）

三角形 UQK 在初始配置设定后形状完全固定，运动中不变形。

### 2.4 KATLR — 手指板刚体（点 K, A, T, L, R）

KATLR 是最大的刚体，包含手指尖端板和横杆。

在 KATLR 刚体中（以 A 为参考点），各点的局部坐标由以下关系定义：

- $K$ 相对于 $A$：距离 $L_{AK}$，方向角 $(\alpha + \gamma)$ 从 +X（在 XZ 平面内）
- $T$ 相对于 $A$：距离 $L_{AT}$，方向角 $\alpha$ 从 +X（在 XZ 平面内）
- $R = T + (0,\ +\text{BarHalf},\ 0)$
- $L = T + (0,\ -\text{BarHalf},\ 0)$

内部固定距离：
- $\|AK\| = L_{AK}$
- $\|AT\| = L_{AT}$
- $\|TK\| = \sqrt{L_{AT}^2 + L_{AK}^2 - 2 L_{AT} L_{AK} \cos\gamma}$（常数，刚体不变）
- $\|TR\| = \text{BarHalf}$
- $\|TL\| = \text{BarHalf}$
- $\|RL\| = 2 \cdot \text{BarHalf}$
- $\|KR\|, \|KL\|$ 等均为常数

**关键性质**：KATLR 同时包含 A 点（与 APB 共享）和 K 点（与 UQK 共享），形成结构闭环。这是系统中最关键的刚体——它同时参与结构闭环和驱动闭环。

### 2.5 LF — 左连杆刚体（点 L, F）

两端均为球关节。

- $\|LF\| = L_{rod\_l}$（被动参数，由初始配置计算）

### 2.6 RD — 右连杆刚体（点 R, D）

两端均为球关节。

- $\|RD\| = L_{rod\_r}$（被动参数，由初始配置计算）

### 2.7 CD — 右舵机臂刚体（点 C, D）

- C 固定于地面
- D 为舵机臂端点
- $\|CD\| = R$（舵机臂半径）

### 2.8 EF — 左舵机臂刚体（点 E, F）

- E 固定于地面
- F 为舵机臂端点
- $\|EF\| = R$（舵机臂半径）

---

## 3. 连接关系与关节

### 3.1 关节汇总

| # | 关节 | 连接刚体 | 类型 | 自由度 | 说明 |
|---|------|---------|------|--------|------|
| 1 | B (轴承) | APB ↔ Ground | Revolute X | 1 | APB 绕 AB 方向旋转 |
| 2 | P (APB↔QP) | APB ↔ QP | Revolute | 1 | QP 相对 APB 旋转 |
| 3 | A (APB↔KATLR) | APB ↔ KATLR | Revolute | 1 | KATLR 相对 APB 在 A 处旋转 |
| 4 | Q (QP↔UQK) | QP ↔ UQK | Revolute | 1 | UQK 相对 QP 旋转 |
| 5 | K (UQK↔KATLR) | UQK ↔ KATLR | Revolute | 1 | KATLR 相对 UQK 在 K 处旋转 |
| 6 | R (KATLR↔RD) | KATLR ↔ RD | Spherical | 3 | 球关节 |
| 7 | D (RD↔CD) | RD ↔ CD | Spherical | 3 | 球关节 |
| 8 | L (KATLR↔LF) | KATLR ↔ LF | Spherical | 3 | 球关节 |
| 9 | F (LF↔EF) | LF ↔ EF | Spherical | 3 | 球关节 |
| 10 | C (CD↔Ground) | CD ↔ Ground | Revolute (servo $\beta_1$) | 1 | 右舵机驱动 |
| 11 | E (EF↔Ground) | EF ↔ Ground | Revolute (servo $\beta_2$) | 1 | 左舵机驱动 |

### 3.2 闭环结构

机构包含 **两个闭环**：

**闭环 1 — 结构四连杆 P-A-K-Q-P**：

由 4 个刚体通过 4 个旋转关节（关节 2-5）依次连接构成：

$$APB \xrightarrow{P} QP \xrightarrow{Q} UQK \xrightarrow{K} KATLR \xrightarrow{A} APB$$

- 杆 1 (APB)：P → A，长度 $L_{PA}$
- 杆 2 (KATLR)：A → K，长度 $L_{AK}$
- 杆 3 (UQK)：K → Q，长度 $L_{QK}$
- 杆 4 (QP)：Q → P，长度 $L_{PQ}$

**闭环 2 — 右驱动链 C-D-R-A-K-...-P-B-C**：

$$Ground_C \xrightarrow{\beta_1} CD \xrightarrow{D} RD \xrightarrow{R} KATLR \xrightarrow{A} APB \xrightarrow{B} Ground$$

**闭环 3 — 左驱动链 E-F-L-A-K-...-P-B-E**：

$$Ground_E \xrightarrow{\beta_2} EF \xrightarrow{F} LF \xrightarrow{L} KATLR \xrightarrow{A} APB \xrightarrow{B} Ground$$

闭环 2 和闭环 3 通过公共路径（KATLR → APB → Ground）耦合。

### 3.3 拓扑图

```
Ground (O, B, C, E 固定)
  │
  ├──[Revolute X, θ]── APB (B, P, A)
  │     │                    │
  │     ├──[Revolute]── QP (Q, P)
  │     │               │
  │     │               └──[Revolute]── UQK (U, Q, K)
  │     │                                  │
  │     └──[Revolute]── KATLR (K, A, T, L, R) ◄──┘
  │                      │       │
  │              [Spherical] [Spherical]
  │                      │       │
  │                     RD       LF
  │                      │       │
  │              [Spherical] [Spherical]
  │                      │       │
  ├──[Revolute β₁]── CD(D)  EF(F) ──[Revolute β₂]──┘
  │                   C       E
  └────────────── Ground ──────────┘
```

---

## 4. 变量分类

### 4.1 主动输入（由舵机驱动）

$$\mathbf{q}_{in} = (\beta_1,\ \beta_2)^T$$

- $\beta_1$ — 右舵机旋转角（驱动 D 点在 C 为圆心的圆上运动）
- $\beta_2$ — 左舵机旋转角（驱动 F 点在 E 为圆心的圆上运动）

这是系统的全部独立输入。给定 $(\beta_1, \beta_2)$，其余变量由约束方程求解。

### 4.2 被动变量

$$\mathbf{q}_{passive} = (\theta,\ \varphi)^T$$

- $\theta$ — APB 绕 AB 方向的旋转角（关节 1，轴承在 B 处）
- $\varphi$ — 结构四连杆 P-A-K-Q-P 的内部运动变量

$\varphi$ 的物理含义：四连杆机构的 1 个内部自由度，表现为 KATLR（或等效地 UQK、QP）相对 APB 的旋转。它与 Phase 1 模型中的 $\psi$（arm 绕 Y 轴旋转角）等价。

具体地，$\varphi$ 可以定义为 KATLR 上 K 点相对 A 点的角度偏离初始值的角度。设初始状态下 K 相对 A 的方向角为 $(\alpha + \gamma)_0$，则运动中：

$$(\alpha + \gamma)_{current} = (\alpha + \gamma)_0 + \varphi$$

等效地，$\varphi$ 改变了 KATLR 内各点（K, T, R, L）相对 A 的角度。

### 4.3 两阶段求解

**阶段 1 — 驱动系统**：给定 $(\beta_1, \beta_2)$，由连杆长度约束求解被动变量 $(\theta, \varphi)$。

$$\begin{cases} f_1(\theta, \varphi;\ \beta_1) = 0 \\ f_2(\theta, \varphi;\ \beta_2) = 0 \end{cases}$$

**阶段 2 — 结构四连杆**：给定 $(\theta, \varphi)$，四连杆 P-A-K-Q-P 的几何完全确定，各点位置可解析计算。无需迭代求解。

---

## 5. 约束方程

### 5.1 位置公式

#### 5.1.1 APB 刚体上的点

APB 绕 AB 方向旋转 $\theta$，以 P 为参考点（P 在 AB 轴上，y=0, z=z₀）：

$$A(\theta) = P + R_x(\theta) \cdot (L_{PA},\ 0,\ 0) = (L_{BP} + L_{PA},\ 0,\ z_0)$$

由于 $A_{local} = (L_{PA},\ 0,\ 0)$ 的 Y 和 Z 分量均为零，$R_x(\theta)$ 作用后不改变其位置。即 **A 点在 $\theta$ 旋转下不动**。

验证：$R_x(\theta) \cdot (L_{PA}, 0, 0) = (L_{PA}, 0, 0)$，正确。A 始终在 AB 轴上（y=0, z=z₀）。

同理，P 和 B 也在 AB 轴上，$\theta$ 旋转不改变它们的坐标。

#### 5.1.2 QP、UQK、KATLR 上的点

四连杆 P-A-K-Q-P 的 1 个内部自由度 $\varphi$ 决定了 QP、UQK、KATLR 上各点的位置。

在初始状态（$\theta = 0, \varphi = 0$）下，所有点位于 XZ 平面。$\theta$ 旋转使整个系统绕 AB 方向倾斜，但 APB 上的 B、P、A 恰好在旋转轴上不动。

$\varphi$ 改变时，QP 在 P 处相对 APB 旋转，带动 UQK 和 KATLR。

设 $\varphi$ 为 QP 相对 APB 在 P 处的旋转角（在初始 XZ 平面内计量），则 Q 的位置为：

$$Q(\varphi) = P + R_y^{XZ}(\varphi) \cdot (0,\ 0,\ L_{PQ})$$

其中 $R_y^{XZ}$ 表示在 XZ 平面内的旋转（绕 Y 轴），在初始状态下：

$$Q(\varphi) = (L_{BP} + L_{PQ}\sin\varphi,\ 0,\ z_0 + L_{PQ}\cos\varphi)$$

当 $\theta$ 旋转也作用时，Q 的全局坐标为：

$$Q(\theta, \varphi) = P + R_x(\theta) \cdot (L_{PQ}\sin\varphi,\ 0,\ L_{PQ}\cos\varphi)$$

$$= \begin{pmatrix} L_{BP} + L_{PQ}\sin\varphi \\ -L_{PQ}\cos\varphi \cdot \sin\theta \\ z_0 + L_{PQ}\cos\varphi \cdot \cos\theta \end{pmatrix}$$

类似地，K 点在 KATLR 上，其位置由 A（固定）和 $\varphi$（通过四连杆传播）确定。设 $\varphi$ 的传播使得 K 相对 A 的有效角度为 $(\alpha + \gamma)_0 + \varphi'$，其中 $\varphi'$ 与 $\varphi$ 的关系由四连杆几何确定。

**简记**：定义 $\phi = \varphi'$ 为 KATLR 的有效旋转角（KATLR 上各点相对 A 的角度偏离初始值的量）。

则 K 的全局坐标为：

$$K(\theta, \phi) = A + R_x(\theta) \cdot (L_{AK}\cos(\alpha+\gamma+\phi),\ 0,\ L_{AK}\sin(\alpha+\gamma+\phi))$$

$$= \begin{pmatrix} L_{BP} + L_{PA} + L_{AK}\cos\eta \\ -L_{AK}\sin\eta \cdot \sin\theta \\ z_0 + L_{AK}\sin\eta \cdot \cos\theta \end{pmatrix}$$

其中 $\eta = \alpha + \gamma + \phi$。

T、R、L 点类似：

$$T(\theta, \phi) = A + R_x(\theta) \cdot (L_{AT}\cos(\alpha+\phi),\ 0,\ L_{AT}\sin(\alpha+\phi))$$

$$R(\theta, \phi) = T + R_x(\theta) \cdot (0,\ \text{BarHalf},\ 0) = \begin{pmatrix} T_x \\ T_y + \text{BarHalf}\cos\theta \\ T_z + \text{BarHalf}\sin\theta \end{pmatrix}$$

$$L(\theta, \phi) = T + R_x(\theta) \cdot (0,\ -\text{BarHalf},\ 0) = \begin{pmatrix} T_x \\ T_y - \text{BarHalf}\cos\theta \\ T_z - \text{BarHalf}\sin\theta \end{pmatrix}$$

U 点由 Q 和 UQK 三角形确定：

$$U(\theta, \varphi) = Q + R_x(\theta) \cdot (U_{rel,Q})$$

其中 $U_{rel,Q}$ 是 U 相对 Q 的固定向量（由三角形 UQK 的形状确定）。

### 5.2 舵机子系统位置

**D 点**（右舵机臂端点）：

$$D(\beta_1) = C + \begin{pmatrix} 0 \\ R\sin\beta_1 \\ R\cos\beta_1 \end{pmatrix} = \begin{pmatrix} x_e \\ y_e + R\sin\beta_1 \\ z_e + R\cos\beta_1 \end{pmatrix}$$

**F 点**（左舵机臂端点）：

$$F(\beta_2) = E + \begin{pmatrix} 0 \\ -R\sin\beta_2 \\ R\cos\beta_2 \end{pmatrix} = \begin{pmatrix} x_e \\ -y_e - R\sin\beta_2 \\ z_e + R\cos\beta_2 \end{pmatrix}$$

注：左舵机与右舵机关于 XZ 平面对称，F 的 Y 分量取反。

### 5.3 连杆长度约束

球关节（R-D 处和 L-F 处）只传递距离约束。两根连杆必须保持恒定长度：

$$\boxed{f_1(\theta, \phi;\ \beta_1) = \|R(\theta, \phi) - D(\beta_1)\|^2 - L_{rod\_r}^2 = 0}$$

$$\boxed{f_2(\theta, \phi;\ \beta_2) = \|L(\theta, \phi) - F(\beta_2)\|^2 - L_{rod\_l}^2 = 0}$$

### 5.4 约束方程展开

以下展开中记 $\alpha' = \alpha + \phi$，$\eta = \alpha + \gamma + \phi$。

**R 点展开**：

$$T_x = L_{BP} + L_{PA} + L_{AT}\cos\alpha'$$

$$T_y = -L_{AT}\sin\alpha' \cdot \sin\theta$$

$$T_z = z_0 + L_{AT}\sin\alpha' \cdot \cos\theta$$

$$R_x = T_x$$

$$R_y = T_y + \text{BarHalf}\cos\theta = -L_{AT}\sin\alpha' \cdot \sin\theta + \text{BarHalf}\cos\theta$$

$$R_z = T_z + \text{BarHalf}\sin\theta = z_0 + L_{AT}\sin\alpha' \cdot \cos\theta + \text{BarHalf}\sin\theta$$

**右连杆 $f_1$**：

$$\Delta x_1 = L_{BP} + L_{PA} + L_{AT}\cos\alpha' - x_e$$

$$\Delta y_1 = -L_{AT}\sin\alpha' \cdot \sin\theta + \text{BarHalf}\cos\theta - y_e - R\sin\beta_1$$

$$\Delta z_1 = z_0 + L_{AT}\sin\alpha' \cdot \cos\theta + \text{BarHalf}\sin\theta - z_e - R\cos\beta_1$$

$$f_1 = \Delta x_1^2 + \Delta y_1^2 + \Delta z_1^2 - L_{rod\_r}^2 = 0$$

**L 点展开**：

$$L_x = T_x$$

$$L_y = T_y - \text{BarHalf}\cos\theta = -L_{AT}\sin\alpha' \cdot \sin\theta - \text{BarHalf}\cos\theta$$

$$L_z = T_z - \text{BarHalf}\sin\theta = z_0 + L_{AT}\sin\alpha' \cdot \cos\theta - \text{BarHalf}\sin\theta$$

**左连杆 $f_2$**：

$$\Delta x_2 = L_{BP} + L_{PA} + L_{AT}\cos\alpha' - x_e$$

$$\Delta y_2 = -L_{AT}\sin\alpha' \cdot \sin\theta - \text{BarHalf}\cos\theta + y_e + R\sin\beta_2$$

$$\Delta z_2 = z_0 + L_{AT}\sin\alpha' \cdot \cos\theta - \text{BarHalf}\sin\theta - z_e - R\cos\beta_2$$

$$f_2 = \Delta x_2^2 + \Delta y_2^2 + \Delta z_2^2 - L_{rod\_l}^2 = 0$$

### 5.5 结构四连杆约束

四连杆 P-A-K-Q-P 的闭环约束等价于以下距离方程：

$$\|PA\| = L_{PA} \quad \text{(APB 刚体)}$$

$$\|AK\| = L_{AK} \quad \text{(KATLR 刚体)}$$

$$\|KQ\| = L_{QK} \quad \text{(UQK 刚体)}$$

$$\|QP\| = L_{PQ} \quad \text{(QP 刚体)}$$

这四个约束由各刚体的内部几何自动满足。$\varphi$ 与 $\phi$ 的关系由四连杆的几何确定（见 5.6 节）。

### 5.6 $\varphi$ 与 $\phi$ 的关系

四连杆 P-A-K-Q-P 中，已知 P 和 A 的位置（固定），给定 QP 的旋转角 $\varphi$，可唯一确定 Q 的位置。然后由 UQK 刚体的 $\|QK\| = L_{QK}$ 和 KATLR 刚体的 $\|AK\| = L_{AK}$，K 的位置由两个圆的交点确定（至多 2 解，由装配构型选择）。

但反过来，若以 $\phi$（KATLR 的旋转角）为变量，则 K 的位置已知，Q 的位置由 $\|KQ\| = L_{QK}$ 和 $\|QP\| = L_{PQ}$ 确定。两种参数化等价——选其一为独立变量，另一个由四连杆几何唯一确定。

在约束方程 $f_1, f_2$ 中，我们选择 $\phi$ 作为独立变量（因为它直接出现在 R、L 的位置公式中），$\varphi$ 随之确定。

---

## 6. 求解流程

### 6.1 阶段 1 — Newton-Raphson 求解 $(\theta, \phi)$

给定输入 $(\beta_1, \beta_2)$，求解非线性方程组：

$$\begin{cases} f_1(\theta, \phi;\ \beta_1) = 0 \\ f_2(\theta, \phi;\ \beta_2) = 0 \end{cases}$$

**Jacobian 矩阵**：

$$J = \begin{bmatrix} \dfrac{\partial f_1}{\partial \theta} & \dfrac{\partial f_1}{\partial \phi} \\[8pt] \dfrac{\partial f_2}{\partial \theta} & \dfrac{\partial f_2}{\partial \phi} \end{bmatrix}$$

**迭代格式**：

$$\begin{pmatrix} \theta \\ \phi \end{pmatrix}^{(k+1)} = \begin{pmatrix} \theta \\ \phi \end{pmatrix}^{(k)} - J^{-1} \begin{pmatrix} f_1 \\ f_2 \end{pmatrix}^{(k)}$$

### 6.2 Jacobian 解析表达式

记 $\alpha' = \alpha + \phi$，$\alpha'$ 对 $\phi$ 的偏导为 $\frac{\partial \alpha'}{\partial \phi} = 1$。

#### $f_1$ 对 $\theta$ 的偏导

$$\frac{\partial \Delta y_1}{\partial \theta} = -L_{AT}\sin\alpha' \cdot \cos\theta - \text{BarHalf}\sin\theta$$

$$\frac{\partial \Delta z_1}{\partial \theta} = -L_{AT}\sin\alpha' \cdot \sin\theta + \text{BarHalf}\cos\theta$$

$$\frac{\partial f_1}{\partial \theta} = 2\left[\Delta y_1 \cdot \frac{\partial \Delta y_1}{\partial \theta} + \Delta z_1 \cdot \frac{\partial \Delta z_1}{\partial \theta}\right]$$

#### $f_1$ 对 $\phi$ 的偏导

$$\frac{\partial \Delta x_1}{\partial \phi} = -L_{AT}\sin\alpha'$$

$$\frac{\partial \Delta y_1}{\partial \phi} = -L_{AT}\cos\alpha' \cdot \sin\theta$$

$$\frac{\partial \Delta z_1}{\partial \phi} = L_{AT}\cos\alpha' \cdot \cos\theta$$

$$\frac{\partial f_1}{\partial \phi} = 2\left[\Delta x_1 \cdot \frac{\partial \Delta x_1}{\partial \phi} + \Delta y_1 \cdot \frac{\partial \Delta y_1}{\partial \phi} + \Delta z_1 \cdot \frac{\partial \Delta z_1}{\partial \phi}\right]$$

$$= 2L_{AT}\left[-\Delta x_1 \sin\alpha' - \Delta y_1 \cos\alpha' \sin\theta + \Delta z_1 \cos\alpha' \cos\theta\right]$$

#### $f_2$ 的偏导

$f_2$ 的偏导与 $f_1$ 完全类似，BarHalf 的符号取反：

$$\frac{\partial \Delta y_2}{\partial \theta} = -L_{AT}\sin\alpha' \cdot \cos\theta + \text{BarHalf}\sin\theta$$

$$\frac{\partial \Delta z_2}{\partial \theta} = -L_{AT}\sin\alpha' \cdot \sin\theta - \text{BarHalf}\cos\theta$$

$$\frac{\partial f_2}{\partial \theta} = 2\left[\Delta y_2 \cdot \frac{\partial \Delta y_2}{\partial \theta} + \Delta z_2 \cdot \frac{\partial \Delta z_2}{\partial \theta}\right]$$

$$\frac{\partial f_2}{\partial \phi} = 2L_{AT}\left[-\Delta x_2 \sin\alpha' - \Delta y_2 \cos\alpha' \sin\theta + \Delta z_2 \cos\alpha' \cos\theta\right]$$

### 6.3 阶段 2 — 结构四连杆位置计算

$(\theta, \phi)$ 求解完成后，所有点的位置可解析计算：

1. **P**：固定点，$P = (L_{BP},\ 0,\ z_0)$
2. **A**：固定点，$A = (L_{BP} + L_{PA},\ 0,\ z_0)$
3. **Q**：由 $\varphi$（从 $\phi$ 经四连杆几何确定）计算
4. **K**：由 $\phi$ 直接计算
5. **U**：由 UQK 三角形（Q 已知，K 已知，三边固定）确定
6. **T, R, L**：由 KATLR 刚体内部几何（K 已知，$\phi$ 已知）确定

### 6.4 完整计算顺序

| 步骤 | 阶段 | 点 | 公式 | 依赖 |
|------|------|---|------|------|
| 1 | — | $P$ | $(L_{BP},\ 0,\ z_0)$ | 固定 |
| 2 | — | $A$ | $(L_{BP}+L_{PA},\ 0,\ z_0)$ | 固定 |
| 3 | — | $D$ | $(x_e,\ y_e+R\sin\beta_1,\ z_e+R\cos\beta_1)$ | $\beta_1$ |
| 4 | — | $F$ | $(x_e,\ -y_e-R\sin\beta_2,\ z_e+R\cos\beta_2)$ | $\beta_2$ |
| 5 | 1 | $\theta, \phi$ | Newton-Raphson 求解 $f_1=f_2=0$ | $\beta_1, \beta_2$ |
| 6 | 2 | $K$ | $A + R_x(\theta) \cdot (L_{AK}\cos(\alpha{+}\gamma{+}\phi),\ 0,\ L_{AK}\sin(\alpha{+}\gamma{+}\phi))$ | $\theta, \phi$ |
| 7 | 2 | $Q$ | 由四连杆几何从 K, A, P 反解 | $\theta, \phi$ |
| 8 | 2 | $U$ | 由 UQK 三角形从 Q, K 确定 | $Q, K$ |
| 9 | 2 | $T$ | $A + R_x(\theta) \cdot (L_{AT}\cos(\alpha{+}\phi),\ 0,\ L_{AT}\sin(\alpha{+}\phi))$ | $\theta, \phi$ |
| 10 | 2 | $R$ | $T + R_x(\theta) \cdot (0,\ \text{BarHalf},\ 0)$ | $T, \theta$ |
| 11 | 2 | $L$ | $T + R_x(\theta) \cdot (0,\ -\text{BarHalf},\ 0)$ | $T, \theta$ |

### 6.5 多解与奇异点

给定 $(\beta_1, \beta_2)$，约束 $f_1 = 0$ 和 $f_2 = 0$ 各定义 $\theta$-$\phi$ 平面上的一条曲线。两条曲线的交点即为解。

- **解的数量**：通常 0、1、2 或 4 个，取决于参数
- **解的选择**：由初始装配位置确定唯一分支（连续性条件）
- **奇异点**：当 $|J| = 0$ 时，机构处于奇异位形，两条约束曲线相切
- **数值求解**：可用有限差分 Jacobian（$\epsilon = 0.001°$），收敛判据 $\|f\| < 10^{-4}$，最大 50 次迭代

---

## 7. 自由度分析

### 7.1 从约束方程直接论证

**广义坐标**：$\mathbf{q} = (\theta, \phi, \beta_1, \beta_2)$，共 4 个变量。

- $\theta$ — APB 绕 AB 方向旋转角
- $\phi$ — 结构四连杆内部自由度（KATLR 的有效旋转角）
- $\beta_1$ — 右舵机角度
- $\beta_2$ — 左舵机角度

**独立约束方程**：$f_1 = 0$ 和 $f_2 = 0$，共 2 个（右连杆和左连杆长度恒定）。

其余约束（刚体内部距离、关节轴线方向、四连杆闭环封闭性）均被位置公式隐式满足。

$$\boxed{F = 4 - 2 = 2}$$

系统有 2 个自由度，对应 2 个主动输入 $(\beta_1, \beta_2)$。

### 7.2 四连杆内部自由度论证

结构四连杆 P-A-K-Q-P 由 4 个刚体通过 4 个旋转关节连接。在平面（XZ）中，由 Gruebler 公式：

$$F_{4bar} = 3(n-1) - 2j = 3 \times 3 - 2 \times 4 = 1$$

四连杆有 1 个内部自由度。当整体绕 +X 轴旋转 $\theta$ 时，四连杆的点被 $R_x(\theta)$ 作用，但内部 1 个自由度不变。

因此，$\theta$ 和 $\phi$ 是独立的被动变量，总共需要 2 个约束方程来确定。

### 7.3 与 Phase 1 模型的对应关系

本模型的刚体分解与 Phase 1 模型（6 体）的对应关系：

| 本模型 (8 体) | Phase 1 (6 体) | 说明 |
|--------------|---------------|------|
| APB | base + arm 的 P, A 部分 | Phase 1 中 base(B) 和 arm 共享 P 点 |
| QP | arm 的 Q 部分 | Phase 1 中 P, Q 在同一 arm 刚体上 |
| UQK | link(P,U) + plate(Q,U,T) 的 Q,U 部分 | Phase 1 中 link 和 plate 通过三角闭环约束 |
| KATLR | plate(Q,U,T) 的 T 部分 + arm 的 R,L | Phase 1 中 T 在 plate 上，R,L 在 arm 上 |
| LF, RD, CD, EF | rod_l, rod_r, servo_r, servo_l | 完全对应 |

被动变量对应：

| 本模型 | Phase 1 | 含义 |
|-------|---------|------|
| $\theta$ | $\theta$ | 绕 +X 轴的整体旋转 |
| $\phi$ | $\psi$ | 内部角度变化（Phase 1 中为 arm 绕 Y 轴旋转） |

物理本质相同，但刚体分解更细致：Phase 1 将 P-A-Q 合并为单一 arm 刚体，本模型将其拆分为 APB 和 QP 两个独立的刚体，并通过四连杆闭环约束连接。

### 7.4 过约束说明

Gruebler-Kutzbach 公式对本机构给出负值自由度（过约束），与实际 $F = 2$ 矛盾。过约束来源：

1. 结构四连杆 4 个旋转关节的轴线方向有附加约束（初始状态下均在 XZ 平面内共面）
2. 左右对称驱动链共享 KATLR 刚体和 APB 刚体
3. B 和 P 均在 AB 轴线上（y=0），使得 $R_x(\theta)$ 对 APB 上 B、P、A 三点无位移效果

由于过约束存在，GK 公式不适用于本机构，直接从约束方程分析更可靠。

---

## 附录 A：符号对照表

| 本文档 | defs.js | 含义 |
|--------|---------|------|
| $O$ | Origin | 世界原点 |
| $B$ | finger_base | 轴承安装点 |
| $P$ | pivot | 枢纽点（三体共享） |
| $A$ | arm_end | 臂端点 |
| $Q$ | arm_ext | 臂延伸点 |
| $U$ | link_joint | 连接关节点 |
| $K$ | plate_end | 板端点 |
| $T$ | tip | 尖端点 |
| $R$ | bar_r | 右横杆端点 |
| $L$ | bar_l | 左横杆端点 |
| $C$ | servo_r | 右舵机中心 |
| $E$ | servo_l | 左舵机中心 |
| $D$ | servo_arm_r | 右舵机臂端点 |
| $F$ | servo_arm_l | 左舵机臂端点 |
| $\theta$ | — | APB 绕 +X 轴旋转角 |
| $\phi$ | — | 四连杆内部自由度 / KATLR 有效旋转角 |
| $\beta_1$ | beta1 | 右舵机角度 |
| $\beta_2$ | — | 左舵机角度（代码中与 beta1 对称） |
| $\alpha$ | alpha | A→T 角度（从 +X 计量） |
| $\gamma$ | gamma | A→K 角度（相对 A→T 方向） |
| $\alpha'$ | — | $\alpha + \phi$，KATLR 上 T 的有效角度 |
| $\eta$ | — | $\alpha + \gamma + \phi$，KATLR 上 K 的有效角度 |

## 附录 B：与 Phase 1 数学模型的差异

| 方面 | Phase 1 | 本模型 |
|------|---------|--------|
| 刚体数量 | 6 (base, arm, link, plate, 2×servo) | 8 (APB, QP, UQK, KATLR, LF, RD, CD, EF) |
| arm 结构 | 单一刚体 P,A,Q,R,L | 拆分为 APB(P,A,B), QP(Q,P), KATLR(K,A,T,L,R) |
| 三角闭环 | P-U-Q（刚性，0 DOF） | 无独立三角闭环 |
| 结构闭环 | 隐含在 arm 刚体内 | 显式四连杆 P-A-K-Q-P（1 DOF） |
| 连杆连接点 | R,L 在 arm 上 A 附近 | R,L 在 KATLR 上 T 的 ±Y 方向 |
| 被动变量 | $(\theta, \psi)$，$\psi$ = arm 绕 Y 旋转 | $(\theta, \phi)$，$\phi$ = 四连杆内部自由度 |
| 板端点 | 无（plate 只有 Q,U,T） | K（plate_end），A→K 定义角度 $\gamma$ |
| 物理等价性 | — | 完全等价，只是分解粒度不同 |
