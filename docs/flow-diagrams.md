# HRMS 关键流程图

> **范围**：7 业务流程 + 1 系统架构图 + 2 ER 图
> **关联文档**：[`HRMS-V1.2.md`](./HRMS-V1.2.md) · [API Spec](./api-spec.md)

> **使用方式**：Mermaid 语法，可在 GitHub / GitLab / VSCode Mermaid 插件 / 各类文档平台直接渲染。也可粘贴到 https://mermaid.live 在线查看。

## 一、7 个核心业务流程

### 1.1 入职流程

```mermaid
flowchart TD
    A[HR 发起入职登记] --> B{数据来源}
    B -->|对接招聘系统| C[导入 Offer 数据<br/>二期]
    B -->|手工录入| D[填写基础信息]
    D --> E[AI OCR 收集证件<br/>M0.5-5 底座]
    E --> F[系统自动生成工号<br/>走 configs.employee_no]
    F --> G[发起合同签署<br/>M1 A7: e-签宝]
    G --> H[HR 审核合同]
    H --> I[开通系统账号<br/>分配角色]
    I --> J[设备发放 / 工位安排<br/>导师分配]
    J --> K[入职引导清单<br/>AI Copilot 提示]
    K --> L[入职完成<br/>status: probation]

    C -.待二期.-> D

    style E fill:#e1f5ff
    style G fill:#fff4e1
    style K fill:#f0e1ff
```

**关键节点**：
- **F**：工号生成走 `configs.employee_no.format`（配置化），规则 `{company_code}{year}{seq:4}`
- **G**：合同签署走 M0.5-1 审批流 + M1 A7 电子签
- **K**：M1 A3 阶段可叠加 AI 入职 Copilot

### 1.2 离职流程

```mermaid
flowchart TD
    A[员工 / 公司发起离职申请] --> B[填写离职原因]
    B --> C[发起离职审批<br/>M0.5-1]
    C --> D{审批人链}
    D -->|直属上级| E[1. 工作交接清单<br/>部门负责人确认]
    E --> F[2. 设备归还]
    F --> G[3. 账号禁用<br/>门禁回收]
    G --> H[4. 薪资结算]
    H --> I[5. 社保减员<br/>公积金封存]
    I --> J[6. 档案归档<br/>保留 5 年]
    J --> K[员工状态: resigned]

    H --> H1[未发工资 + 补偿金<br/>+ 调休折现]
    I --> I1[社保局申报<br/>走第三方对接 M0.5-4]

    style C fill:#fff4e1
    style H fill:#ffe1e1
```

**关键节点**：
- **C**：离职审批用 M0.5-1 审批流基础设施
- **H**：薪资结算调 M4 算薪引擎
- **J**：保留 5 年走 `configs.archive.years`

### 1.3 调动流程

```mermaid
flowchart TD
    A[HR / 部门发起调动申请] --> B[填写调动信息<br/>调出/调入部门 + 岗位]
    B --> C[审批链<br/>M0.5-1 条件分支]
    C --> D{调动类型}
    D -->|平调| E[1. 调出部门负责人]
    D -->|晋升/降职| F[1. 调出部门负责人<br/>+ 薪酬变更申请]

    E --> G[2. 调入部门负责人]
    F --> G

    G --> H[3. HR 审核]
    H --> I[4. 总经理审批]
    I --> J{审批通过?}
    J -->|否| K[流程结束]
    J -->|是| L[生效日触发更新]

    L --> M[更新部门 / 岗位 / 汇报关系]
    L --> N[更新薪酬标准<br/>如适用]
    L --> O[更新系统权限<br/>角色 + 数据范围]
    L --> P[写审计 + 通知员工]

    style C fill:#fff4e1
    style L fill:#e1ffe1
```

**关键节点**：
- **C**：M0.5-1 审批流模板支持条件分支（晋升/降职需多一个薪酬变更节点）
- **L**：调动生效日系统自动联动 4 项更新

### 1.4 请假流程

