pub fn normalize_cron_schedule(raw: &str) -> Result<String, String> {
    let parts: Vec<&str> = raw.split_whitespace().collect();
    if parts.is_empty() {
        return Err("schedule cannot be empty".to_string());
    }

    let normalized = match parts.len() {
        5 => format!("0 {}", parts.join(" ")),
        6 => parts.join(" "),
        other => {
            return Err(format!(
                "invalid cron expression field count: expected 5 or 6, got {}",
                other
            ))
        }
    };

    normalized
        .parse::<cron::Schedule>()
        .map_err(|err| format!("invalid cron expression: {}", err))?;

    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::normalize_cron_schedule;

    #[test]
    fn normalizes_five_field_cron() {
        let value = normalize_cron_schedule("0 */6 * * *").expect("normalize five field cron");
        assert_eq!(value, "0 0 */6 * * *");
    }

    #[test]
    fn preserves_six_field_cron() {
        let value = normalize_cron_schedule("0 0 9 * * 1").expect("normalize six field cron");
        assert_eq!(value, "0 0 9 * * 1");
    }

    #[test]
    fn rejects_invalid_field_count() {
        let error =
            normalize_cron_schedule("0 0 9 *").expect_err("invalid field count should fail");
        assert!(error.contains("field count"));
    }
}
