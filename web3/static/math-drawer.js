/**
 * Math model drawer — right-half panel with KaTeX-rendered equations.
 */
import { onResize } from './scene-builder.js';

// ── Helper ──

function katexReady() {
  return new Promise(resolve => {
    if (window.katex) return resolve();
    const check = () => { if (window.katex) resolve(); else setTimeout(check, 50); };
    check();
  });
}

function renderMath(latex) {
  try {
    return window.katex.renderToString(latex, { displayMode: true, throwOnError: false });
  } catch { return `<code>${latex}</code>`; }
}

function renderMathInline(latex) {
  try {
    return window.katex.renderToString(latex, { displayMode: false, throwOnError: false });
  } catch { return `<code>${latex}</code>`; }
}

// ── Content definitions ──

const SECTIONS = [
  {
    title: '1. 坐标系与固定参数',
    open: true,
    blocks: [
      { type: 'h3', text: '1.1 世界坐标系' },
      { type: 'p', text: '右手系 XYZ，Z 朝上。原点 O = (0, 0, 0)。机构关于 XZ 平面近似对称。' },
      { type: 'p', text: '初始状态下，所有点位于 XZ 平面（Y = 0），横杆端点除外（Y = ±BarHalf）。' },

      { type: 'h3', text: '1.2 固定点（与地面固连）' },
      { type: 'math', latex: 'O = (0,\\ 0,\\ 0) \\quad \\text{--- 世界原点}' },
      { type: 'math', latex: 'B = (0,\\ 0,\\ z_0) \\quad \\text{--- 轴承安装位置（固定）}' },
      { type: 'math', latex: 'C = (x_e,\\ +y_e,\\ z_e) \\quad \\text{--- 右舵机旋转中心（固定）}' },
      { type: 'math', latex: 'E = (x_e,\\ -y_e,\\ z_e) \\quad \\text{--- 左舵机旋转中心（固定）}' },

      { type: 'h3', text: '1.3 结构参数（设计常数）' },
      {
        type: 'table',
        headers: ['参数', '默认值', '单位', '含义'],
        rows: [
          ['$x_e$', '11', 'mm', '舵机面到 YZ 平面的 X 距离'],
          ['$z_e$', '0', 'mm', '舵机中心 Z 偏移'],
          ['$y_e$', '16', 'mm', '舵机中心到 XZ 平面的 Y 距离'],
          ['$R$', '16', 'mm', '舵机摇臂半径'],
          ['$z_0$', '36', 'mm', '轴承安装高度'],
          ['$L_{BP}$', '10', 'mm', 'B → P 距离'],
          ['$L_{PQ}$', '50', 'mm', 'P → Q 距离'],
          ['$L_{QU}$', '40', 'mm', 'Q → U 距离'],
          ['$L_{PA}$', '7', 'mm', 'P → A 距离'],
          ['$L_{AT}$', '7', 'mm', 'A → T 长度'],
          ['$\\alpha$', '35', '°', 'A → T 角度（从 +X）'],
          ['$L_{AR}$', '50', 'mm', 'A → K 长度'],
          ['$\\gamma$', '70', '°', 'A → K 角度（相对 A→T）'],
          ['$\\text{BarHalf}$', '7', 'mm', 'T 横杆半宽'],
        ],
      },

      { type: 'h3', text: '1.4 被动参数（由初始配置自动计算）' },
      { type: 'math', latex: 'L_{rod\\_r} = \\|R_0 - D_0\\| \\quad \\text{--- 右连杆长度}' },
      { type: 'math', latex: 'L_{rod\\_l} = \\|L_0 - F_0\\| \\quad \\text{--- 左连杆长度}' },
      { type: 'math', latex: 'L_{QK} = \\|Q_0 - K_0\\| \\quad \\text{--- UQK 三角形 QK 边长}' },
      { type: 'math', latex: 'L_{UK} = \\|U_0 - K_0\\| \\quad \\text{--- UQK 三角形 UK 边长}' },

      { type: 'h3', text: '1.5 旋转矩阵' },
      { type: 'p', text: 'AB 轴旋转（轴承在 B 处，APB 绕 AB 方向旋转；AB 平行于 +X，位于 z = z₀。等价于平移至 B 后施加 Rx(θ) 再平移回来）：' },
      { type: 'math', latex: 'R_x(\\theta) = \\begin{bmatrix} 1 & 0 & 0 \\\\ 0 & \\cos\\theta & -\\sin\\theta \\\\ 0 & \\sin\\theta & \\cos\\theta \\end{bmatrix}' },

      { type: 'h3', text: '1.6 初始配置下的关键点坐标' },
      { type: 'p', text: '初始状态下 θ = 0，所有点位于 XZ 平面：' },
      { type: 'math', latex: 'P_0 = (L_{BP},\\ 0,\\ z_0)' },
      { type: 'math', latex: 'A_0 = (L_{BP} + L_{PA},\\ 0,\\ z_0)' },
      { type: 'math', latex: 'Q_0 = (L_{BP},\\ 0,\\ z_0 + L_{PQ})' },
      { type: 'math', latex: 'U_0 = (L_{BP},\\ 0,\\ z_0 + L_{PQ} + L_{QU})' },
      { type: 'math', latex: 'T_0 = (L_{BP} + L_{PA} + L_{AT}\\cos\\alpha,\\ 0,\\ z_0 + L_{AT}\\sin\\alpha)' },
      { type: 'math', latex: 'K_0 = (L_{BP} + L_{PA} + L_{AR}\\cos(\\alpha\\!+\\!\\gamma),\\ 0,\\ z_0 + L_{AR}\\sin(\\alpha\\!+\\!\\gamma))' },
      { type: 'math', latex: 'D_0 = (x_e,\\ y_e + R\\sin\\beta_1,\\ z_e + R\\cos\\beta_1)' },
      { type: 'math', latex: 'F_0 = (x_e,\\ -y_e - R\\sin\\beta_1,\\ z_e + R\\cos\\beta_1)' },
    ],
  },
  {
    title: '2. 刚体几何构成',
    blocks: [
      { type: 'p', text: '系统由 8 个刚体组成。每个刚体内部尺寸在运动过程中保持恒定。' },

      { type: 'h3', text: '2.1 APB — 基座刚体（点 B, P, A）' },
      { type: 'p', text: '在 APB 的局部坐标系中（原点 P，θ = 0 时）：' },
      { type: 'math', latex: 'B_{local} = (-L_{BP},\\ 0,\\ 0), \\quad P_{local} = (0,\\ 0,\\ 0), \\quad A_{local} = (L_{PA},\\ 0,\\ 0)' },
      { type: 'ul', items: [
        '‖BP‖ = L_{BP}',
        '‖PA‖ = L_{PA}',
        '‖BA‖ = L_{BP} + L_{PA}（三点共线）',
      ]},
      { type: 'p', text: '关键性质：APB 绕 AB 轴旋转 θ 后，B、P、A 三点均在 AB 轴上（y=0, z=z₀），坐标不变。' },

      { type: 'h3', text: '2.2 QP — 臂延伸刚体（点 Q, P）' },
      { type: 'math', latex: 'Q_{local} = (0,\\ 0,\\ L_{PQ}), \\quad \\|PQ\\| = L_{PQ}' },

      { type: 'h3', text: '2.3 UQK — 连接三角刚体（点 U, Q, K）' },
      { type: 'ul', items: [
        '‖QU‖ = L_{QU}',
        '‖QK‖ = L_{QK}（被动参数）',
        '‖UK‖ = L_{UK}（被动参数）',
      ]},
      { type: 'p', text: '三角形 UQK 初始配置设定后形状完全固定，运动中不变形。' },

      { type: 'h3', text: '2.4 KATLR — 手指板刚体（点 K, A, T, L, R）' },
      { type: 'p', html: true, text: 'K 相对 A：距离 L<sub>AR</sub>，方向角 (α+γ)；T 相对 A：距离 L<sub>AT</sub>，方向角 α。R = T + (0, +BarHalf, 0)，L = T + (0, −BarHalf, 0)。' },
      { type: 'math', latex: '\\|TK\\| = \\sqrt{L_{AT}^2 + L_{AR}^2 - 2 L_{AT} L_{AR} \\cos\\gamma} \\quad \\text{（常数）}' },
      { type: 'p', text: '关键：KATLR 同时包含 A（与 APB 共享）和 K（与 UQK 共享），形成结构闭环。' },

      { type: 'h3', text: '2.5–2.8 连杆与舵机臂' },
      { type: 'ul', items: [
        'LF（左连杆）：‖LF‖ = L_rod_l，两端球关节',
        'RD（右连杆）：‖RD‖ = L_rod_r，两端球关节',
        'CD（右舵机臂）：‖CD‖ = R，C 固定',
        'EF（左舵机臂）：‖EF‖ = R，E 固定',
      ]},
    ],
  },
  {
    title: '3. 连接关系与关节',
    blocks: [
      {
        type: 'table',
        headers: ['#', '关节', '连接刚体', '类型', 'DOF'],
        rows: [
          ['1', 'B (轴承)', 'APB ↔ Ground', 'Revolute AB', '1'],
          ['2', 'P', 'APB ↔ QP', 'Revolute', '1'],
          ['3', 'A', 'APB ↔ KATLR', 'Revolute', '1'],
          ['4', 'Q', 'QP ↔ UQK', 'Revolute', '1'],
          ['5', 'K', 'UQK ↔ KATLR', 'Revolute', '1'],
          ['6', 'R', 'KATLR ↔ RD', 'Spherical', '3'],
          ['7', 'D', 'RD ↔ CD', 'Spherical', '3'],
          ['8', 'L', 'KATLR ↔ LF', 'Spherical', '3'],
          ['9', 'F', 'LF ↔ EF', 'Spherical', '3'],
          ['10', 'C', 'CD ↔ Ground', 'Revolute β₁', '1'],
          ['11', 'E', 'EF ↔ Ground', 'Revolute β₂', '1'],
        ],
      },

      { type: 'h3', text: '3.2 闭环结构' },
      { type: 'p', text: '闭环 1 — 结构四连杆 P-A-K-Q-P：' },
      { type: 'math', latex: 'APB \\xrightarrow{P} QP \\xrightarrow{Q} UQK \\xrightarrow{K} KATLR \\xrightarrow{A} APB' },
      { type: 'ul', items: [
        '杆 1 (APB)：P → A，长度 L_{PA}',
        '杆 2 (KATLR)：A → K，长度 L_{AR}',
        '杆 3 (UQK)：K → Q，长度 L_{QK}',
        '杆 4 (QP)：Q → P，长度 L_{PQ}',
      ]},
      { type: 'p', text: '闭环 2 — 右驱动链 C→D→R→KATLR→APB→Ground' },
      { type: 'p', text: '闭环 3 — 左驱动链 E→F→L→KATLR→APB→Ground' },

      { type: 'h3', text: '3.3 拓扑图' },
      { type: 'pre', text:
`Ground (O, B, C, E 固定)
  │
  ├──[Rev AB, θ]── APB (B, P, A)
  │     │              │
  │     ├─[Rev]─ QP    └─[Rev]─ KATLR
  │     │          │              │    │
  │     │          └─[Rev]─ UQK──┘    │
  │     │                     │        │
  │     │              [Sph]  [Sph]    │
  │     │               RD     LF      │
  │     │              [Sph]  [Sph]    │
  ├──[Rev β₁]── CD(D)  EF(F) ──[Rev β₂]` },
    ],
  },
  {
    title: '4. 变量分类',
    blocks: [
      { type: 'h3', text: '4.1 主动输入（由舵机驱动）' },
      { type: 'math', latex: '\\mathbf{q}_{in} = (\\beta_1,\\ \\beta_2)^T' },
      { type: 'ul', items: [
        'β₁ — 右舵机旋转角（驱动 D 点运动）',
        'β₂ — 左舵机旋转角（驱动 F 点运动）',
      ]},

      { type: 'h3', text: '4.2 被动变量' },
      { type: 'math', latex: '\\mathbf{q}_{passive} = (\\theta,\\ \\phi)^T' },
      { type: 'ul', items: [
        'θ — APB 绕 AB 方向的旋转角',
        'φ — 结构四连杆 P-A-K-Q-P 的内部自由度',
      ]},
      { type: 'p', text: 'φ 与 Phase 1 的 ψ（arm 绕 Y 轴旋转角）等价。' },

      { type: 'h3', text: '4.3 两阶段求解' },
      { type: 'p', text: '阶段 1 — 驱动系统：给定 (β₁, β₂)，由连杆长度约束求解被动变量 (θ, φ)。' },
      { type: 'math', latex: '\\begin{cases} f_1(\\theta,\\ \\phi;\\ \\beta_1) = 0 \\\\ f_2(\\theta,\\ \\phi;\\ \\beta_2) = 0 \\end{cases}' },
      { type: 'p', text: '阶段 2 — 结构四连杆：给定 (θ, φ)，各点位置可解析计算，无需迭代。' },
    ],
  },
  {
    title: '5. 约束方程',
    blocks: [
      { type: 'h3', text: '5.1 位置公式' },
      { type: 'p', text: 'APB 上 B、P、A 均在 AB 轴上，Rx(θ) 不改变其坐标。下游点受 θ 和 φ 影响。' },
      { type: 'p', text: 'Q 的全局坐标：' },
      { type: 'math', latex: 'Q(\\theta, \\varphi) = \\begin{pmatrix} L_{BP} + L_{PQ}\\sin\\varphi \\\\ -L_{PQ}\\cos\\varphi \\cdot \\sin\\theta \\\\ z_0 + L_{PQ}\\cos\\varphi \\cdot \\cos\\theta \\end{pmatrix}' },
      { type: 'p', html: true, text: '记 α\' = α + φ，η = α + γ + φ。K、T、R、L 的全局坐标：' },
      { type: 'math', latex: 'K(\\theta, \\phi) = A + R_x(\\theta) \\cdot \\begin{pmatrix} L_{AR}\\cos\\eta \\\\ 0 \\\\ L_{AR}\\sin\\eta \\end{pmatrix}' },
      { type: 'math', latex: 'T(\\theta, \\phi) = A + R_x(\\theta) \\cdot \\begin{pmatrix} L_{AT}\\cos\\alpha\' \\\\ 0 \\\\ L_{AT}\\sin\\alpha\' \\end{pmatrix}' },
      { type: 'math', latex: 'R = T + R_x(\\theta)\\cdot(0,\\,\\text{BarHalf},\\,0), \\quad L = T + R_x(\\theta)\\cdot(0,\\,-\\text{BarHalf},\\,0)' },

      { type: 'h3', text: '5.2 舵机子系统' },
      { type: 'math', latex: 'D(\\beta_1) = \\begin{pmatrix} x_e \\\\ y_e + R\\sin\\beta_1 \\\\ z_e + R\\cos\\beta_1 \\end{pmatrix}, \\quad F(\\beta_2) = \\begin{pmatrix} x_e \\\\ -y_e - R\\sin\\beta_2 \\\\ z_e + R\\cos\\beta_2 \\end{pmatrix}' },

      { type: 'h3', text: '5.3 连杆长度约束' },
      { type: 'math', latex: '\\boxed{f_1(\\theta, \\phi;\\ \\beta_1) = \\|R(\\theta, \\phi) - D(\\beta_1)\\|^2 - L_{rod\\_r}^2 = 0}' },
      { type: 'math', latex: '\\boxed{f_2(\\theta, \\phi;\\ \\beta_2) = \\|L(\\theta, \\phi) - F(\\beta_2)\\|^2 - L_{rod\\_l}^2 = 0}' },

      { type: 'h3', text: '5.4 约束方程展开' },
      { type: 'p', html: true, text: '记 α\' = α + φ。' },
      { type: 'p', text: '右连杆 f₁ 的 Δ 分量：' },
      { type: 'math', latex: '\\Delta x_1 = L_{BP} + L_{PA} + L_{AT}\\cos\\alpha\' - x_e' },
      { type: 'math', latex: '\\Delta y_1 = -L_{AT}\\sin\\alpha\' \\cdot \\sin\\theta + \\text{BH}\\cos\\theta - y_e - R\\sin\\beta_1' },
      { type: 'math', latex: '\\Delta z_1 = z_0 + L_{AT}\\sin\\alpha\' \\cdot \\cos\\theta + \\text{BH}\\sin\\theta - z_e - R\\cos\\beta_1' },
      { type: 'math', latex: 'f_1 = \\Delta x_1^2 + \\Delta y_1^2 + \\Delta z_1^2 - L_{rod\\_r}^2 = 0' },
      { type: 'p', text: '左连杆 f₂ 的 Δ 分量（BarHalf 符号取反，y_e 符号取反）：' },
      { type: 'math', latex: '\\Delta x_2 = \\Delta x_1' },
      { type: 'math', latex: '\\Delta y_2 = -L_{AT}\\sin\\alpha\' \\cdot \\sin\\theta - \\text{BH}\\cos\\theta + y_e + R\\sin\\beta_2' },
      { type: 'math', latex: '\\Delta z_2 = z_0 + L_{AT}\\sin\\alpha\' \\cdot \\cos\\theta - \\text{BH}\\sin\\theta - z_e - R\\cos\\beta_2' },
      { type: 'math', latex: 'f_2 = \\Delta x_2^2 + \\Delta y_2^2 + \\Delta z_2^2 - L_{rod\\_l}^2 = 0' },

      { type: 'h3', text: '5.5 结构四连杆约束' },
      { type: 'math', latex: '\\|PA\\| = L_{PA},\\ \\|AK\\| = L_{AR},\\ \\|KQ\\| = L_{QK},\\ \\|QP\\| = L_{PQ}' },
      { type: 'p', text: '这四个约束由各刚体内部几何自动满足。φ 与 φ 的关系由四连杆几何确定。' },
    ],
  },
  {
    title: '6. 求解流程',
    blocks: [
      { type: 'h3', text: '6.1 Newton-Raphson 求解 (θ, φ)' },
      { type: 'math', latex: 'J = \\begin{bmatrix} \\dfrac{\\partial f_1}{\\partial \\theta} & \\dfrac{\\partial f_1}{\\partial \\phi} \\\\[6pt] \\dfrac{\\partial f_2}{\\partial \\theta} & \\dfrac{\\partial f_2}{\\partial \\phi} \\end{bmatrix}' },
      { type: 'math', latex: '\\begin{pmatrix} \\theta \\\\ \\phi \\end{pmatrix}^{(k+1)} = \\begin{pmatrix} \\theta \\\\ \\phi \\end{pmatrix}^{(k)} - J^{-1} \\begin{pmatrix} f_1 \\\\ f_2 \\end{pmatrix}^{(k)}' },

      { type: 'h3', text: '6.2 Jacobian 解析表达式' },
      { type: 'p', html: true, text: '记 α\' = α + φ。' },
      { type: 'p', text: 'f₁ 对 θ 的偏导：' },
      { type: 'math', latex: '\\frac{\\partial f_1}{\\partial \\theta} = 2\\left[\\Delta y_1 \\cdot \\frac{\\partial \\Delta y_1}{\\partial \\theta} + \\Delta z_1 \\cdot \\frac{\\partial \\Delta z_1}{\\partial \\theta}\\right]' },
      { type: 'p', text: 'f₁ 对 φ 的偏导：' },
      { type: 'math', latex: '\\frac{\\partial f_1}{\\partial \\phi} = 2L_{AT}\\left[-\\Delta x_1 \\sin\\alpha\' - \\Delta y_1 \\cos\\alpha\' \\sin\\theta + \\Delta z_1 \\cos\\alpha\' \\cos\\theta\\right]' },
      { type: 'p', text: 'f₂ 的偏导与 f₁ 类似，BarHalf 符号取反。' },

      { type: 'h3', text: '6.3 计算顺序' },
      {
        type: 'table',
        headers: ['步骤', '点', '公式', '依赖'],
        rows: [
          ['1', '$P$', '$(L_{BP},\\,0,\\,z_0)$', '固定'],
          ['2', '$A$', '$(L_{BP}\\!+\\!L_{PA},\\,0,\\,z_0)$', '固定'],
          ['3', '$D$', '$C + (0, R\\sin\\beta_1, R\\cos\\beta_1)$', '$\\beta_1$'],
          ['4', '$F$', '$E + (0, -R\\sin\\beta_2, R\\cos\\beta_2)$', '$\\beta_2$'],
          ['5', '$\\theta, \\phi$', 'Newton-Raphson', '$\\beta_1, \\beta_2$'],
          ['6', '$K$', '$A + R_x(\\theta) \\cdot (L_{AR}\\cos\\eta,\\,0,\\,L_{AR}\\sin\\eta)$', '$\\theta, \\phi$'],
          ['7', '$Q$', '四连杆几何反解', '$\\theta, \\phi$'],
          ['8', '$U$', 'UQK 三角形', '$Q, K$'],
          ['9', '$T$', '$A + R_x(\\theta) \\cdot (L_{AT}\\cos\\alpha\',\\,0,\\,L_{AT}\\sin\\alpha\')$', '$\\theta, \\phi$'],
          ['10', '$R, L$', '$T \\pm R_x(\\theta)\\cdot(0, \\text{BH}, 0)$', '$T, \\theta$'],
        ],
      },

      { type: 'h3', text: '6.4 多解与奇异点' },
      { type: 'ul', items: [
        '解的数量：通常 0、1、2 或 4 个',
        '解的选择：由初始装配位置确定唯一分支',
        '奇异点：|J| = 0 时两条约束曲线相切',
      ]},
    ],
  },
  {
    title: '7. 自由度分析',
    blocks: [
      { type: 'p', text: '广义坐标 q = (θ, φ, β₁, β₂)，共 4 个变量。' },
      { type: 'p', text: '独立约束方程 f₁ = 0 和 f₂ = 0，共 2 个。' },
      { type: 'math', latex: '\\boxed{F = 4 - 2 = 2}' },
      { type: 'p', text: '系统有 2 个自由度，对应 2 个主动输入 (β₁, β₂)。' },

      { type: 'h3', text: '7.2 四连杆内部自由度' },
      { type: 'math', latex: 'F_{4bar} = 3(n{-}1) - 2j = 3 \\times 3 - 2 \\times 4 = 1' },
      { type: 'p', text: '四连杆有 1 个内部自由度。θ 和 φ 是独立的被动变量。' },

      { type: 'h3', text: '7.3 与 Phase 1 的对应' },
      {
        type: 'table',
        headers: ['本模型 (8 体)', 'Phase 1 (6 体)'],
        rows: [
          ['APB (B,P,A)', 'base + arm 的 P,A'],
          ['QP (Q,P)', 'arm 的 Q'],
          ['UQK (U,Q,K)', 'link + plate 的 Q,U'],
          ['KATLR (K,A,T,L,R)', 'plate 的 T + arm 的 R,L'],
          ['LF, RD, CD, EF', 'rod_l, rod_r, servo'],
        ],
      },
      {
        type: 'table',
        headers: ['本模型', 'Phase 1', '含义'],
        rows: [
          ['$\\theta$', '$\\theta$', '绕 AB 轴旋转'],
          ['$\\phi$', '$\\psi$', '内部角度变化'],
        ],
      },
    ],
  },
];