```mermaid
flowchart TD
    A[员工提交请假申请] --> B[选择假期类型<br/>+ 起止日期 + 事由]
    B --> C{系统校验}
    C -->|年假/调休余额不足| D[禁止提交<br/>提示余额不足]
    C -->|通过| E[计算请假天数]

    E --> F{请假天数}
    F -->|≤ 3 天| G[审批链 A<br/>直属上级 → HR]
    F -->|> 3 天| H[审批链 B<br/>直属 → 部门 → HR → 总经理]

    G --> I{审批结果}
    H --> I

    I -->|通过| J[更新假期余额<br/>写入考勤]
    I -->|驳回| K[通知员工<br/>可修改重提]
    I -->|超时未审| L[24h 提醒<br/>48h 升级]

    J --> M[通知 HR + 部门负责人<br/>M0.5-2 通知基础设施]

    style C fill:#e1f5ff
    style G fill:#fff4e1
    style H fill:#fff4e1
    style M fill:#e1ffe1
```

**关键节点**：
- **C**：年假/调休余额走 `configs.leave.annual_days` + `calculateLeaveBalance()`
- **G/H**：审批链分支走 M0.5-1 条件分支
- **L**：超时升级走 M0.5-2 通知基础设施

### 1.5 加班流程

```mermaid
flowchart TD
    A[员工提交加班申请<br/>事前申请] --> B[填写预计时长<br/>+ 事由 + 项目]
    B --> C{系统校验}
    C -->|超 36h/月| D[禁止提交<br/>劳动法限制]
    C -->|通过| E[直属上级审批<br/>M0.5-1]

    E --> F{审批结果}
    F -->|通过| G[加班发生<br/>实际打卡]
    F -->|驳回| H[通知员工]

    G --> I[月底结算]
    I --> J{员工选择补偿}
    J -->|加班费| K[按法定标准计算<br/>进入下月工资]
    J -->|调休| L[1:1 累计<br/>有效期 6 个月]

    K --> M[走 M4 算薪]
    L --> N[写入调休余额]

    style E fill:#fff4e1
    style C fill:#e1f5ff
```

**关键节点**：
- **C**：36h 上限走 `configs.overtime.monthly_hours_cap`
- **J**：加班费/调休二选一

### 1.6 月度薪酬核算

```mermaid
flowchart TD
    A[每月 1 日<br/>自动生成考勤报表] --> B[员工 3 日前确认]
    B --> C{已确认?}
    C -->|否| D[逾期默认确认]
    C -->|是| E
    D --> E[HR 5 日前锁定考勤]
    E --> F[自动触发算薪<br/>M4 算薪引擎]

    F --> G[读取考勤数据]
    G --> H[读取绩效系数<br/>M3 联动]
    H --> I[读取社保方案<br/>按参保地匹配]
    I --> J[应发 - 应扣 - 实发<br/>应发 = 基本 + 绩效 + 补贴 + 提成 + 加班<br/>应扣 = 社保 + 公积金 + 个税 + 请假扣款]

    J --> K[生成工资单]
    K --> L[AI 算薪校验摘要<br/>M0.5-5: 与上月对比]
    L --> M[异常项提示 HR]

    M --> N{异常?}
    N -->|是| O[HR 复核 + 修正]
    N -->|否| P[HR 提交财务复核]
    O --> P

    P --> Q[总经理审批<br/>M0.5-1]
    Q --> R[生成工资条<br/>走 M0.5-2 通知]
    R --> S[生成银行代发文件]
    S --> T[财务发放]

    style L fill:#f0e1ff
    style M fill:#f0e1ff
    style R fill:#e1ffe1
```

**关键节点**：
- **H**：绩效系数由 M3 月度考核结果联动
- **I**：社保方案按 `configs.social_insurance` 按城市匹配
- **L**：AI 算薪校验摘要（V1.2 新增能力）
- **R**：工资条推送走 M0.5-2 通知基础设施

### 1.7 月度绩效考核

