use tracing::warn;

fn parse_env_bool(raw: &str) -> Option<bool> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Some(true),
        "0" | "false" | "no" | "off" | "" => Some(false),
        _ => None,
    }
}

fn env_bool_with_default(name: &str, default: bool) -> bool {
    match std::env::var(name) {
        Ok(raw) => match parse_env_bool(&raw) {
            Some(value) => value,
            None => {
                warn!(
                    env = name,
                    value = %raw,
                    default,
                    "invalid boolean env value; using default"
                );
                default
            }
        },
        Err(_) => default,
    }
}

pub fn is_production() -> bool {
    env_bool_with_default("PRODUCTION", false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_env_bool_accepts_common_true_and_false_values() {
        assert_eq!(parse_env_bool("true"), Some(true));
        assert_eq!(parse_env_bool("1"), Some(true));
        assert_eq!(parse_env_bool("yes"), Some(true));
        assert_eq!(parse_env_bool("on"), Some(true));

        assert_eq!(parse_env_bool("false"), Some(false));
        assert_eq!(parse_env_bool("0"), Some(false));
        assert_eq!(parse_env_bool("no"), Some(false));
        assert_eq!(parse_env_bool("off"), Some(false));
        assert_eq!(parse_env_bool(""), Some(false));
    }

    #[test]
    fn parse_env_bool_rejects_invalid_values() {
        assert_eq!(parse_env_bool("maybe"), None);
        assert_eq!(parse_env_bool("truthy"), None);
    }
}
