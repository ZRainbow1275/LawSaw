# Kubernetes 部署（蓝绿 / 金丝雀）模板

本目录提供 **Argo Rollouts** 驱动的蓝绿/金丝雀发布模板，用于补齐“零停机发布 + 可回滚”的企业级上线能力。

## 前置条件

1. 集群已安装 Argo Rollouts（CRD + controller）。
2. 集群已安装 NGINX Ingress Controller（`ingressClassName: nginx`）。
3. 已准备好命名空间（例如 `law-eye`）。
4. 已完成 TLS 证书与 mTLS CA 准备（推荐 cert-manager + ClusterIssuer）。
5. 已创建 `Secret`：`law-eye-secrets`（至少包含 `LAW_EYE__DATABASE__URL`、`LAW_EYE__REDIS__URL` 等运行所需环境变量）。

> 说明：本模板不在仓库内存放任何真实密钥；请使用外部 Secret 管理（KMS/External Secrets/Vault 等）。

## 目录结构

- `base/`：公共 Service（stable/preview/canary）+ Ingress（HTTPS 强制）+ NetworkPolicy
- `overlays/bluegreen/`：蓝绿发布 Rollout（`preview` → `promote`）
- `overlays/canary/`：金丝雀发布 Rollout（分阶段权重 + pause）

## TLS / mTLS 基线（生产必做）

`base/ingress.yaml` 已内置两条入口策略：

1. `law-eye-api-public`
- 强制 HTTP→HTTPS (`ssl-redirect`, `force-ssl-redirect`)
- TLS 1.2/1.3 + HSTS
- 支持 cert-manager 自动续期注解（`cluster-issuer`, `renew-before`, `private-key-rotation-policy=Always`）

2. `law-eye-api-internal`
- 强制 HTTPS
- 启用客户端证书校验（mTLS）：
  - `nginx.ingress.kubernetes.io/auth-tls-verify-client: on`
  - `nginx.ingress.kubernetes.io/auth-tls-secret: <namespace>/law-eye-client-ca`

若手工 `kubectl apply -k`，上线前请根据真实域名改写 `base/ingress.yaml` 中默认 host：
- `law-eye.example.com`
- `law-eye-internal.example.com`

并确保以下 Secret 可用：
- `law-eye-public-tls`（公网证书）
- `law-eye-internal-tls`（内网证书）
- `law-eye-client-ca`（用于 mTLS 的 `ca.crt`）

> 若使用 cert-manager 自动签发，确保 `ClusterIssuer` 已存在且名称与注解一致。
> 若使用外部 KMS/PKI，下发证书后同样需要创建上述 TLS Secret。

CI/CD 门禁说明：
- `deploy.yml` 在 `apply` 前会渲染 overlay 并注入命名空间到 mTLS secret 引用。
- `deploy.yml` 在 `apply` 前要求传入 `public_host` / `internal_host`，并自动注入到 Ingress host。
- `public_host` / `internal_host` 需要是不同的 FQDN（非 IP、非 URL）。
- 若渲染结果仍含占位符、或检测到 `*.example.com` 占位域名，会直接阻断部署。
- 若不使用 `deploy.yml` 而是手工 `kubectl apply -k`，发布前必须将 `base/ingress.yaml` 的 host 改为真实域名。

## 使用方式（kubectl）

蓝绿发布：
```bash
kubectl apply -k infra/k8s/overlays/bluegreen -n law-eye
```

金丝雀发布：
```bash
kubectl apply -k infra/k8s/overlays/canary -n law-eye
```

更新镜像（示例）：
```bash
kubectl -n law-eye patch rollout law-eye-api --type='json' -p='[
  {"op":"replace","path":"/spec/template/spec/containers/0/image","value":"ghcr.io/<owner>/<repo>/api:v2.6.0"}
]'
```

## 蓝绿 / 金丝雀控制（kubectl-argo-rollouts）

建议安装插件 `kubectl-argo-rollouts`，然后：

- 查看状态：
  ```bash
  kubectl argo rollouts status law-eye-api -n law-eye --timeout 10m
  ```
- 蓝绿 promote：
  ```bash
  kubectl argo rollouts promote law-eye-api -n law-eye
  ```
- 金丝雀 abort：
  ```bash
  kubectl argo rollouts abort law-eye-api -n law-eye
  ```
- 回滚到上一个稳定版本：
  ```bash
  kubectl argo rollouts undo law-eye-api -n law-eye
  ```

## GitHub Actions

仓库内提供手动发布工作流：`.github/workflows/deploy.yml`，支持：

- `apply`：应用 overlay + 设置镜像
- `promote` / `abort` / `rollback`：控制 Rollout 状态机

需要在仓库 Secrets 中配置：
- `KUBE_CONFIG_B64`：`kubeconfig` 的 base64 编码内容（仅用于 GitHub Actions Runner）