```mermaid
flowchart TD
    A[每月 25 日<br/>员工提交自评] --> B[填写 KPI 完成度<br/>+ OKR 进展]
    B --> C[每月 27 日<br/>直属上级评分]
    C --> D[AI 评分建议<br/>M0.5-5 底座]
    D --> E[上级查看 AI 建议<br/>+ 依据]
    E --> F[上级调整 / 确认]

    F --> G[每月 28 日<br/>部门负责人校准]
    G --> H[每月 29 日<br/>HR 汇总]
    H --> I[每月 30 日<br/>总经理审批<br/>M0.5-1]

    I --> J{审批通过?}
    J -->|否| K[退回 HR 调整]
    J -->|是| L[结果归档]

    L --> M[绩效系数写入<br/>configs.performance.coefficient]
    L --> N[联动 M4 算薪<br/>次月 1 日生效]
    L --> O[触发调薪 / 晋升 / PIP 评估]

    O --> P{绩效结果}
    P -->|S/A| Q[调薪优先 / 晋升候选]
    P -->|B| R[正常]
    P -->|C/D| S[纳入培训计划]
    P -->|连续 2 季度 D| T[触发 PIP<br/>3 个月改进期]

    style D fill:#f0e1ff
    style E fill:#f0e1ff
    style N fill:#ffe1e1
```

**关键节点**：
- **D/E**：AI 评分建议（V1.2 新增能力 M3 D2 切片）
- **M**：绩效系数写入 `configs.performance.coefficient` 走版本回溯
- **N**：次月 1 日自动联动 M4 算薪

## 二、系统架构图

### 2.1 HRMS 整体技术架构

```mermaid
flowchart TB
    subgraph Client[客户端层]
        Web[Vue 3 H5<br/>Element Plus]
        MobileH5[Vue 3 H5<br/>移动端适配]
    end

    subgraph Edge[接入层]
        Nginx[Nginx 反向代理<br/>SSL 终止]
    end

    subgraph Server[应用层 - Node.js + Express + TS]
        Auth[Auth Module<br/>JWT + Refresh]
        API[REST API<br/>/api/*]
        MWS[中间件链<br/>helmet/cors/<br/>rate-limit/rbac]
    end

    subgraph Bus[业务模块 - M0.5+]
        Approval[审批流 M0.5-1]
        Notify[通知 M0.5-2]
        Encrypt[加密 M0.5-3]
        Integr[对接 M0.5-4]
        AI[AI 底座 M0.5-5]
        HR[组织人事 M1]
        Att[考勤 M2]
        Perf[绩效 M3]
        Pay[薪酬 M4]
    end

    subgraph Data[数据层]
        PG[(PostgreSQL 15+<br/>含 pgvector)]
        Redis[(Redis<br/>Cache + Queue +<br/>Refresh Token)]
        Bull[BullMQ 队列]
    end

    subgraph External[外部服务]
        SMS[短信网关<br/>阿里云/腾讯云]
        Email[SMTP 邮件]
        Map[腾讯地图 API]
        LLM[LLM 网关<br/>OpenAI/DeepSeek]
        OCR[OCR 服务<br/>腾讯云/百度]
        ES[e-签宝]
    end

    Web --> Nginx
    MobileH5 --> Nginx
    Nginx --> MWS
    MWS --> Auth
    MWS --> API
    API --> Approval
    API --> Notify
    API --> Encrypt
    API --> Integr
    API --> AI
    API --> HR
    API --> Att
    API --> Perf
    API --> Pay

    Approval --> PG
    Approval --> Redis
    Notify --> Bull
    Encrypt --> PG
    AI --> PG
    HR --> PG
    Att --> PG
    Perf --> PG
    Pay --> PG

    Bull --> Redis
    Bull --> SMS
    Bull --> Email
    AI --> LLM
    AI --> OCR
    HR --> ES
    Att --> Map

    style AI fill:#f0e1ff
    style Encrypt fill:#ffe1e1
    style ES fill:#fff4e1
```

**关键说明**：
- **M0.5 公共底座层**（审批/通知/加密/对接/AI）被所有业务模块复用
- **数据层**：PostgreSQL 启用 pgvector 扩展承载 AI 嵌入
- **Redis**：同时承担缓存、队列（BullMQ）、refresh token 三种角色
- **外部服务**：通过 M0.5-4 对接框架统一管理

## 三、ER 图

### 3.1 组织架构数据模型

