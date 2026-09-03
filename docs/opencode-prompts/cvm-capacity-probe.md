# 腾讯云 CVM 容量采集提示词（HRMS 部署评估前置）

> 用途：在腾讯云服务器上用 opencode 执行**只读**采集，输出结构化报告；
> 报告将用于评估"是否跑得动 HRMS（Docker Compose：Express + PG16(pgvector) + Redis + BullMQ + Nginx 前端）"以及是否需要升配/扩容。

---

【任务】腾讯云 CVM 硬件与系统容量采集

【背景】计划在此服务器以 Docker Compose 部署 HRMS（Node/Express + PostgreSQL 16(pgvector) + Redis + BullMQ 后台任务 + Nginx 静态前端）。请采集该服务器的硬件规格、系统状态、Docker 环境与端口占用，输出一份结构化报告，供容量评估。

【执行要求】
- 全部为**只读**命令：不得安装任何软件、不得修改系统配置、不得重启服务、不得写/删文件、不得执行 docker 的任何写操作（build/run/exec/stop 都不行，仅允许 version/info/ps）。
- 不需要 sudo；若个别只读命令因权限失败，注明"无权限"即可，不要尝试提权。
- 不要读取任何密钥/敏感文件（如 .env、~/.ssh/*、云 API 密钥）。
- 报告直接在终端输出 Markdown（不要写文件），我会把它转贴给分析师。

【采集项与命令】

## 1. 系统信息
```
uname -a
cat /etc/os-release | head -3
hostnamectl 2>/dev/null | head -6 || true
uptime
```

## 2. CPU
```
nproc                                  # 逻辑核数
lscpu | grep -E 'Model name|^CPU\(s\)|Thread|Core|MHz|Architecture' || true
cat /proc/loadavg                      # 1/5/15 分钟负载（对照核数）
```

## 3. 内存
```
free -h
grep -E 'MemTotal|SwapTotal' /proc/meminfo
```

## 4. 磁盘（容量 + 盘型 SSD/HHD）
```
df -hT
lsblk -o NAME,SIZE,TYPE,ROTA,MOUNTPOINT    # ROTA=0 为 SSD，1 为机械盘
df -i / | tail -1                           # 根分区 inode（容器多镜像时重要）
```

## 5. Docker 环境与现状
```
docker --version 2>/dev/null || echo "Docker 未安装"
docker compose version 2>/dev/null || true
docker info 2>/dev/null | grep -E 'Server Version|Total Memory|Images|Containers|Storage Driver' || true
docker ps 2>/dev/null || true               # 现有运行容器（判断端口/资源冲突）
```

## 6. 端口占用（判断是否可让出 80/443/3001/5432/6379）
```
ss -tlnp 2>/dev/null | grep -E ':(22|80|443|3000|3001|5173|5432|6379|8080|3306)\b' || echo "无上述端口监听"
```

## 7. 当前负载与内存占用大户
```
top -bn1 | head -16 || true
ps aux --sort=-%mem | head -10 || true
```

## 8. 网络（带宽请到腾讯云控制台确认）
```
ip addr show | grep -E 'inet ' || true
curl -s --max-time 5 ifconfig.me && echo "  <- 公网出口 IP"
# 带宽：控制台查看（如 按固定带宽 5Mbps / 按流量计费），命令无法读出，请在报告注明
```

## 9. 腾讯云元数据（可选；失败直接忽略，不重试）
```
curl -s --max-time 3 http://metadata.tencentyun.com/latest/meta-data/instance/instance-type || true
curl -s --max-time 3 http://metadata.tencentyun.com/latest/meta-data/placement/region || true
```

## 10. 轻量 CPU 基线（可选，仅当 sysbench 已存在）
```
command -v sysbench >/dev/null && sysbench cpu --threads="$(nproc)" --time=10 run 2>/dev/null | grep -E 'events per second|total number of events' || echo "sysbench 未安装（跳过，不安装）"
```

【输出格式】Markdown 分节输出：每节给出关键字段的**原值**（例如 `nproc → 4`、`MemTotal → 16GiB`），并注明任何异常（磁盘将满、端口被占、负载高、docker 已跑服务等）。最后附一行总结建议（可选）。

---

【后续】分析师将依据报告对照 HRMS 的容量需求（参考：100 人并发目标、docker 全家桶常驻内存预算 ~3-4GB、构建镜像瞬时峰值、备份 30 天磁盘占用）给出"够用 / 需升配 / 需扩容"结论。
