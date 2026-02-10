use super::AppConfig;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use std::time::Duration;
use tokio::sync::RwLock;

/// 运行期配置容器，支持按周期热重载并携带版本号。
#[derive(Clone)]
pub struct ConfigRuntime {
    inner: Arc<RwLock<AppConfig>>,
    revision: Arc<AtomicU64>,
}

impl ConfigRuntime {
    /// 使用当前配置快照初始化运行期配置容器。
    pub fn new(initial: AppConfig) -> Self {
        Self {
            inner: Arc::new(RwLock::new(initial)),
            revision: Arc::new(AtomicU64::new(1)),
        }
    }

    /// 返回当前配置快照。
    pub async fn snapshot(&self) -> AppConfig {
        self.inner.read().await.clone()
    }

    /// 返回当前配置修订号。
    pub fn revision(&self) -> u64 {
        self.revision.load(Ordering::Relaxed)
    }

    /// 触发一次配置重载；配置变化时返回 `true` 并递增修订号。
    pub async fn reload_once(&self) -> crate::Result<bool> {
        let next = AppConfig::load().await?;
        let mut current = self.inner.write().await;

        let changed = format!("{:?}", &*current) != format!("{:?}", &next);
        if changed {
            *current = next;
            self.revision.fetch_add(1, Ordering::Relaxed);
        }

        Ok(changed)
    }

    /// 启动后台周期重载任务。
    pub fn spawn_auto_reload(&self, interval_seconds: u64) -> tokio::task::JoinHandle<()> {
        let runtime = self.clone();
        let interval = Duration::from_secs(interval_seconds.max(1));

        tokio::spawn(async move {
            loop {
                tokio::time::sleep(interval).await;
                match runtime.reload_once().await {
                    Ok(true) => {
                        tracing::info!(
                            revision = runtime.revision(),
                            "configuration hot reload applied"
                        );
                    }
                    Ok(false) => {}
                    Err(err) => {
                        tracing::warn!(error = %err, "configuration hot reload failed");
                    }
                }
            }
        })
    }
}