```mermaid
erDiagram
    Company ||--o{ Department : "1:n"
    Company ||--o{ Employee : "1:n"
    Department ||--o{ Department : "父子层级"
    Department ||--o{ Employee : "1:n"
    Department ||--o| Employee : "leaderId"
    User ||--o| Employee : "1:1"
    User ||--o{ UserRole : "1:n"
    Role ||--o{ UserRole : "1:n"
    Employee ||--o{ EmployeePositionHistory : "1:n（V1.2 新增）"
    Employee ||--o{ SalaryHistory : "1:n（V1.2 新增）"

    Company {
        uuid id PK
        string code UK "法人代码 XACH/XACX/SCXH"
        string name "公司名"
        string status
        timestamp created_at
    }

    Department {
        uuid id PK
        uuid company_id FK
        uuid parent_id FK "自引用，部门层级"
        string code UK
        string name
        uuid leader_id FK
        int headcount "编制数"
        int order
        string external_id "得力 e+ ext_id"
        timestamp deleted_at "软删除"
    }

    Employee {
        uuid id PK
        uuid user_id FK,UK
        uuid company_id FK
        uuid department_id FK
        string employee_no UK "工号"
        string name
        string id_card "加密存储"
        string employment_type "formal/intern/consultant/labor"
        string status "probation/active/resigned"
        date hire_date
        string external_id "得力 e+ ext_id"
    }

    User {
        uuid id PK
        string username UK
        string password_hash "bcrypt"
        string email UK
        string status
        bool must_change_password
    }

    Role {
        uuid id PK
        string code UK "admin/hr/dept_head/executive/employee"
        string name
        json permissions "权限点数组"
    }

    UserRole {
        uuid user_id PK,FK
        uuid role_id PK,FK
        timestamp created_at
    }

    EmployeePositionHistory {
        uuid id PK
        uuid employee_id FK
        uuid department_id FK
        uuid position_id FK
        string old_value "JSON：部门 / 岗位 / 汇报关系 / 角色"
        string new_value "JSON"
        date effective_from
        date effective_to "null = 当前生效"
        uuid approval_instance_id FK "关联审批单"
        string change_reason
        timestamp created_at
    }

    SalaryHistory {
        uuid id PK
        uuid employee_id FK
        decimal old_base_salary
        decimal new_base_salary
        decimal old_performance_base
        decimal new_performance_base
        string old_fixed_floating_ratio "JSON"
        string new_fixed_floating_ratio "JSON"
        date effective_from
        date effective_to "null = 当前生效"
        uuid approval_instance_id FK
        string change_reason
        timestamp created_at
    }
```

**关键设计**：
- **Department** 自引用（`parent_id`）支持 4 级层级（V1.2 §2.2.1）
- **Department.leader_id** 关联 Employee 但不强制外键（避免循环依赖）
- **Employee ↔ User** 1:1 但 User 可空（部分人员如实习初期可能未建账号）
- **external_id** 一期可空，二期对接得力 e+ 时回写

### 3.2 审批流 + 通知 + 加密 + AI 数据模型