// ── DOM builder ──

function buildContent(container) {
  for (const section of SECTIONS) {
    const h2 = document.createElement('h2');
    h2.textContent = section.title;
    if (section.open) h2.classList.add('expanded');
    container.appendChild(h2);

    const body = document.createElement('div');
    body.className = 'section-body' + (section.open ? ' open' : '');
    container.appendChild(body);

    h2.addEventListener('click', () => {
      h2.classList.toggle('expanded');
      body.classList.toggle('open');
    });

    for (const block of section.blocks) {
      body.appendChild(buildBlock(block));
    }
  }
}

function buildBlock(block) {
  switch (block.type) {
    case 'h3': {
      const el = document.createElement('h3');
      el.textContent = block.text;
      return el;
    }
    case 'p': {
      const el = document.createElement('p');
      if (block.html) {
        el.innerHTML = inlineMath(block.text);
      } else {
        el.textContent = block.text;
      }
      return el;
    }
    case 'math': {
      const el = document.createElement('div');
      el.className = 'math-block';
      el.innerHTML = renderMath(block.latex);
      return el;
    }
    case 'table': {
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      for (const h of block.headers) {
        const th = document.createElement('th');
        th.innerHTML = inlineMath(h);
        hr.appendChild(th);
      }
      thead.appendChild(hr);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      for (const row of block.rows) {
        const tr = document.createElement('tr');
        for (const cell of row) {
          const td = document.createElement('td');
          td.innerHTML = inlineMath(cell);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      return table;
    }
    case 'ul': {
      const ul = document.createElement('ul');
      for (const item of block.items) {
        const li = document.createElement('li');
        li.innerHTML = inlineMath(item);
        ul.appendChild(li);
      }
      return ul;
    }
    case 'pre': {
      const el = document.createElement('pre');
      el.textContent = block.text;
      return el;
    }
    default: {
      const el = document.createElement('p');
      el.textContent = block.text || '';
      return el;
    }
  }
}

function inlineMath(text) {
  return text.replace(/\$(.+?)\$/g, (_, latex) => renderMathInline(latex));
}

// ── Toggle logic ──

export async function initMathDrawer() {
  await katexReady();

  const drawer = document.getElementById('math-drawer');
  const content = document.getElementById('math-drawer-content');
  const viewport = document.getElementById('viewport');
  const btn = document.getElementById('math-toggle');

  buildContent(content);

  let isOpen = false;
  const toggle = () => {
    isOpen = !isOpen;
    drawer.classList.toggle('open', isOpen);
    viewport.classList.toggle('shrunk', isOpen);
    btn.classList.toggle('active', isOpen);
  };

  btn.addEventListener('click', toggle);

  // Resize Three.js after transition ends
  drawer.addEventListener('transitionend', () => {
    onResize();
  });
}
