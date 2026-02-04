use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use tokio::sync::Mutex;

#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    pub failure_threshold: u32,
    pub open_duration: Duration,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            open_duration: Duration::from_secs(30),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct CircuitBreakerCheck {
    pub allowed: bool,
    pub retry_after_seconds: Option<u64>,
}

#[derive(Debug)]
struct CircuitBreakerState {
    status: CircuitStatus,
    consecutive_failures: u32,
    open_until: Option<Instant>,
    half_open_in_progress: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CircuitStatus {
    Closed,
    Open,
    HalfOpen,
}

/// A small, dependency-free circuit breaker.
///
/// Design goals:
/// - predictable behavior (closed -> open -> half-open probe -> closed/open)
/// - fast failure when open
/// - safe under concurrency via a single async mutex
#[derive(Debug, Clone)]
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: Arc<Mutex<CircuitBreakerState>>,
}

impl CircuitBreaker {
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            state: Arc::new(Mutex::new(CircuitBreakerState {
                status: CircuitStatus::Closed,
                consecutive_failures: 0,
                open_until: None,
                half_open_in_progress: false,
            })),
        }
    }

    /// Checks if a call is allowed right now.
    ///
    /// If the circuit is open, returns `allowed=false` and an optional `retry_after_seconds`
    /// indicating how long until a half-open probe is allowed.
    pub async fn check(&self) -> CircuitBreakerCheck {
        let now = Instant::now();
        let mut state = self.state.lock().await;

        match state.status {
            CircuitStatus::Closed => CircuitBreakerCheck {
                allowed: true,
                retry_after_seconds: None,
            },
            CircuitStatus::Open => {
                let Some(open_until) = state.open_until else {
                    // Defensive: if state is inconsistent, reset to closed to avoid deadlocks.
                    state.status = CircuitStatus::Closed;
                    state.consecutive_failures = 0;
                    return CircuitBreakerCheck {
                        allowed: true,
                        retry_after_seconds: None,
                    };
                };

                if now >= open_until {
                    state.status = CircuitStatus::HalfOpen;
                    state.half_open_in_progress = true;
                    CircuitBreakerCheck {
                        allowed: true,
                        retry_after_seconds: None,
                    }
                } else {
                    let remaining = open_until.saturating_duration_since(now);
                    CircuitBreakerCheck {
                        allowed: false,
                        retry_after_seconds: Some(remaining.as_secs().max(1)),
                    }
                }
            }
            CircuitStatus::HalfOpen => {
                if state.half_open_in_progress {
                    CircuitBreakerCheck {
                        allowed: false,
                        retry_after_seconds: Some(1),
                    }
                } else {
                    state.half_open_in_progress = true;
                    CircuitBreakerCheck {
                        allowed: true,
                        retry_after_seconds: None,
                    }
                }
            }
        }
    }

    pub async fn record_success(&self) {
        let mut state = self.state.lock().await;
        state.consecutive_failures = 0;

        match state.status {
            CircuitStatus::Closed => {}
            CircuitStatus::Open => {}
            CircuitStatus::HalfOpen => {
                state.status = CircuitStatus::Closed;
                state.open_until = None;
            }
        }

        state.half_open_in_progress = false;
    }

    pub async fn record_failure(&self) {
        let mut state = self.state.lock().await;
        state.consecutive_failures = state.consecutive_failures.saturating_add(1);

        let should_open = state.consecutive_failures >= self.config.failure_threshold.max(1);
        match state.status {
            CircuitStatus::Closed => {
                if should_open {
                    state.status = CircuitStatus::Open;
                    state.open_until = Some(Instant::now() + self.config.open_duration);
                }
            }
            CircuitStatus::Open => {
                state.open_until = Some(Instant::now() + self.config.open_duration);
            }
            CircuitStatus::HalfOpen => {
                // Probe failed -> open again.
                state.status = CircuitStatus::Open;
                state.open_until = Some(Instant::now() + self.config.open_duration);
            }
        }

        state.half_open_in_progress = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn opens_after_threshold() {
        let cb = CircuitBreaker::new(CircuitBreakerConfig {
            failure_threshold: 2,
            open_duration: Duration::from_secs(10),
        });

        assert!(cb.check().await.allowed);
        cb.record_failure().await;
        assert!(cb.check().await.allowed);
        cb.record_failure().await;

        let check = cb.check().await;
        assert!(!check.allowed);
        assert!(check.retry_after_seconds.is_some());
    }
}