```mermaid
erDiagram
    ApprovalFlow ||--o{ ApprovalInstance : "模板→实例"
    ApprovalInstance ||--o{ ApprovalRecord : "实例→节点记录"
    NotificationTemplate ||--o{ NotificationLog : "模板→日志"
    EncryptedField ||--o{ EncryptedFieldAudit : "字段→访问审计"
    Integration ||--o{ IntegrationSyncLog : "集成→同步日志"
    AiDocument ||--o{ AiEmbedding : "文档→向量"
    AiDocument ||--o{ AiConversation : "文档→对话"
    User ||--o{ AiConversation : "用户→对话"
    User ||--o{ NotificationLog : "用户→通知"

    ApprovalFlow {
        uuid id PK
        string category "leave/transfer/..."
        string key "leave_default"
        string name
        int version
        json nodes "审批节点 JSON"
        timestamp created_at
    }

    ApprovalInstance {
        uuid id PK
        uuid flow_id FK
        string flow_key "冗余存储便于查询"
        string business_type "leave/transfer"
        uuid business_id "关联业务记录"
        string title
        uuid initiator_id FK
        string current_node_id
        string status "pending/approved/rejected/withdrawn"
        json data "业务数据"
        timestamp created_at
        timestamp updated_at
    }

    ApprovalRecord {
        uuid id PK
        uuid instance_id FK
        string node_id
        uuid approver_id FK
        string action "approve/reject/transfer/withdraw"
        text comment
        timestamp created_at
    }

    NotificationTemplate {
        uuid id PK
        string key UK "contract_expiring/..."
        string name
        text content_template "Handlebars 模板"
        json channels "email/sms/in_app"
    }

    NotificationLog {
        uuid id PK
        uuid user_id FK
        uuid template_id FK
        string channel
        string status "pending/sent/failed"
        text content
        int retry_count
        timestamp sent_at
    }

    EncryptedField {
        uuid id PK
        string table_name "employees.id_card"
        string column_name
        string encryption_algo "aes-256-gcm"
        int key_version
        json access_roles
    }

    EncryptedFieldAudit {
        uuid id PK
        uuid field_id FK
        uuid user_id FK
        string operation "encrypt/decrypt"
        uuid record_id
        string ip_address
        timestamp created_at
    }

    Integration {
        uuid id PK
        string code UK "esign/sms/email/llm/ocr"
        string name
        string type "http_api/webhook/..."
        json config "敏感字段加密"
        bool enabled
    }

    IntegrationSyncLog {
        uuid id PK
        uuid integration_id FK
        string status "success/failed"
        text error_message
        int record_count
        timestamp created_at
    }

    AiDocument {
        uuid id PK
        string title
        string source_type "employee_handbook/faq/policy"
        text content
        timestamp created_at
    }

    AiEmbedding {
        uuid id PK
        uuid document_id FK
        text chunk_text
        vector embedding "pgvector"
        int chunk_index
    }

    AiConversation {
        uuid id PK
        uuid user_id FK
        uuid document_id FK "命中的知识库文档"
        string question
        text answer
        json sources
        int tokens
        decimal cost
        timestamp created_at
    }
```

**关键设计**：
- **ApprovalFlow** 模板化，所有业务审批都复用
- **ApprovalInstance** 通过 `business_type` + `business_id` 关联到任意业务记录（请假/加班/调动/绩效/薪酬等）
- **NotificationLog** 完整记录发送状态与重试次数
- **EncryptedFieldAudit** 单独审计表（敏感字段访问必须留痕）
- **AiEmbedding** 用 pgvector 存储向量，启用 PostgreSQL 扩展
- **AiConversation** 关联 `user_id` + `document_id` 便于追溯

### 3.3 M3-D1 考核方案配置数据模型

```mermaid
erDiagram
    PerformanceCycle ||--o{ PerformanceScheme : "周期→方案"
    PerformanceScheme ||--o{ PerformanceSchemeIndicator : "方案→指标关联"
    PerformanceIndicator ||--o{ PerformanceSchemeIndicator : "指标→方案关联"
    PerformanceScheme ||--o{ PerformanceScheme : "复制来源"

    PerformanceCycle {
        uuid id PK
        string code UK
        string type "monthly/quarterly/yearly"
        date start_date
        date end_date
        string status "draft/active/closed"
    }

    PerformanceIndicator {
        uuid id PK
        string code UK
        string type "KPI/OKR/BSC/360"
        string status "active/archived"
    }

    PerformanceScheme {
        uuid id PK
        string code UK
        uuid cycle_id FK
        string applicable_scope
        string status "draft/active/archived"
    }

    PerformanceSchemeIndicator {
        uuid id PK
        uuid scheme_id FK
        uuid indicator_id FK
        decimal weight
    }

    PerformanceCoefficient {
        uuid id PK
        string grade "S/A/B/C/D"
        decimal coefficient
        date effective_from
        date effective_to
    }
```

### 3.4 M3-D2 考核流程数据模型

