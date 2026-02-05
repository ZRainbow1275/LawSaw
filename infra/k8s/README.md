# Kubernetes 部署（蓝绿 / 金丝雀）模板

本目录提供 **Argo Rollouts** 驱动的蓝绿/金丝雀发布模板，用于补齐“零停机发布 + 可回滚”的企业级上线能力。

## 前置条件

1. 集群已安装 Argo Rollouts（CRD + controller）。
2. 已准备好命名空间（例如 `law-eye`）。
3. 已创建 `Secret`：`law-eye-secrets`（至少包含 `LAW_EYE__DATABASE__URL`、`LAW_EYE__REDIS__URL` 等运行所需环境变量）。

> 说明：本模板不在仓库内存放任何真实密钥；请使用外部 Secret 管理（KMS/External Secrets/Vault 等）。

## 目录结构

- `base/`：公共 Service（stable/preview/canary）
- `overlays/bluegreen/`：蓝绿发布 Rollout（`preview` → `promote`）
- `overlays/canary/`：金丝雀发布 Rollout（分阶段权重 + pause）

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