```mermaid
erDiagram
    PerformanceRecord ||--o{ PerformanceScore : "记录→评分"
    PerformanceScore ||--o{ PerformanceScoreItem : "评分→明细"
    PerformanceRecord ||--o{ PerformanceAiSuggestion : "记录→AI建议"
    PerformanceCycle ||--o{ PerformanceRecord : "周期→记录"
    PerformanceScheme ||--o{ PerformanceRecord : "方案→记录"
    Employee ||--o{ PerformanceRecord : "员工→记录"
    PerformanceIndicator ||--o{ PerformanceScoreItem : "指标→明细"

    PerformanceRecord {
        uuid id PK
        uuid employee_id FK
        uuid cycle_id FK
        uuid scheme_id FK
        string status "13 states"
        string final_grade "S/A/B/C/D nullable"
        decimal final_score
    }

    PerformanceScore {
        uuid id PK
        uuid record_id FK
        string stage "self/manager/calibrate/hr/ceo"
        decimal total_score
        boolean is_current
        int version
    }

    PerformanceScoreItem {
        uuid id PK
        uuid score_id FK
        uuid indicator_id FK
        decimal weight
        decimal score
        decimal weighted_score
    }

    PerformanceAiSuggestion {
        uuid id PK
        uuid record_id FK
        json suggestions
        string model_name
        int tokens
    }
```

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> manager_scoring : submitSelf
    manager_scoring --> dept_calibrating : submitManager
    dept_calibrating --> hr_summarizing : submitCalibration
    hr_summarizing --> ceo_approving : submitHr
    ceo_approving --> ceo_approved : ceoApprove
    ceo_approved --> archived : archive
    draft --> cancelled : cancel(HR)
    manager_scoring --> rejected : reject
    dept_calibrating --> rejected : reject
    ceo_approving --> rejected : reject
```

### 3.5 M3-D3 五档评分流程

```mermaid
flowchart LR
    A[ceo_approved + finalScore] --> B[calculateGrade]
    B --> C{thresholds}
    C -->|>=90| S[S]
    C -->|>=80| A1[A]
    C -->|>=70| B1[B]
    C -->|>=60| C1[C]
    C -->|<60| D[D]
    S --> E[update finalGrade]
    A1 --> E
    B1 --> E
    C1 --> E
    D --> E
    E --> F[calibrateDepartmentRatios warn_only]
```

### 3.6 M3-D4 绩效兑现 ER + 双轨制流程

```mermaid
erDiagram
    performance_payout_configs {
        uuid id PK
        varchar mode
        date effective_from
        date effective_to
        uuid created_by
    }
    performance_payouts {
        uuid id PK
        uuid employee_id FK
        uuid cycle_id FK
        date month
        varchar period
        varchar mode
        decimal base_amount
        decimal coefficient
        decimal actual_amount
        varchar status
    }
    employees ||--o{ performance_payouts : receives
    performance_cycles ||--o{ performance_payouts : cycle
```

```mermaid
flowchart TD
    A[archived record] --> B{mode}
    B -->|direct| C[base × coefficient]
    B -->|pool| D[deptPool × ratio]
    C --> E[performance_payouts]
    D --> E
    F[季度 M1/M2] --> G[prepay 50%]
    H[季度 M3] --> I[settle 多退少补]
```

### 3.7 M3-D5 销售提成 ER + 回款触发流程

```mermaid
erDiagram
    performance_sales_products {
        uuid id PK
        varchar code UK
        varchar name
        varchar category
        decimal base_rate
        varchar status
    }
    performance_sales_payments {
        uuid id PK
        uuid employee_id FK
        uuid product_id FK
        decimal amount
        date payment_date
        varchar period
        varchar status
        uuid confirmed_by_id
    }
    performance_sales_commissions {
        uuid id PK
        uuid employee_id FK
        uuid payment_id UK
        uuid product_id FK
        decimal base_amount
        decimal commission_rate
        decimal target_bonus_rate
        decimal final_amount
        varchar period
        varchar status
    }
    employees ||--o{ performance_sales_payments : registers
    employees ||--o{ performance_sales_commissions : earns
    performance_sales_products ||--o{ performance_sales_payments : for
    performance_sales_products ||--o{ performance_sales_commissions : rate
    performance_sales_payments ||--o| performance_sales_commissions : triggers
```

```mermaid
flowchart TD
    A[销售登记回款 draft] --> B[HR 确认到账]
    B --> C[status=confirmed]
    C --> D[calculateCommission]
    D --> E["finalAmount = amount × baseRate"]
    E --> F[status=calculated]
    F --> G[payoutCommission 标记 paid]
    G --> H[联动 M4 留独立任务]
```

### 3.8 M3-D6 结果应用 ER + PIP 流程

```mermaid
erDiagram
    performance_pips {
        uuid id PK
        uuid employee_id FK
        date start_date
        date end_date
        varchar status
        text reason
        text outcome
    }
    performance_pip_reviews {
        uuid id PK
        uuid pip_id FK
        int review_month
        date review_date
        varchar rating
        uuid reviewer_id
    }
    employees ||--o{ performance_pips : subject
    performance_pips ||--o{ performance_pip_reviews : monthly
```

```mermaid
flowchart TD
    A[近 4 季度 archived] --> B{S/A 比例}
    B -->|S ≥ 50%| C[提议调薪 10%]
    B -->|A ≥ 50%| D[提议调薪 5%]
    B -->|其他| E[不调薪]
    C --> F[audit_logs]
    D --> F
    G[近 2 年 A≥2 或 S≥1] --> H[提议晋升 audit_logs]
    I[连续 2 季度 D] --> J[performance_pips active]
    J --> K[月度评审 1/2/3]
    K -->|improved x3| L[completed]
    K -->|worsened| M[failed + audit 建议离职]
```

### 4.1 M4-C1 薪级薪档 + 员工薪酬方案 ER

```mermaid
erDiagram
    salary_grades {
        uuid id PK
        varchar sequence
        varchar grade_code
        varchar name
        decimal min_base_salary
        decimal max_base_salary
        decimal min_performance_base
        decimal max_performance_base
        varchar status
    }
    salary_grade_levels {
        uuid id PK
        uuid grade_id FK
        int level
        decimal base_salary
        decimal performance_base
        varchar status
    }
    employee_salary_plans {
        uuid id PK
        uuid employee_id FK
        uuid grade_id FK
        uuid level_id FK
        decimal base_salary
        decimal performance_base
        decimal allowance
        text welfare
        date effective_from
        date effective_to
        varchar status
    }
    employees ||--o{ employee_salary_plans : has
    salary_grades ||--o{ salary_grade_levels : contains
    salary_grades ||--o{ employee_salary_plans : referenced
    salary_grade_levels ||--o{ employee_salary_plans : referenced
```

```mermaid
flowchart TD
    A[定义薪级 M/T/P/S/A] --> B[每级 5-7 档递增]
    B --> C[为员工创建薪酬方案]
    C --> D[effectiveFrom 默认次月 1 日]
    D --> E[status=active]
    E --> F[C8 写入 employee_salary_history]
    F -.-> G[C1 不写 history]
```

### 4.2 M4-C2 社保公积金方案 ER

```mermaid
erDiagram
    social_insurance_schemes {
        uuid id PK
        varchar city
        varchar insurance_type
        decimal company_rate
        decimal personal_rate
        decimal base_min
        decimal base_max
        int base_adjustment_month
        varchar status
    }
    housing_fund_schemes {
        uuid id PK
        varchar city
        decimal company_rate
        decimal personal_rate
        decimal base_min
        decimal base_max
        varchar status
    }
    employee_insurance_registrations {
        uuid id PK
        uuid employee_id FK
        varchar city
        uuid social_insurance_scheme_id FK
        uuid housing_fund_scheme_id FK
        decimal base_salary
        date effective_from
        date effective_to
        varchar status
    }
    employees ||--o{ employee_insurance_registrations : registers
    social_insurance_schemes ||--o{ employee_insurance_registrations : matched
    housing_fund_schemes ||--o{ employee_insurance_registrations : matched
```

```mermaid
flowchart TD
    A[配置三地社保 5 险] --> B[配置三地公积金 5%-12%]
    B --> C[员工按参保地登记]
    C --> D[scheme.city 必须匹配]
    D --> E[status=active]
    E --> F[C3 按 baseSalary x rate 算扣]
    F -.-> G[C2 不算扣]
```

### 4.3 M4-C3 个税引擎（0 新表）

C3 为纯算法层：计算结果不落库，历史查询复用 `audit_logs`（action=`TAX_CALCULATE` / `TAX_YEAR_END_BONUS_CALCULATE` / `TAX_LABOR_INCOME_CALCULATE`）。算薪汇总与工资条持久化分别留 C4 / C5。

```mermaid
flowchart TD
    A[HR POST /salary/tax/calculate] --> B{税种}
    B -->|工资薪金| C[baseAmount - 起征点 5000]
    C --> D[7 级超额累进 + 速算扣除数]
    B -->|年终奖| E[bonusAmount / 12 找档]
    E --> F[bonusAmount x rate - 速算扣除]
    B -->|劳务报酬| G{收入是否 ≤4000}
    G -->|是| H[减 800]
    G -->|否| I[减 20%]
    H --> J[3 级 20/30/40%]
    I --> J
    D --> K[返回计算结果 + 写 audit]
    F --> K
    J --> K
    K --> L[GET /salary/tax/history 读 audit]
    L -.-> M[C5 payslips 持久化快照]
```

### 4.4 M4-C4 算薪批次 + 工资单 ER + 3 级审批

```mermaid
erDiagram
    payroll_runs ||--o{ payslips : contains
    payslips ||--o{ payslip_items : has
    employees ||--o{ payslips : receives
    payroll_runs {
        uuid id
        varchar period
        enum status
        decimal total_gross
        decimal total_net
        int anomaly_count
        boolean locked
    }
    payslips {
        uuid id
        uuid run_id
        uuid employee_id
        varchar period
        decimal gross_amount
        decimal net_amount
        enum status
    }
    payslip_items {
        uuid id
        uuid payslip_id
        enum item_type
        decimal amount
    }
```

```mermaid
flowchart TD
    A[HR 发起算薪 createPayrollRun] --> B[draft 写 payslips]
    B --> C[submit HR 提交]
    C --> D[submitted 财务复核]
    D -->|通过| E[reviewed]
    D -->|拒绝| B
    E --> F[CEO approve]
    F --> G[approved]
    G --> H[lock 锁定]
    B --> I[AI summarize 对比上月]
    I -.-> J[C5 工资条 PDF]
```

### 4.5 M4-C5 工资条 / 银企 / 个税申报 / 工资表（0 新表）

```mermaid
flowchart LR
    A[approved/locked payslip] --> B[generatePayslip HTML+mock PDF]
    B --> C[deliverPayslip]
    C --> D[M0.5-2 sendNotification]
    A --> E[banking-export icbc/ccb/cmb mock]
    A --> F[tax-declare mock 台账]
    A --> G[report-export excel/pdf mock]
```

### 4.6 M4-C6 销售提成季度结算（与 D5 联动）

```mermaid
flowchart TD
    A[D5 paid commissions 只读] --> B[4 维度汇总 employee/dept/product/report]
    A --> C[createSettlement 按财年季度汇总]
    C --> D{status}
    D -->|pending_confirm| E[hr 兼任 confirm]
    D -->|draft / pending_confirm| F[cancel]
    E --> G[confirmed 终态]
    F --> H[cancelled 终态]
    G --> I[mock 不写 payslip_items / 不联动 C4]
    B --> J[getReport mockMode true]
```

## 四、变更记录

| 版本 | 日期 | 变更说明 | 变更人 |
|---|---|---|---|
| V1.0 | 2026-08-25 | 初稿，7 业务流程 + 1 架构图 + 2 ER 图 | WorkBuddy AI |
| V1.2-C3 | 2026-08-27 | 追加 §4.3 M4-C3 个税计算流程图（0 新表，无 ER） | Cursor |
| V1.2-C4 | 2026-08-27 | 追加 §4.4 M4-C4 payroll_runs/payslips ER + 3 级审批流 | Cursor |
| V1.2-C5 | 2026-08-27 | 追加 §4.5 M4-C5 工资条/银企/个税/报表流程图（0 新表） | Cursor |
| V1.2-C6 | 2026-08-27 | 追加 §4.6 M4-C6 销售提成季度结算流程图（1 新表） | Cursor |

---

**— 文档结束 —**
